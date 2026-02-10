import { memo, useEffect, useMemo } from "react";
import L from "leaflet";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";

const SYDNEY_CENTER = [-33.8688, 151.2093];

function hasCoordinates(bus) {
  return Number.isFinite(bus?.lat) && Number.isFinite(bus?.lon);
}

function createBusIcon(isTrackedOrSelected) {
  const emoji = isTrackedOrSelected ? "\u{1F68D}" : "\u{1F68C}";
  const className = isTrackedOrSelected
    ? "bus-emoji-marker bus-emoji-marker-selected"
    : "bus-emoji-marker";

  return L.divIcon({
    className,
    html: `<span>${emoji}</span>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

const DEFAULT_BUS_ICON = createBusIcon(false);
const HIGHLIGHTED_BUS_ICON = createBusIcon(true);

function MapViewportController({ trackedBus }) {
  const map = useMap();

  useEffect(() => {
    if (!hasCoordinates(trackedBus)) {
      return;
    }

    map.flyTo([trackedBus.lat, trackedBus.lon], 14, {
      duration: 0.8,
    });
  }, [map, trackedBus?.id, trackedBus?.lat, trackedBus?.lon]);

  return null;
}

function BusMap({ buses, selectedBusId, trackedBusId, onSelectBus }) {
  const selectedBus = useMemo(
    () => buses.find((bus) => bus.id === selectedBusId) || null,
    [buses, selectedBusId]
  );

  const trackedBus = useMemo(
    () => buses.find((bus) => bus.id === trackedBusId) || null,
    [buses, trackedBusId]
  );

  const center = useMemo(() => {
    if (hasCoordinates(trackedBus)) {
      return [trackedBus.lat, trackedBus.lon];
    }
    if (hasCoordinates(selectedBus)) {
      return [selectedBus.lat, selectedBus.lon];
    }
    return SYDNEY_CENTER;
  }, [selectedBus, trackedBus]);

  return (
    <div className="h-[28rem] overflow-hidden rounded-xl border border-slate-200 bg-white">
      <MapContainer center={center} zoom={11} scrollWheelZoom className="h-full w-full">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <MapViewportController trackedBus={trackedBus} />

        {buses.map((bus) => {
          const isSelected = bus.id === selectedBus?.id;
          const isTracked = bus.id === trackedBus?.id;
          const icon = isSelected || isTracked ? HIGHLIGHTED_BUS_ICON : DEFAULT_BUS_ICON;
          return (
            <Marker
              key={bus.id}
              position={[bus.lat, bus.lon]}
              icon={icon}
              eventHandlers={{
                click: () => onSelectBus(bus.id, { track: true }),
              }}
            >
              <Popup>
                <div className="text-sm">
                  <div className="font-semibold">Route {bus.routeId || "Unknown"}</div>
                  <div>Vehicle: {bus.vehicleLabel || bus.vehicleId || "N/A"}</div>
                  <div>Trip: {bus.tripId || "N/A"}</div>
                  <div>Speed: {bus.speedKmh != null ? `${bus.speedKmh} km/h` : "N/A"}</div>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
}

export default memo(BusMap);
