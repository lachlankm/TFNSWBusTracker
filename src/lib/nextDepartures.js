const MAX_DEFAULT_DEPARTURES = 6;
const MIN_PAST_GRACE_MS = 60_000;

function buildDepartureId(departure) {
  const routeKey = departure.routeId || "_";
  const tripKey = departure.tripId || "_";
  const vehicleKey = departure.vehicleId || "_";
  const stopKey = departure.stopId || "_";
  const stopSequenceKey = Number.isFinite(departure.stopSequence) ? String(departure.stopSequence) : "_";
  return [routeKey, tripKey, vehicleKey, stopKey, stopSequenceKey, departure.eventTimeMs].join(":");
}

function normalizeDeparture(departure, matchType, stopNamesById) {
  const stopId = departure.stopId || "";
  const stopName = stopId && stopNamesById instanceof Map ? stopNamesById.get(stopId) || "" : "";

  return {
    id: buildDepartureId(departure),
    routeId: departure.routeId,
    tripId: departure.tripId,
    stopId,
    stopName,
    stopSequence: departure.stopSequence,
    eventTimeMs: departure.eventTimeMs,
    vehicleId: departure.vehicleId,
    vehicleLabel: departure.vehicleLabel,
    source: "trip-updates",
    matchType,
  };
}

function flattenTripUpdateStops(update, nowMs, matchType, stopNamesById) {
  return (update.stops || [])
    .filter((stop) => stop.eventTimeMs >= nowMs - MIN_PAST_GRACE_MS)
    .map((stop) =>
      normalizeDeparture(
        {
          routeId: update.routeId || "",
          tripId: update.tripId || "",
          vehicleId: update.vehicleId || "",
          vehicleLabel: update.vehicleLabel || "",
          stopId: stop.stopId || "",
          stopSequence: stop.stopSequence ?? null,
          eventTimeMs: stop.eventTimeMs,
        },
        matchType,
        stopNamesById
      )
    );
}

function uniqueById(items) {
  const seen = new Set();
  return items.filter((item) => {
    if (seen.has(item.id)) {
      return false;
    }
    seen.add(item.id);
    return true;
  });
}

export function buildNextDepartures({
  bus,
  tripUpdates,
  stopNamesById = null,
  nowMs = Date.now(),
  limit = MAX_DEFAULT_DEPARTURES,
  includeRouteFallback = true,
}) {
  // Keep this normalized model source-agnostic so GTFS static timetable data can be merged later.
  if (!bus) {
    return {
      basis: "none",
      items: [],
    };
  }

  const updates = Array.isArray(tripUpdates) ? tripUpdates : [];
  if (!updates.length) {
    return {
      basis: "none",
      items: [],
    };
  }

  if (bus.tripId) {
    const tripMatch = updates.find((update) => update.tripId && update.tripId === bus.tripId);
    if (tripMatch) {
      const items = flattenTripUpdateStops(tripMatch, nowMs, "trip", stopNamesById).slice(0, limit);
      if (items.length) {
        return {
          basis: "trip",
          items,
        };
      }
    }
  }

  if (bus.vehicleId) {
    const vehicleMatches = updates.filter(
      (update) => update.vehicleId && update.vehicleId === bus.vehicleId
    );
    if (vehicleMatches.length) {
      const items = uniqueById(
        vehicleMatches
          .flatMap((update) => flattenTripUpdateStops(update, nowMs, "vehicle", stopNamesById))
          .sort((a, b) => a.eventTimeMs - b.eventTimeMs)
      ).slice(0, limit);
      if (items.length) {
        return {
          basis: "vehicle",
          items,
        };
      }
    }
  }

  if (includeRouteFallback && bus.routeId) {
    const routeMatches = updates.filter((update) => update.routeId && update.routeId === bus.routeId);
    if (routeMatches.length) {
      const items = uniqueById(
        routeMatches
          .flatMap((update) => flattenTripUpdateStops(update, nowMs, "route", stopNamesById))
          .sort((a, b) => a.eventTimeMs - b.eventTimeMs)
      ).slice(0, limit);
      if (items.length) {
        return {
          basis: "route",
          items,
        };
      }
    }
  }

  return {
    basis: "none",
    items: [],
  };
}
