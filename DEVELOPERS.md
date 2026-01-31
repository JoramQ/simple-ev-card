# simple-ev-card (Developer Guide)

A small Home Assistant Lovelace custom card showing EV state (battery, charging, calendar).

## Developer Commands

- Install dependencies:

```bash
npm install
```

- Run development watch (local rollup dev server):

```bash
npm run start
```

- Build for production (runs linter then rollup):

```bash
npm run build
```

- Lint sources:

```bash
npm run lint
```

## Docker Build

Build and test using Docker (no local Node.js required):

```bash
# Run full test & build (recommended)
./test_and_build.sh

# Or manually:
docker build -t ev-card-builder .
docker run --rm -v "$PWD/dist":/app/dist ev-card-builder        # build
docker run --rm ev-card-builder npm run lint                     # lint only
docker run -it --rm -v "$PWD":/app ev-card-builder sh            # interactive shell
```

## Project Structure

- `src/main.ts` — single-file implementation: injects `innerHTML` in `setConfig()` and applies reactive updates in `set hass(hass)`
- `package.json` — scripts and dev deps (rollup, typescript, eslint)
- `dist/simple-ev-card.js` — minified production bundle

## Configuration

Example Lovelace YAML (minimal):

```yaml
type: 'custom:car-card'
car_battery_entity: sensor.car_battery
car_cruising_range_entity: sensor.car_range
charger_connected_entity: binary_sensor.charger_connected
```

Example with all options:

```yaml
type: 'custom:car-card'
car_battery_entity: sensor.car_battery
car_cruising_range_entity: sensor.car_range
charger_connected_entity: binary_sensor.charger_connected
is_charging_entity: binary_sensor.car_is_charging
charger_status: sensor.charger_status
calendar: calendar.work

# Location (use booleans, entity IDs, or device_tracker)
is_home: binary_sensor.car_at_home
is_away: binary_sensor.car_away
is_driving: binary_sensor.car_driving
# OR use device tracker:
car_location_entity: device_tracker.my_car

# Charging controls (optional - button only shows when configured)
car_charging_start_service: switch.turn_on
car_charging_start_data:
  entity_id: switch.car_charger
car_charging_stop_service: switch.turn_off
car_charging_stop_data:
  entity_id: switch.car_charger
```

## Notes

- Required config fields: `car_battery_entity`, `car_cruising_range_entity`, `charger_connected_entity`
- Optional: `calendar`, charging service config, location config
- Visual state is controlled by CSS classes on inline SVG elements (see `src/main.ts` for class names such as `.svg_charger`, `.svg_parking`, `.svg_driver`, `.svg_moving`, `.svg_cable`)
- Calendar fetching uses the Home Assistant `callApi` endpoint `calendar/<entity>`; validate this against your HA version if events don't appear