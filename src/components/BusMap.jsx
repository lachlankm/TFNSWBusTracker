import { memo, useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import { MapContainer, TileLayer, useMap, useMapEvents } from "react-leaflet";
import { getPublicRouteName } from "../lib/gtfsRealtime";

const SYDNEY_CENTER = [-33.8688, 151.2093];

function hasCoordinates(bus) {
  return Number.isFinite(bus?.lat) && Number.isFinite(bus?.lon);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function popupHtml(bus) {
  const route = escapeHtml(getPublicRouteName(bus.routeId) || "Unknown");
  const vehicle = escapeHtml(bus.vehicleLabel || bus.vehicleId || "N/A");
  const model = escapeHtml(bus.vehicleModel || "N/A");
  const trip = escapeHtml(bus.tripId || "N/A");
  const speed = bus.speedKmh != null ? `${bus.speedKmh} km/h` : "N/A";

  return `<div class="bus-popup">
  <div class="bus-popup-header">
  <span class="bus-popup-heading">Route:</span>  
  <span class="bus-popup-badge">${route}</span>
    
  </div>
  <div class="bus-popup-body">
    <div class="bus-popup-row">
      <span class="bus-popup-label">Vehicle:</span>
      <span class="bus-popup-value">${vehicle}</span>
    </div>
    <div class="bus-popup-row">
      <span class="bus-popup-label">Model:</span>
      <span class="bus-popup-value">${model}</span>
    </div>
    <div class="bus-popup-row">
      <span class="bus-popup-label">Trip:</span>
      <span class="bus-popup-value bus-popup-trip">${trip}</span>
    </div>
    <div class="bus-popup-row">
      <span class="bus-popup-label">Speed:</span>
      <span class="bus-popup-value">${speed}</span>
    </div>
  </div>
</div>`;
}

function createBusIcon(isTrackedOrSelected) {
  const emoji = isTrackedOrSelected ? "\u{1F68D}" : "\u{1F68C}";
  const className = isTrackedOrSelected
    ? "bus-emoji-marker bus-emoji-marker-selected"
    : "bus-emoji-marker";

  return L.divIcon({
    className,
    html: `<span>${emoji}</span>`,
    iconSize: isTrackedOrSelected ? [28, 28] : [24, 24],
    iconAnchor: isTrackedOrSelected ? [14, 14] : [12, 12],
  });
}

const DEFAULT_BUS_ICON = createBusIcon(false);
const HIGHLIGHTED_BUS_ICON = createBusIcon(true);

function MapViewportController({ trackedBus }) {
  const map = useMap();

  useEffect(() => {
    if (!hasCoordinates(trackedBus)) return;

    const target = L.latLng(trackedBus.lat, trackedBus.lon);
    const currentCenter = map.getCenter();
    const distanceMeters = currentCenter.distanceTo(target);

    if (distanceMeters < 35) return;

    const shouldAnimate = distanceMeters > 450;
    map.panTo(target, {
      animate: shouldAnimate,
      duration: shouldAnimate ? 0.35 : 0,
    });
  }, [map, trackedBus?.id, trackedBus?.lat, trackedBus?.lon]);

  return null;
}

function MapLayoutController({ layoutVersion }) {
  const map = useMap();

  useEffect(() => {
    let frameId = requestAnimationFrame(() => {
      map.invalidateSize();
    });
    const timeoutId = setTimeout(() => {
      map.invalidateSize();
    }, 160);

    return () => {
      cancelAnimationFrame(frameId);
      clearTimeout(timeoutId);
    };
  }, [layoutVersion, map]);

  useEffect(() => {
    if (typeof ResizeObserver === "undefined") return undefined;

    const container = map.getContainer();
    let frameId = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(() => {
        map.invalidateSize();
      });
    });

    observer.observe(container);

    return () => {
      observer.disconnect();
      cancelAnimationFrame(frameId);
    };
  }, [map]);

  return null;
}

function MapSelectionController({ onSelectBus }) {
  useMapEvents({
    click() {
      onSelectBus(null, { track: true });
    },
  });

  return null;
}

