import { strFromU8, unzipSync } from "fflate";
import Papa from "papaparse";

const STOP_NAMES_ENDPOINT_PATH = "/api/stop-names";
const STATIC_STOPS_ENDPOINTS = [
  "https://api.transport.nsw.gov.au/v1/gtfs/schedule/buses",
  "https://api.transport.nsw.gov.au/v1/gtfs/schedule/sydney-buses",
];
const STOP_NAMES_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

let stopNamesByIdCache = null;
let stopNamesByIdCacheLoadedAtMs = 0;
let stopNamesByIdPromise = null;

function writeJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function parseStopsCsv(stopsCsvText) {
  const parsed = Papa.parse(String(stopsCsvText || "").replace(/^\uFEFF/, ""), {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => String(header || "").replace(/^\uFEFF/, "").trim().toLowerCase(),
  });

  if (parsed.errors?.length && !parsed.data?.length) {
    const firstError = parsed.errors[0];
    throw new Error(
      `Unable to parse GTFS stops.txt (${firstError?.message || "unknown parse error"}).`
    );
  }

  const stopNamesById = new Map();
  for (const row of parsed.data || []) {
    const stopId = String(row?.stop_id || "").trim();
    const stopName = String(row?.stop_name || "").trim();
    if (!stopId || !stopName) {
      continue;
    }
    stopNamesById.set(stopId, stopName);
  }

  if (!stopNamesById.size) {
    throw new Error("GTFS stops feed contained no valid stop names.");
  }

  return stopNamesById;
}

function isZipPayload(arrayBuffer, contentType) {
  if (String(contentType || "").toLowerCase().includes("zip")) {
    return true;
  }
  const bytes = new Uint8Array(arrayBuffer);
  return bytes.length > 3 && bytes[0] === 0x50 && bytes[1] === 0x4b;
}

function parseStopsPayload(arrayBuffer, contentType) {
  if (isZipPayload(arrayBuffer, contentType)) {
    const zipEntries = unzipSync(new Uint8Array(arrayBuffer));
    const stopsFileName = Object.keys(zipEntries).find((name) =>
      name.toLowerCase().endsWith("stops.txt")
    );
    if (!stopsFileName) {
      throw new Error("GTFS static ZIP did not include stops.txt.");
    }
    return parseStopsCsv(strFromU8(zipEntries[stopsFileName]));
  }

  return parseStopsCsv(new TextDecoder().decode(arrayBuffer));
}

async function loadStopNamesById(tfnswApiKey) {
  const errors = [];

  for (const endpoint of STATIC_STOPS_ENDPOINTS) {
    try {
      const response = await fetch(endpoint, {
        method: "GET",
        headers: {
          Accept: "application/zip, text/csv;q=0.9, */*;q=0.1",
          ...(tfnswApiKey ? { Authorization: `apikey ${tfnswApiKey}` } : {}),
        },
      });

      if (!response.ok) {
        const bodyText = await response.text();
        errors.push(
          `${endpoint} ${response.status} ${response.statusText}: ${bodyText || "No response body"}`
        );
        continue;
      }

      const arrayBuffer = await response.arrayBuffer();
      return parseStopsPayload(arrayBuffer, response.headers.get("content-type"));
    } catch (error) {
      errors.push(`${endpoint} fetch/decode failed: ${error?.message || "Unknown error"}`);
    }
  }

  throw new Error(
    `Unable to fetch GTFS static stops. Tried ${STATIC_STOPS_ENDPOINTS.join(", ")}. Details: ${errors.join(
      " | "
    )}`
  );
}

async function getStopNamesById(tfnswApiKey) {
  const nowMs = Date.now();
  if (
    stopNamesByIdCache instanceof Map &&
    nowMs - stopNamesByIdCacheLoadedAtMs < STOP_NAMES_CACHE_TTL_MS
  ) {
    return stopNamesByIdCache;
  }

  if (!stopNamesByIdPromise) {
    stopNamesByIdPromise = loadStopNamesById(tfnswApiKey)
      .then((stopNamesById) => {
        stopNamesByIdCache = stopNamesById;
        stopNamesByIdCacheLoadedAtMs = Date.now();
        return stopNamesById;
      })
      .finally(() => {
        stopNamesByIdPromise = null;
      });
  }

  return stopNamesByIdPromise;
}

function parseRequestedStopIds(searchParams) {
  const stopIds = new Set();
  const rawValues = [...searchParams.getAll("ids"), ...searchParams.getAll("id")];

  for (const rawValue of rawValues) {
    for (const id of String(rawValue || "").split(",")) {
      const normalizedId = id.trim();
      if (normalizedId) {
        stopIds.add(normalizedId);
      }
    }
  }

  return [...stopIds];
}

function createStopNamesHandler(tfnswApiKey) {
  return async (req, res, next) => {
    const requestUrl = new URL(req.url || "", "http://localhost");
    if (requestUrl.pathname !== STOP_NAMES_ENDPOINT_PATH) {
      next();
      return;
    }

    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      writeJson(res, 405, { error: "Method not allowed" });
      return;
    }

    const stopIds = parseRequestedStopIds(requestUrl.searchParams);
    if (!stopIds.length) {
      writeJson(res, 400, { error: "Provide at least one stop id via ?ids=id1,id2" });
      return;
    }

    try {
      const stopNamesById = await getStopNamesById(tfnswApiKey);
      const resolvedStopNamesById = {};
      for (const stopId of stopIds) {
        const stopName = stopNamesById.get(stopId);
        if (stopName) {
          resolvedStopNamesById[stopId] = stopName;
        }
      }
      const missingIds = stopIds.filter(
        (stopId) => !Object.prototype.hasOwnProperty.call(resolvedStopNamesById, stopId)
      );
      res.setHeader("Cache-Control", "no-store");
      writeJson(res, 200, {
        stopNamesById: resolvedStopNamesById,
        missingIds,
      });
    } catch (error) {
      writeJson(res, 502, { error: error?.message || "Unable to load stop names." });
    }
  };
}

export function stopNamesProxyPlugin({ tfnswApiKey }) {
  return {
    name: "tfnsw-stop-names-proxy",
    configureServer(server) {
      server.middlewares.use(createStopNamesHandler(tfnswApiKey));
    },
    configurePreviewServer(server) {
      server.middlewares.use(createStopNamesHandler(tfnswApiKey));
    },
  };
}
