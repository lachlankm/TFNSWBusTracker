# Sydney Bus Tracker

Real-time Sydney bus tracking app built with React, Vite, Leaflet, and Tailwind CSS.

It consumes Transport for NSW (TFNSW) GTFS-Realtime feeds for:
- vehicle positions
- trip updates (upcoming stops/departures)

## What the app does

- Shows live bus markers on an interactive OpenStreetMap map
- Highlights and tracks a selected bus (map auto-pans while tracking)
- Lets you search by route (e.g. `333`, `B1`, `M30`)
- Displays upcoming stops for the selected/tracked bus using GTFS trip updates
- Resolves stop IDs to stop names through a local proxy endpoint
- Refreshes live data automatically
- Provides clear fetch fallback/error diagnostics when endpoints fail

## Tech stack

- React 18 + Vite
- Tailwind CSS
- Leaflet + React Leaflet
- `protobufjs` (decode GTFS-Realtime protobuf)
- `papaparse` + `fflate` (parse/cached GTFS static `stops.txt` from CSV/ZIP)

## Project structure

```text
src/
  components/
    BusMap.jsx              # map, markers, tracking/selection UX
    SearchBar.jsx
    StopsPanel.jsx          # upcoming stops/departures panel
  hooks/
    useDebouncedValue.js
  lib/
    gtfsRealtime.js         # protobuf schema + decoders
    tfnswApi.js             # vehicle positions fetch + fallback plan
    tfnswTripUpdatesApi.js  # trip updates fetch + fallback plan
    nextDepartures.js       # match + normalize upcoming departures
    tfnswStaticStopsApi.js  # stop name lookup client with caching/chunking
stopNamesProxyPlugin.js     # Vite middleware for /api/stop-names
vite.config.js              # proxy + plugin wiring
```

## Prerequisites

- Node.js 18+ (or Bun)
- A TFNSW Open Data API key

## Environment setup

1. Copy `.env.example` to `.env`
2. Choose one of the modes below

### Recommended (local dev proxy mode)

Use a server-side key in Vite dev:

```env
TFNSW_API_KEY=your_key_here
```

This enables local proxy access to:
- `/api/gtfs/vehiclepos/buses`
- `/api/gtfs/realtime/buses`
- `/api/stop-names?ids=...`

### Direct browser mode (for deployments without a proxy)

```env
VITE_TFNSW_API_KEY=your_key_here
VITE_TFNSW_VEHICLE_POSITIONS_URL=https://api.transport.nsw.gov.au/v1/gtfs/vehiclepos/buses
VITE_TFNSW_TRIP_UPDATES_URL=https://api.transport.nsw.gov.au/v1/gtfs/realtime/buses
```

Notes:
- If URLs are omitted, default TFNSW endpoints are used.
- Any `VITE_` key is exposed to the browser, so prefer proxy mode in local/dev.

## Run locally

Using npm:

```bash
npm install
npm run dev
```

Using Bun:

```bash
bun install
bun run dev
```

Then open the local Vite URL shown in your terminal.

## Build and preview

```bash
npm run build
npm run preview
```

## Data + matching behavior

- Vehicle positions are filtered to a Greater Sydney bounding box before rendering.
- Upcoming stops are matched in this order:
  1. exact `trip_id`
  2. `vehicle_id`
  3. (optional model fallback) `route_id`
- Stop names are loaded on demand through `/api/stop-names`, cached, and requested in chunks.

## Troubleshooting

### "Failed to fetch" / no buses shown

- In dev proxy mode, confirm `TFNSW_API_KEY` is set in `.env`
- Restart the Vite server after changing `.env`
- Check browser Network tab:
  - `/api/gtfs/...` indicates proxy mode
  - `https://api.transport.nsw.gov.au/...` indicates direct mode
- Read the in-app error message; it includes endpoint attempts and failure details

### Stops panel shows IDs instead of names

- Stop names come from `/api/stop-names`; verify the dev server is running
- Confirm your TFNSW key has access to GTFS static schedule endpoints
- Retry after a refresh; unresolved IDs are tracked and cached

## Roadmap ideas

- Route polylines and stop markers
- Better filtering/sorting controls
- Historical playback
- Static timetable enrichment and service alerts
