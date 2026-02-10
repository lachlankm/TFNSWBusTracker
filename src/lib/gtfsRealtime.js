import protobuf from "protobufjs";

const GTFS_REALTIME_PROTO = `
syntax = "proto2";
package transit_realtime;

message FeedMessage {
  required FeedHeader header = 1;
  repeated FeedEntity entity = 2;
}

message FeedHeader {
  required string gtfs_realtime_version = 1;
  optional uint64 timestamp = 3;
}

message FeedEntity {
  required string id = 1;
  optional bool is_deleted = 2 [default = false];
  optional TripUpdate trip_update = 3;
  optional VehiclePosition vehicle = 4;
  optional Alert alert = 5;
}

message TripUpdate {
  optional TripDescriptor trip = 1;
  repeated StopTimeUpdate stop_time_update = 2;
  optional VehicleDescriptor vehicle = 3;
  optional uint64 timestamp = 4;
  optional int32 delay = 5;
}

message StopTimeUpdate {
  optional uint32 stop_sequence = 1;
  optional StopTimeEvent arrival = 2;
  optional StopTimeEvent departure = 3;
  optional string stop_id = 4;
  optional uint32 schedule_relationship = 5;
}

message StopTimeEvent {
  optional int32 delay = 1;
  optional int64 time = 2;
  optional int32 uncertainty = 3;
}

message Alert {}

message TripDescriptor {
  optional string trip_id = 1;
  optional string start_time = 2;
  optional string start_date = 3;
  optional uint32 schedule_relationship = 4;
  optional string route_id = 5;
  optional uint32 direction_id = 6;
}

message VehicleDescriptor {
  optional string id = 1;
  optional string label = 2;
  optional string license_plate = 3;
}

message Position {
  optional float latitude = 1;
  optional float longitude = 2;
  optional float bearing = 3;
  optional double odometer = 4;
  optional float speed = 5;
}

message VehiclePosition {
  optional TripDescriptor trip = 1;
  optional Position position = 2;
  optional uint32 current_stop_sequence = 3;
  optional uint64 timestamp = 5;
  optional string stop_id = 7;
  optional VehicleDescriptor vehicle = 8;
}
`;

const root = protobuf.parse(GTFS_REALTIME_PROTO).root;
const FeedMessage = root.lookupType("transit_realtime.FeedMessage");

function toNumber(value) {
  if (value == null) return null;
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  if (typeof value.toNumber === "function") return value.toNumber();
  return Number(value);
}

function isInSydneyBounds(lat, lon) {
  return lat >= -34.2 && lat <= -33.3 && lon >= 150.5 && lon <= 151.5;
}

function toTimestampMs(value) {
  const asNumber = toNumber(value);
  if (!Number.isFinite(asNumber)) return null;
  return asNumber * 1000;
}

export function decodeBusVehiclePositions(arrayBuffer) {
  const message = FeedMessage.decode(new Uint8Array(arrayBuffer));
  const object = FeedMessage.toObject(message, {
    longs: Number,
    enums: String,
    defaults: false,
  });

  const entities = object.entity || [];

  return entities
    .map((entity) => {
      const vehicle = entity.vehicle;
      const position = vehicle?.position;

      if (!vehicle || !position) {
        return null;
      }

      const lat = toNumber(position.latitude);
      const lon = toNumber(position.longitude);

      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        return null;
      }

      if (!isInSydneyBounds(lat, lon)) {
        return null;
      }

      const speedMs = toNumber(position.speed);
      const timestamp = toNumber(vehicle.timestamp);

      return {
        id: entity.id,
        lat,
        lon,
        bearing: toNumber(position.bearing) ?? 0,
        routeId: vehicle.trip?.routeId || "",
        tripId: vehicle.trip?.tripId || "",
        vehicleId: vehicle.vehicle?.id || "",
        vehicleLabel: vehicle.vehicle?.label || "",
        stopId: vehicle.stopId || "",
        speedKmh: Number.isFinite(speedMs) ? Math.round(speedMs * 3.6) : null,
        timestamp: Number.isFinite(timestamp) ? timestamp : null,
      };
    })
    .filter(Boolean);
}

function toStopEventTimestampMs(stopUpdate) {
  const departureMs = toTimestampMs(stopUpdate?.departure?.time);
  if (departureMs != null) {
    return departureMs;
  }
  return toTimestampMs(stopUpdate?.arrival?.time);
}

export function decodeBusTripUpdates(arrayBuffer) {
  const message = FeedMessage.decode(new Uint8Array(arrayBuffer));
  const object = FeedMessage.toObject(message, {
    longs: Number,
    enums: String,
    defaults: false,
  });

  const entities = object.entity || [];

  return entities
    .map((entity) => {
      const tripUpdate = entity.tripUpdate;
      if (!tripUpdate) {
        return null;
      }

      const stops = (tripUpdate.stopTimeUpdate || [])
        .map((stopUpdate) => {
          const eventTimeMs = toStopEventTimestampMs(stopUpdate);
          if (eventTimeMs == null) {
            return null;
          }

          return {
            stopId: stopUpdate.stopId || "",
            stopSequence: toNumber(stopUpdate.stopSequence),
            eventTimeMs,
            scheduleRelationship: toNumber(stopUpdate.scheduleRelationship),
          };
        })
        .filter(Boolean)
        .sort((a, b) => a.eventTimeMs - b.eventTimeMs);

      if (!stops.length) {
        return null;
      }

      return {
        id: entity.id,
        routeId: tripUpdate.trip?.routeId || "",
        tripId: tripUpdate.trip?.tripId || "",
        vehicleId: tripUpdate.vehicle?.id || "",
        vehicleLabel: tripUpdate.vehicle?.label || "",
        timestampMs: toTimestampMs(tripUpdate.timestamp),
        stops,
      };
    })
    .filter(Boolean);
}
