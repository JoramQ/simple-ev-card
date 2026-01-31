# Simple EV Card

Home Assistant Lovelace custom card for displaying electric vehicle status. Shows battery level, charging state, cruising range, vehicle location, and calendar events.

**Status:** Under active development, not yet stable. Requires entity ID customization per installation.

## Tech Stack

- **Language:** TypeScript 4.4.4
- **Framework:** Web Components API (Custom Elements extending HTMLElement)
- **Build:** Rollup with TypeScript, node-resolve, and terser plugins
- **Target:** ES2020, Home Assistant Lovelace frontend
- **Dependencies:** custom-card-helpers ^1.9.0

## Project Structure

```
src/
  main.ts        # Main card implementation (Web Component class)
  constants.ts   # UI constants, status strings, thresholds
dist/
  simple-ev-card.js  # Minified production bundle (~15KB)
docs/images/     # UI screenshots for README
```

## Build & Development Commands

```bash
test_and_build.sh
```

**Output:** `dist/simple-ev-card.js`

## Configuration

See `README.md` for full YAML examples.

## Home Assistant Integration Points

- **State access:** `hass.states[entity_id]` for reading entity states
- **Service calls:** `hass.callService(domain, service, data)` at `src/main.ts:453-466`
- **API calls:** `hass.callApi()` for calendar events at `src/main.ts:427`
- **Lovelace lifecycle:** `setConfig()`, `set hass()`, `getCardSize()`

## SVG Structure

The card uses inline SVG (`src/main.ts:176-263`) with CSS class toggling for visibility:
- `.svg_charger` - Charger icon (visible when charging)
- `.svg_parking` - Parking icon (visible when parked)
- `.svg_driver` - Driver icon (visible when moving)
- `.svg_moving` - Movement indicators
- `.hidden` class - Controls element visibility
