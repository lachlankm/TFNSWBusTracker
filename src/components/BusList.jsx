import { useMemo } from "react";

export default function BusList({ buses, selectedBusId, onSelectBus }) {
  const sortedBuses = useMemo(
    () =>
      [...buses].sort((a, b) => {
        const routeA = a.routeId || "";
        const routeB = b.routeId || "";
        return routeA.localeCompare(routeB) || a.id.localeCompare(b.id);
      }),
    [buses]
  );

  if (!sortedBuses.length) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
        No buses match your search right now.
      </div>
    );
  }

  return (
    <div className="h-[28rem] overflow-auto rounded-xl border border-slate-200 bg-white">
      <ul className="divide-y divide-slate-100">
        {sortedBuses.map((bus) => {
          const isSelected = bus.id === selectedBusId;
          return (
            <li key={bus.id}>
              <button
                type="button"
                onClick={() => onSelectBus(bus.id)}
                className={`w-full px-4 py-3 text-left transition ${
                  isSelected ? "bg-brand-50" : "hover:bg-slate-50"
                }`}
              >
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      Route {bus.routeId || "Unknown"}
                    </p>
                    <p className="text-xs text-slate-500">
                      Vehicle {bus.vehicleLabel || bus.vehicleId || "N/A"}
                    </p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600">
                    {bus.speedKmh != null ? `${bus.speedKmh} km/h` : "Speed N/A"}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500">Trip {bus.tripId || "N/A"}</p>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}