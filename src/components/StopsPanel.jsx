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
  if (basis === "trip") return "Trip match";
  if (basis === "vehicle") return "Vehicle match";
  return "No realtime stop matches";
}

export default function StopsPanel({ bus, departuresModel, loading, error }) {
  const departures = departuresModel?.items || [];
  const basis = departuresModel?.basis || "none";

  if (!bus) {
    return <p className="app-stops-empty">Select a bus on the map to view upcoming stops.</p>;
  }

  return (
    <div className="app-stops-content">
      <div className="app-stops-meta">
        <p className="app-stops-route">Route {bus.routeId || "Unknown"}</p>
        {bus.vehicleModel && <p className="app-stops-basis">Model {bus.vehicleModel}</p>}
        <p className="app-stops-basis">{basisLabel(basis)}</p>
      </div>

      {error && <p className="app-stops-error">{error}</p>}

      {loading && !departures.length && <p className="app-stops-empty">Loading stops...</p>}

      {!loading && !departures.length && !error && (
        <p className="app-stops-empty">No upcoming stops were found for this bus.</p>
      )}

      {!!departures.length && (
        <ul className="app-stops-list">
          {departures.map((departure) => (
            <li key={departure.id} className="app-stops-row">
              <div>
                <p className="app-stops-stop">
                  {departure.stopName || departure.stopId || "Unknown stop"}
                  {Number.isFinite(departure.stopSequence) ? ` (#${departure.stopSequence})` : ""}
                </p>
                <p className="app-stops-trip">Trip {departure.tripId || "N/A"}</p>
              </div>
              <div className="app-stops-time">
                <p className="app-stops-clock">{formatDepartureClock(departure.eventTimeMs)}</p>
                <p className="app-stops-relative">{formatRelativeTime(departure.eventTimeMs)}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
