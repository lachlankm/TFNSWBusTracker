const MAX_DEFAULT_DEPARTURES = 6;
const MIN_PAST_GRACE_MS = 60_000;

function normalizeDeparture(departure, matchType) {
  return {
    id: `${departure.tripId}:${departure.stopId}:${departure.eventTimeMs}`,
    routeId: departure.routeId,
    tripId: departure.tripId,
    stopId: departure.stopId,
    stopSequence: departure.stopSequence,
    eventTimeMs: departure.eventTimeMs,
    vehicleId: departure.vehicleId,
    vehicleLabel: departure.vehicleLabel,
    source: "trip-updates",
    matchType,
  };
}

function flattenTripUpdateStops(update, nowMs, matchType) {
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
        matchType
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

export function buildNextDepartures({ bus, tripUpdates, nowMs = Date.now(), limit = MAX_DEFAULT_DEPARTURES }) {
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
      const items = flattenTripUpdateStops(tripMatch, nowMs, "trip").slice(0, limit);
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
          .flatMap((update) => flattenTripUpdateStops(update, nowMs, "vehicle"))
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

  if (bus.routeId) {
    const routeMatches = updates.filter((update) => update.routeId && update.routeId === bus.routeId);
    if (routeMatches.length) {
      const items = uniqueById(
        routeMatches
          .flatMap((update) => flattenTripUpdateStops(update, nowMs, "route"))
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
