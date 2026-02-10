# Plan: Route-First Search, Stable Bus Tracking, and Emoji Markers

## Summary
Update the app so:
1. Search defaults to route-number matching only.
2. Clicking a bus on the map explicitly locks tracking to that bus and prevents camera jumps to other buses.
3. Bus markers use emojis instead of blue circle dots.

## Scope and Success Criteria
- Search input filters by `routeId` only.
- Map camera follows only the user-tracked bus.
- No automatic fallback that moves the map to a different bus after refresh/filter changes.
- Markers render as emoji icons with a clear selected/tracked visual state.
- Behavior is consistent across polling refreshes every 20 seconds.

## Public Interface Changes
- `src/components/BusMap.jsx`
  - Current: `BusMap({ buses, selectedBus })`
  - New: `BusMap({ buses, selectedBusId, trackedBusId, onSelectBus })`
- `src/components/BusList.jsx`
  - Keep `onSelectBus(busId)` for list selection.
- `src/App.jsx`
  - Add separate state:
    - `selectedBusId` (UI highlight/details selection)
    - `trackedBusId` (camera-follow target)
  - Change selection handler to support map tracking:
    - `handleSelectBus(busId, { track: boolean })`

## Implementation Plan

### 1) Make search route-first only
- In `src/App.jsx`, replace search logic to only check `bus.routeId`.
- Keep case-insensitive normalization and trim whitespace.
- Update `SearchBar` text in `src/components/SearchBar.jsx`:
  - Label: "Search route"
  - Placeholder: "Search by route number (e.g. 333, B1, M30)"

### 2) Stabilize tracking and stop random camera jumps
- In `src/App.jsx`:
  - Keep `selectedBusId` and `trackedBusId` separate.
  - Poll refresh behavior:
    - If currently tracked bus still exists, keep tracking it.
    - Do not auto-reassign tracking to first bus.
    - Keep selection/tracking IDs stable when buses disappear, so map does not jump.
- In `src/components/BusMap.jsx`:
  - Add click handlers on markers to call `onSelectBus(bus.id, { track: true })`.
  - Camera follow effect runs only for `trackedBusId`.
  - If tracked bus is absent in filtered set, leave map viewport unchanged.

### 3) Replace circle markers with emoji markers
- In `src/components/BusMap.jsx`:
  - Replace `CircleMarker` with `Marker` + `L.divIcon`.
  - Default marker emoji: U+1F68C (bus).
  - Tracked/selected marker emoji: U+1F68D (oncoming bus) with larger style.
- In `src/index.css`:
  - Add marker CSS classes for emoji size and selected visual state.

### 4) UX clarity
- Add tracking status text in summary cards:
  - `Tracking: off`
  - `Tracking route X (Vehicle Y)`
  - `Tracking paused (bus unavailable)`

## Test Cases and Scenarios

### Functional
1. Search `333` returns buses whose `routeId` contains `333`; does not match solely by vehicle/trip IDs.
2. Click bus A on map:
   - map tracks bus A during refresh updates.
   - camera does not jump to bus B automatically.
3. If tracked bus A disappears from feed:
   - tracking status changes to paused/unavailable.
   - camera does not jump to first available bus.
4. Click bus B on map after A disappears:
   - tracking switches to bus B and camera resumes follow.
5. Emoji markers render for all buses; tracked/selected marker is visually distinct.

### Regression
1. Polling still updates buses every 20s without overlapping-request issues.
2. List selection still works and highlights chosen row.
3. Popups still show route, vehicle, trip, speed.

## Assumptions and Defaults
- "Default search" means route-only filtering for now.
- Tracking is explicitly user-driven from map clicks.
- If a tracked bus vanishes, camera stability is preferred over auto reassignment.
- Emoji set defaults to U+1F68C (normal) and U+1F68D (tracked/selected).
