# Sydney Bus Tracker (React + Tailwind + Vite)

A web app that tracks live buses around Sydney using the TFNSW GTFS real-time vehicle positions API.

## Features

- Real-time bus markers on a Sydney map
- Search bar for route number/id
- Live bus list with route and speed
- Next departures panel based on GTFS trip updates
- Stop names resolved on-demand through a server-cached GTFS static `stops.txt`
- Auto refresh every 20 seconds

## TFNSW API setup

You need a TFNSW Open Data API key.

1. Copy `.env.example` to `.env`.
2. Set one of these options:

- Recommended for local dev proxy:
  - `TFNSW_API_KEY=your_key_here`
- Direct browser call:
  - `VITE_TFNSW_VEHICLE_POSITIONS_URL=https://api.transport.nsw.gov.au/v1/gtfs/vehiclepos/buses`
  - `VITE_TFNSW_TRIP_UPDATES_URL=https://api.transport.nsw.gov.au/v1/gtfs/realtime/buses`
  - `VITE_TFNSW_API_KEY=your_key_here`

The app defaults to the Vite proxy endpoints:
- `/api/gtfs/vehiclepos/buses`
- `/api/gtfs/realtime/buses`
- `/api/stop-names?ids=...`

## Run

```bash
bun install
bun run dev
```


## Troubleshooting: "Failed to fetch"

- If you are using `bun run dev`:
  - Put `TFNSW_API_KEY=your_key_here` in `.env`
  - Restart Vite after editing `.env`
- If you are running a static build (not Vite dev server):
  - Put `VITE_TFNSW_API_KEY=your_key_here` in `.env`
  - Optionally set `VITE_TFNSW_VEHICLE_POSITIONS_URL=https://api.transport.nsw.gov.au/v1/gtfs/vehiclepos/buses`
- Open browser devtools Network tab and check the failed request URL:
  - `/api/gtfs/vehiclepos/buses` means proxy mode
  - `https://api.transport.nsw.gov.au/...` means direct mode
- The app now reports detailed endpoint attempts in the error message to help diagnose key/proxy issues.

## Notes

- The feed is GTFS-realtime protobuf and is decoded client-side.
- Buses are filtered to a Greater Sydney bounding box to focus the map and list.
- Next departures currently come from GTFS `tripupdates`; this data layer is intentionally separate so full static-timetable support can be added later.
