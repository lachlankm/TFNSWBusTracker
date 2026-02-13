import { useCallback, useEffect, useMemo, useState } from "react";
import BusMap from "./components/BusMap";
import SearchBar from "./components/SearchBar";
import StopsPanel from "./components/StopsPanel";
import { useDebouncedValue } from "./hooks/useDebouncedValue";
import { getPublicRouteName } from "./lib/gtfsRealtime";
import { buildNextDepartures } from "./lib/nextDepartures";
import { fetchSydneyBuses } from "./lib/tfnswApi";
import { fetchStopNamesByIds } from "./lib/tfnswStaticStopsApi";
import { fetchBusTripUpdates } from "./lib/tfnswTripUpdatesApi";

const REFRESH_INTERVAL_MS = 10_000;
const MAP_SEARCH_DEBOUNCE_MS = 250;
const DESKTOP_OPEN_COLUMNS = "minmax(0, 7fr) minmax(20rem, 3fr)";
const DESKTOP_COLLAPSED_COLUMNS = "minmax(0, 1fr) 3.75rem";

function formatLastUpdated(timestamp) {
  if (!timestamp) return "Never";
  return new Date(timestamp).toLocaleTimeString();
}

function busMatchesSearch(bus, normalizedQuery) {
  if (!normalizedQuery) return true;
  const publicName = getPublicRouteName(bus.routeId).toLowerCase();
  return publicName.includes(normalizedQuery);
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
  const [stopNamesError, setStopNamesError] = useState("");
  const [stopNamesById, setStopNamesById] = useState(() => new Map());
  const [lastUpdatedMs, setLastUpdatedMs] = useState(0);
  const [isStopsCollapsed, setIsStopsCollapsed] = useState(false);

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
      } else if (tripUpdatesResult.reason?.name === "AbortError") {
        throw tripUpdatesResult.reason;
      } else {
        setTripUpdates([]);
        setTripUpdatesError(tripUpdatesResult.reason?.message || "Unable to fetch trip updates.");
      }

      setSelectedBusId((currentSelectedId) => {
        if (!items.length) return null;
        if (!currentSelectedId) return null;
        if (items.some((item) => item.id === currentSelectedId)) {
          return currentSelectedId;
        }
        return null;
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
    () =>
      mapSearchQuery === normalizedSearchQuery
        ? filteredBusesForList
        : buses.filter((bus) => busMatchesSearch(bus, mapSearchQuery)),
    [buses, filteredBusesForList, mapSearchQuery, normalizedSearchQuery]
  );

  const busesById = useMemo(() => new Map(buses.map((bus) => [bus.id, bus])), [buses]);

  const selectedBus = useMemo(
    () => (selectedBusId ? busesById.get(selectedBusId) || null : null),
    [busesById, selectedBusId]
  );

  const trackedBus = useMemo(
    () => (trackedBusId ? busesById.get(trackedBusId) || null : null),
    [busesById, trackedBusId]
  );

  const departuresTargetBus = useMemo(
    () => selectedBus || trackedBus || null,
    [selectedBus, trackedBus]
  );

  const departuresModelBase = useMemo(
    () =>
      buildNextDepartures({
        bus: departuresTargetBus,
        tripUpdates,
        stopNamesById: null,
        includeRouteFallback: false,
        limit: 10,
      }),
    [departuresTargetBus, tripUpdates]
  );

  const departureStopIds = useMemo(
    () => [...new Set(departuresModelBase.items.map((departure) => departure.stopId).filter(Boolean))],
    [departuresModelBase.items]
  );

  useEffect(() => {
    if (!departureStopIds.length) {
      setStopNamesError("");
      return;
    }

    const controller = new AbortController();

    fetchStopNamesByIds(departureStopIds, { signal: controller.signal })
      .then((resolvedStopNamesById) => {
        setStopNamesById((current) => {
          let hasChanges = false;
          const next = new Map(current);

          for (const [stopId, stopName] of resolvedStopNamesById) {
            if (next.get(stopId) === stopName) {
              continue;
            }
            hasChanges = true;
            next.set(stopId, stopName);
          }

          return hasChanges ? next : current;
        });
        setStopNamesError("");
      })
      .catch((loadError) => {
        if (loadError?.name === "AbortError") {
          return;
        }
        setStopNamesError(loadError?.message || "Unable to load stop names.");
      });

    return () => {
      controller.abort();
    };
  }, [departureStopIds]);

  const departuresModel = useMemo(
    () =>
      buildNextDepartures({
        bus: departuresTargetBus,
        tripUpdates,
        stopNamesById,
        includeRouteFallback: false,
        limit: 10,
      }),
    [departuresTargetBus, stopNamesById, tripUpdates]
  );

  const stopsPanelError = useMemo(
    () => [tripUpdatesError, stopNamesError].filter(Boolean).join(" | "),
    [stopNamesError, tripUpdatesError]
  );

  const activeRouteCount = useMemo(() => {
    const routes = new Set(filteredBusesForList.map((bus) => bus.routeId).filter(Boolean));
    return routes.size;
  }, [filteredBusesForList]);

  const trackingStatus = useMemo(() => {
    if (!trackedBusId) return "Tracking: off";
    if (trackedBus) {
      const route = getPublicRouteName(trackedBus.routeId) || "Unknown";
      const vehicle = trackedBus.vehicleLabel || trackedBus.vehicleId || "N/A";
      return `Tracking route ${route} (${vehicle})`;
    }
    return "Tracking paused (bus unavailable)";
  }, [trackedBus, trackedBusId]);

  const mainGridTemplate = isStopsCollapsed ? DESKTOP_COLLAPSED_COLUMNS : DESKTOP_OPEN_COLUMNS;
  const stopsPanelTitle = departuresTargetBus?.routeId
    ? `Stops (Route ${getPublicRouteName(departuresTargetBus.routeId)})`
    : "Stops";

  const handleSelectBus = useCallback((busId, options = {}) => {
    setSelectedBusId(busId);
    if (options.track) {
      setTrackedBusId(busId);
    }
  }, []);

  return (
    <main className="app-shell">
      <div className="mx-auto grid min-h-[100dvh] w-full max-w-7xl grid-rows-[auto_auto_auto_auto] gap-3 px-3 py-3 sm:px-4 sm:py-4 lg:h-[100dvh] lg:grid-rows-[auto_auto_minmax(0,1fr)_auto] lg:overflow-hidden lg:max-w-[108rem] lg:px-5 lg:py-5 3xl:max-w-[128rem] 3xl:px-6 4xl:max-w-[152rem]">
        <header className="h-card app-title-bar">
          <h1 className="app-title-text">Sydney Bus Tracker</h1>
          <p className="app-title-subtext">
            Real-time bus locations from Transport for NSW GTFS vehicle positions.
          </p>
          <p className="app-title-meta">
            Last updated: {formatLastUpdated(lastUpdatedMs)} | Refreshing every 20 seconds |{" "}
            {loading ? "Loading feed..." : "Live"}
          </p>
        </header>

        <section className="h-card app-search-card">
          <SearchBar value={searchInput} onChange={setSearchInput} />
          {error && <div className="app-error-banner app-error-inline">{error}</div>}
        </section>

        <section
          className="app-main-grid grid gap-3 lg:h-full lg:min-h-0 lg:grid-rows-[minmax(0,1fr)] lg:[grid-template-columns:var(--main-columns)]"
          style={{ "--main-columns": mainGridTemplate }}
        >
          <div className="h-card app-map-panel">
            <div className="app-panel-heading">
              <h2 className="app-panel-title">Map</h2>
            </div>
            <div className="app-map-surface">
              <BusMap
                buses={filteredBusesForMap}
                selectedBusId={selectedBus?.id || null}
                trackedBusId={trackedBus?.id || null}
                onSelectBus={handleSelectBus}
                layoutVersion={isStopsCollapsed}
              />
            </div>
          </div>

          <aside className={`h-card app-stops-panel ${isStopsCollapsed ? "is-collapsed" : ""}`}>
            <div className="app-panel-heading">
              <h2 className="app-panel-title">{isStopsCollapsed ? "S" : stopsPanelTitle}</h2>
              <button
                type="button"
                className="h-btn h-btn-primary app-collapse-btn"
                onClick={() => setIsStopsCollapsed((current) => !current)}
                aria-expanded={!isStopsCollapsed}
                aria-controls="stops-panel-body"
              >
                {isStopsCollapsed ? ">" : "<"}
              </button>
            </div>
            <div id="stops-panel-body" className="app-stops-body">
              <StopsPanel
                bus={departuresTargetBus}
                departuresModel={departuresModel}
                loading={loading}
                error={stopsPanelError}
              />
            </div>
          </aside>
        </section>

        <section className="h-card app-stats-bar">
          <div className="app-stats-grid">
            <article>
              <p className="app-stats-label">Buses visible</p>
              <p className="app-stats-value">{filteredBusesForList.length}</p>
            </article>
            <article>
              <p className="app-stats-label">Active routes</p>
              <p className="app-stats-value">{activeRouteCount}</p>
            </article>
            <article className="app-stats-span">
              <p className="app-stats-label">Status</p>
              <p className="app-stats-status">{loading ? "Loading feed..." : "Live"}</p>
              <p className="app-stats-note">{trackingStatus}</p>
            </article>
          </div>
        </section>
      </div>
    </main>
  );
}