function EmojiBusLayer({ buses, selectedBusId, trackedBusId, onSelectBus }) {
  const map = useMap();
  const layerGroupRef = useRef(null);
  const markersByIdRef = useRef(new Map());
  const [renderBounds, setRenderBounds] = useState(null);

  useEffect(() => {
    if (!layerGroupRef.current) {
      layerGroupRef.current = L.layerGroup().addTo(map);
    }

    return () => {
      if (layerGroupRef.current) {
        layerGroupRef.current.remove();
        layerGroupRef.current = null;
      }
      markersByIdRef.current.clear();
    };
  }, [map]);

  useEffect(() => {
    const syncRenderBounds = () => {
      // Slightly pad bounds so markers near the edges are ready before entering viewport.
      setRenderBounds(map.getBounds().pad(0.2));
    };

    syncRenderBounds();
    map.on("moveend", syncRenderBounds);
    map.on("zoomend", syncRenderBounds);
    map.on("resize", syncRenderBounds);

    return () => {
      map.off("moveend", syncRenderBounds);
      map.off("zoomend", syncRenderBounds);
      map.off("resize", syncRenderBounds);
    };
  }, [map]);

  useEffect(() => {
    const layerGroup = layerGroupRef.current;
    if (!layerGroup || !renderBounds) return;

    const markersById = markersByIdRef.current;
    const seenIds = new Set();

    for (const bus of buses) {
      if (!hasCoordinates(bus)) continue;

      const isHighlighted = bus.id === selectedBusId || bus.id === trackedBusId;
      const isVisible = renderBounds.contains([bus.lat, bus.lon]);
      if (!isVisible && !isHighlighted) {
        continue;
      }

      seenIds.add(bus.id);
      const nextIcon = isHighlighted ? HIGHLIGHTED_BUS_ICON : DEFAULT_BUS_ICON;
      const nextLatLng = [bus.lat, bus.lon];
      const nextPopupHtml = popupHtml(bus);

      let marker = markersById.get(bus.id);
      if (!marker) {
        marker = L.marker(nextLatLng, { icon: nextIcon });
        marker.on("click", () => onSelectBus(bus.id, { track: true }));
        marker.bindPopup(nextPopupHtml);
        marker.addTo(layerGroup);
        markersById.set(bus.id, marker);
        continue;
      }

      const currentLatLng = marker.getLatLng();
      if (currentLatLng.lat !== bus.lat || currentLatLng.lng !== bus.lon) {
        marker.setLatLng(nextLatLng);
      }
      marker.setIcon(nextIcon);
      marker.setPopupContent(nextPopupHtml);
    }

    for (const [id, marker] of markersById) {
      if (seenIds.has(id)) continue;
      layerGroup.removeLayer(marker);
      marker.off();
      markersById.delete(id);
    }
  }, [buses, onSelectBus, renderBounds, selectedBusId, trackedBusId]);

  return null;
}

function BusMap({ buses, selectedBusId, trackedBusId, onSelectBus, layoutVersion }) {
  const selectedBus = useMemo(
    () => buses.find((bus) => bus.id === selectedBusId) || null,
    [buses, selectedBusId]
  );

  const trackedBus = useMemo(
    () => buses.find((bus) => bus.id === trackedBusId) || null,
    [buses, trackedBusId]
  );

  const center = useMemo(() => {
    if (hasCoordinates(trackedBus)) return [trackedBus.lat, trackedBus.lon];
    if (hasCoordinates(selectedBus)) return [selectedBus.lat, selectedBus.lon];
    return SYDNEY_CENTER;
  }, [selectedBus, trackedBus]);

  return (
    <div className="h-full min-h-0 overflow-hidden rounded-2xl">
      <MapContainer center={center} zoom={11} scrollWheelZoom className="h-full w-full">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <MapViewportController trackedBus={trackedBus} />
        <MapLayoutController layoutVersion={layoutVersion} />
        <MapSelectionController onSelectBus={onSelectBus} />
        <EmojiBusLayer
          buses={buses}
          selectedBusId={selectedBusId}
          trackedBusId={trackedBusId}
          onSelectBus={onSelectBus}
        />
      </MapContainer>
    </div>
  );
}

export default memo(BusMap);
