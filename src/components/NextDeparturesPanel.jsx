function formatDepartureClock(timestampMs) {
  return new Date(timestampMs).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatRelativeTime(timestampMs) {
  const diffMs = timestampMs - Date.now();
  const diffMinutes = Math.round(diffMs / 60_000);

  if (diffMinutes <= 0) return "Due";
  if (diffMinutes === 1) return "In 1 min";
  return `In ${diffMinutes} mins`;
}

function basisLabel(basis) {
  if (basis === "trip") return "Matched by trip";
  if (basis === "vehicle") return "Matched by vehicle";
  if (basis === "route") return "Matched by route";
  return "No realtime departures available";
}

export default function NextDeparturesPanel({
  bus,
  departuresModel,
  loading,
  error,
  lastUpdatedMs,
}) {
  const departures = departuresModel?.items || [];
  const basis = departuresModel?.basis || "none";

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Next departures</h2>
          <p className="mt-1 text-xs text-slate-500">
            {bus
              ? `Route ${bus.routeId || "Unknown"} - ${basisLabel(basis)}`
              : "Select a bus to view upcoming departures"}
          </p>
        </div>
        <p className="text-xs text-slate-500">
          Updated: {lastUpdatedMs ? new Date(lastUpdatedMs).toLocaleTimeString() : "Never"}
        </p>
      </div>

      {error && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{error}</p>}

      {!bus && (
        <p className="mt-3 text-sm text-slate-500">Pick a bus from the list or map to load departures.</p>
      )}

      {bus && loading && !departures.length && (
        <p className="mt-3 text-sm text-slate-500">Loading next departures...</p>
      )}

      {bus && !loading && !departures.length && !error && (
        <p className="mt-3 text-sm text-slate-500">
          No upcoming departures were found in the current realtime feed.
        </p>
      )}

      {!!departures.length && (
        <ul className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-100">
          {departures.map((departure) => (
            <li key={departure.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <div>
                <p className="text-sm font-medium text-slate-900">
                  Stop {departure.stopId || "Unknown"}
                  {Number.isFinite(departure.stopSequence) ? ` (#${departure.stopSequence})` : ""}
                </p>
                <p className="text-xs text-slate-500">Trip {departure.tripId || "N/A"}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-slate-900">
                  {formatDepartureClock(departure.eventTimeMs)}
                </p>
                <p className="text-xs text-slate-500">{formatRelativeTime(departure.eventTimeMs)}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
