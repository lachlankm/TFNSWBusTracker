import { useCallback, useEffect, useMemo, useState } from "react";
import BusList from "./components/BusList";
import BusMap from "./components/BusMap";
import NextDeparturesPanel from "./components/NextDeparturesPanel";
import SearchBar from "./components/SearchBar";
import { useDebouncedValue } from "./hooks/useDebouncedValue";
import { buildNextDepartures } from "./lib/nextDepartures";
import { fetchSydneyBuses } from "./lib/tfnswApi";
import { fetchBusTripUpdates } from "./lib/tfnswTripUpdatesApi";

const REFRESH_INTERVAL_MS = 20_000;
const MAP_SEARCH_DEBOUNCE_MS = 250;

function formatLastUpdated(timestamp) {
  if (!timestamp) return "Never";
  return new Date(timestamp).toLocaleTimeString();
}

function busMatchesSearch(bus, normalizedQuery) {
  if (!normalizedQuery) return true;
  return (bus.routeId || "").toLowerCase().includes(normalizedQuery);
}

export default function App() {
  const [searchInput, setSearchInput] = useState("");
  const [buses, setBuses] = useState([]);
  const [tripUpdates, setTripUpdates] = useState([]);
  const [selectedBusId, setSelectedBusId] = useState(null);
  const [trackedBusId, setTrackedBusId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tripUpdatesError, setTripUpdatesError] = useState("");
  const [lastUpdatedMs, setLastUpdatedMs] = useState(0);
  const [tripUpdatesUpdatedMs, setTripUpdatesUpdatedMs] = useState(0);

  const loadBuses = useCallback(async (signal) => {
    try {
      setError("");
      setTripUpdatesError("");
      const [busesResult, tripUpdatesResult] = await Promise.allSettled([
        fetchSydneyBuses({ signal }),
        fetchBusTripUpdates({ signal }),
      ]);

      if (busesResult.status === "rejected") {
        if (busesResult.reason?.name === "AbortError") {
          throw busesResult.reason;
        }
        throw busesResult.reason;
      }

      const items = busesResult.value;
      setBuses(items);
      setLastUpdatedMs(Date.now());

      if (tripUpdatesResult.status === "fulfilled") {
        setTripUpdates(tripUpdatesResult.value);
        setTripUpdatesError("");
        setTripUpdatesUpdatedMs(Date.now());
      } else if (tripUpdatesResult.reason?.name === "AbortError") {
        throw tripUpdatesResult.reason;
      } else {
        setTripUpdates([]);
        setTripUpdatesError(tripUpdatesResult.reason?.message || "Unable to fetch trip updates.");
      }

      setSelectedBusId((currentSelectedId) => {
        if (!items.length) return null;
        if (!currentSelectedId) return items[0].id;
        if (items.some((item) => item.id === currentSelectedId)) {
          return currentSelectedId;
        }
        return currentSelectedId;
      });

      setTrackedBusId((currentTrackedId) => {
        if (!currentTrackedId) return null;
        if (items.some((item) => item.id === currentTrackedId)) {
          return currentTrackedId;
        }
        return currentTrackedId;
      });
    } catch (requestError) {
      if (requestError.name !== "AbortError") {
        setError(requestError.message || "Unable to fetch buses.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initialController = new AbortController();
    let refreshController = null;

    loadBuses(initialController.signal);

    const intervalId = setInterval(() => {
      if (refreshController) {
        refreshController.abort();
      }

      refreshController = new AbortController();
      loadBuses(refreshController.signal);
    }, REFRESH_INTERVAL_MS);

    return () => {
      initialController.abort();
      if (refreshController) {
        refreshController.abort();
      }
      clearInterval(intervalId);
    };
  }, [loadBuses]);

  const normalizedSearchQuery = useMemo(() => searchInput.trim().toLowerCase(), [searchInput]);
  const mapSearchQuery = useDebouncedValue(normalizedSearchQuery, MAP_SEARCH_DEBOUNCE_MS);

  const filteredBusesForList = useMemo(
    () => buses.filter((bus) => busMatchesSearch(bus, normalizedSearchQuery)),
    [buses, normalizedSearchQuery]
  );

  const filteredBusesForMap = useMemo(
    () => buses.filter((bus) => busMatchesSearch(bus, mapSearchQuery)),
    [buses, mapSearchQuery]
  );

  const selectedBus = useMemo(() => buses.find((bus) => bus.id === selectedBusId) || null, [
    buses,
    selectedBusId,
  ]);

  const trackedBus = useMemo(() => buses.find((bus) => bus.id === trackedBusId) || null, [
    buses,
    trackedBusId,
  ]);

  const departuresTargetBus = useMemo(
    () => selectedBus || trackedBus || null,
    [selectedBus, trackedBus]
  );

  const departuresModel = useMemo(
    () =>
      buildNextDepartures({
        bus: departuresTargetBus,
        tripUpdates,
      }),
    [departuresTargetBus, tripUpdates]
  );

  const activeRouteCount = useMemo(() => {
    const routes = new Set(filteredBusesForList.map((bus) => bus.routeId).filter(Boolean));
    return routes.size;
  }, [filteredBusesForList]);

  const trackingStatus = useMemo(() => {
    if (!trackedBusId) return "Tracking: off";
    if (trackedBus) {
      const route = trackedBus.routeId || "Unknown";
      const vehicle = trackedBus.vehicleLabel || trackedBus.vehicleId || "N/A";
      return `Tracking route ${route} (${vehicle})`;
    }
    return "Tracking paused (bus unavailable)";
  }, [trackedBus, trackedBusId]);

  const handleSelectBus = useCallback((busId, options = {}) => {
    setSelectedBusId(busId);
    if (options.track) {
      setTrackedBusId(busId);
    }
  }, []);

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <header className="mb-6 rounded-2xl bg-gradient-to-r from-brand-700 to-brand-500 p-5 text-white">
          <h1 className="text-2xl font-bold">Sydney Bus Tracker</h1>
          <p className="mt-1 text-sm text-blue-50">
            Real-time bus locations from Transport for NSW GTFS vehicle positions.
          </p>
          <p className="mt-3 text-xs text-blue-100">
            Last updated: {formatLastUpdated(lastUpdatedMs)} | Refreshing every 20 seconds
          </p>
        </header>

        <section className="mb-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Buses visible</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{filteredBusesForList.length}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Active routes</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{activeRouteCount}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Status</p>
            <p className="mt-1 text-sm font-semibold text-slate-800">
              {loading ? "Loading feed..." : "Live"}
            </p>
            <p className="mt-1 text-xs text-slate-500">{trackingStatus}</p>
          </div>
        </section>

        <div className="mb-4">
          <SearchBar value={searchInput} onChange={setSearchInput} />
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-800">
            {error}
          </div>
        )}

        <section className="grid gap-4 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <BusList
              buses={filteredBusesForList}
              selectedBusId={selectedBusId}
              onSelectBus={handleSelectBus}
            />
          </div>
          <div className="lg:col-span-3">
            <BusMap
              buses={filteredBusesForMap}
              selectedBusId={selectedBus?.id || null}
              trackedBusId={trackedBus?.id || null}
              onSelectBus={handleSelectBus}
            />
          </div>
        </section>

        <section className="mt-4">
          <NextDeparturesPanel
            bus={departuresTargetBus}
            departuresModel={departuresModel}
            loading={loading}
            error={tripUpdatesError}
            lastUpdatedMs={tripUpdatesUpdatedMs}
          />
        </section>
      </div>
    </main>
  );
}
