import { strFromU8, unzipSync } from "fflate";
import Papa from "papaparse";

const STATIC_STOPS_PROXY_PATHS = ["/api/gtfs-static/buses", "/api/gtfs-static/sydney-buses"];

let stopNamesByIdPromise = null;
let stopNamesByIdCache = null;

function parseStopsCsv(stopsCsvText) {
  const normalizedText = String(stopsCsvText || "").replace(/^\uFEFF/, "");
  const parsed = Papa.parse(normalizedText, {
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

function extractStopsCsvFromZip(arrayBuffer) {
  const zipEntries = unzipSync(new Uint8Array(arrayBuffer));
  const stopsFileName = Object.keys(zipEntries).find((name) =>
    name.toLowerCase().endsWith("stops.txt")
  );

  if (!stopsFileName) {
    throw new Error("GTFS static ZIP did not include stops.txt.");
  }

  return strFromU8(zipEntries[stopsFileName]);
}

async function loadStopNamesById() {
  const errors = [];

  for (const path of STATIC_STOPS_PROXY_PATHS) {
    const response = await fetch(path, {
      method: "GET",
      headers: {
        Accept: "application/zip",
      },
    });

    if (!response.ok) {
      const bodyText = await response.text();
      errors.push(
        `${path} ${response.status} ${response.statusText}: ${bodyText || "No response body"}`
      );
      continue;
    }

    const arrayBuffer = await response.arrayBuffer();
    const stopsCsvText = extractStopsCsvFromZip(arrayBuffer);
    return parseStopsCsv(stopsCsvText);
  }

  throw new Error(
    `Unable to fetch GTFS static stops. Tried ${STATIC_STOPS_PROXY_PATHS.join(", ")}. Details: ${errors.join(
      " | "
    )}`
  );
}

export async function fetchStopNamesById({ signal } = {}) {
  if (stopNamesByIdCache instanceof Map) {
    return stopNamesByIdCache;
  }

  if (!stopNamesByIdPromise) {
    stopNamesByIdPromise = loadStopNamesById()
      .then((stopNamesById) => {
        stopNamesByIdCache = stopNamesById;
        return stopNamesById;
      })
      .catch((error) => {
        stopNamesByIdPromise = null;
        throw error;
      });
  }

  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }

  if (signal) {
    return Promise.race([
      stopNamesByIdPromise,
      new Promise((_, reject) => {
        signal.addEventListener(
          "abort",
          () => reject(new DOMException("Aborted", "AbortError")),
          { once: true }
        );
      }),
    ]);
  }

  return stopNamesByIdPromise;
}
