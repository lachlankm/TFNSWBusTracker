const STOP_NAMES_LOOKUP_PATH = "/api/stop-names";
const REQUEST_CHUNK_SIZE = 250;

const stopNamesByIdCache = new Map();
const unresolvedStopIds = new Set();

function normalizeStopIds(stopIds) {
  if (!Array.isArray(stopIds)) {
    return [];
  }

  return [...new Set(stopIds.map((stopId) => String(stopId || "").trim()).filter(Boolean))];
}

function buildResultMap(stopIds) {
  const result = new Map();
  for (const stopId of stopIds) {
    const stopName = stopNamesByIdCache.get(stopId);
    if (stopName) {
      result.set(stopId, stopName);
    }
  }
  return result;
}

function chunkArray(items, chunkSize) {
  const chunks = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }
  return chunks;
}

async function requestStopNamesChunk(stopIds, signal) {
  const response = await fetch(
    `${STOP_NAMES_LOOKUP_PATH}?ids=${encodeURIComponent(stopIds.join(","))}`,
    {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      signal,
    }
  );

  if (!response.ok) {
    const bodyText = await response.text();
    throw new Error(
      `${response.status} ${response.statusText}: ${bodyText || "Unable to fetch stop names."}`
    );
  }

  const payload = await response.json();
  const namesObject = payload?.stopNamesById;
  const missingIds = Array.isArray(payload?.missingIds)
    ? payload.missingIds.map((id) => String(id || "").trim()).filter(Boolean)
    : [];

  if (namesObject && typeof namesObject === "object") {
    for (const [stopId, stopName] of Object.entries(namesObject)) {
      const normalizedId = String(stopId || "").trim();
      const normalizedName = String(stopName || "").trim();
      if (!normalizedId || !normalizedName) {
        continue;
      }
      unresolvedStopIds.delete(normalizedId);
      stopNamesByIdCache.set(normalizedId, normalizedName);
    }
  }

  for (const stopId of missingIds) {
    if (!stopNamesByIdCache.has(stopId)) {
      unresolvedStopIds.add(stopId);
    }
  }
}

export async function fetchStopNamesByIds(stopIds, { signal } = {}) {
  const normalizedStopIds = normalizeStopIds(stopIds);
  if (!normalizedStopIds.length) {
    return new Map();
  }

  const missingStopIds = normalizedStopIds.filter(
    (stopId) => !stopNamesByIdCache.has(stopId) && !unresolvedStopIds.has(stopId)
  );

  if (missingStopIds.length) {
    const chunks = chunkArray(missingStopIds, REQUEST_CHUNK_SIZE);
    for (const chunk of chunks) {
      await requestStopNamesChunk(chunk, signal);
    }
  }

  return buildResultMap(normalizedStopIds);
}
