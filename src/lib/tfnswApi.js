import { decodeBusVehiclePositions } from "./gtfsRealtime";

const DEFAULT_PROXY_PATH = "/api/gtfs/vehiclepos/buses";
const DEFAULT_DIRECT_URL = "https://api.transport.nsw.gov.au/v1/gtfs/vehiclepos/buses";

function buildRequestPlan() {
  const directUrl = import.meta.env.VITE_TFNSW_VEHICLE_POSITIONS_URL?.trim();
  const apiKey = import.meta.env.VITE_TFNSW_API_KEY?.trim();
  const isDev = import.meta.env.DEV;

  if (directUrl) {
    return [
      {
        label: "direct-url",
        url: directUrl,
        headers: apiKey ? { Authorization: `apikey ${apiKey}` } : {},
      },
    ];
  }

  const plan = [];

  // Vite proxy exists in `npm run dev`, so try it first in development.
  if (isDev) {
    plan.push({
      label: "vite-proxy",
      url: DEFAULT_PROXY_PATH,
      headers: {},
    });
  }

  // Outside dev (or as fallback), use direct endpoint when a browser key is provided.
  if (apiKey) {
    plan.push({
      label: "direct-default",
      url: DEFAULT_DIRECT_URL,
      headers: { Authorization: `apikey ${apiKey}` },
    });
  }

  // Final fallback for deployments that provide their own reverse proxy.
  if (!isDev) {
    plan.push({
      label: "app-proxy",
      url: DEFAULT_PROXY_PATH,
      headers: {},
    });
  }

  return plan;
}

function withProtoAcceptHeader(headers) {
  return {
    Accept: "application/x-google-protobuf",
    ...headers,
  };
}

export async function fetchSydneyBuses({ signal } = {}) {
  const requestPlan = buildRequestPlan();
  if (!requestPlan.length) {
    throw new Error(
      "TFNSW config missing. In dev, set TFNSW_API_KEY in .env and restart Vite. " +
        "For direct browser mode, set VITE_TFNSW_API_KEY (and optional VITE_TFNSW_VEHICLE_POSITIONS_URL)."
    );
  }

  const errors = [];
  for (const request of requestPlan) {
    try {
      const response = await fetch(request.url, {
        method: "GET",
        headers: withProtoAcceptHeader(request.headers),
        signal,
      });

      if (!response.ok) {
        const bodyText = await response.text();
        errors.push(
          `${request.label} ${response.status} ${response.statusText}: ${
            bodyText || "No response body"
          }`
        );
        continue;
      }

      const buffer = await response.arrayBuffer();
      return decodeBusVehiclePositions(buffer);
    } catch (error) {
      if (error?.name === "AbortError") {
        throw error;
      }
      errors.push(`${request.label} network error: ${error?.message || "Failed to fetch"}`);
    }
  }

  throw new Error(
    `Unable to reach TFNSW feed. Tried ${requestPlan
      .map((request) => request.label)
      .join(", ")}. Details: ${errors.join(" | ")}`
  );
}
