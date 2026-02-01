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

## Releasing

To create a new release:

1. Update version in `package.json` (use 2-digit format: `0.1`, `0.2`, `1.0`)

2. Build the project:
   ```bash
   ./test_and_build.sh
   ```

3. Commit the changes:
   ```bash
   git add package.json dist/simple-ev-card.js
   git commit -m "Release vX.Y"
   ```

4. Create and push the version tag:
   ```bash
   git tag -a vX.Y -m "Release vX.Y"
   git push origin main
   git push origin vX.Y
   ```

5. Create GitHub Release:
   - Go to https://github.com/JoramQ/simple-ev-card/releases/new
   - Select the `vX.Y` tag
   - Title: `vX.Y`
   - Click "Generate release notes" or write your own
   - Drag `dist/simple-ev-card.js` into the assets area
   - Click "Publish release"


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

# Charging power display (optional - shows kW and fill effect)
car_charging_power_entity: sensor.charger_power
max_charging_power: 11  # Default: 11, adjust for higher power chargers (e.g., 22)
```

## Notes

- Required config fields: `car_battery_entity`, `car_cruising_range_entity`, `charger_connected_entity`
- Optional: `calendar`, charging service config, location config, charging power display
- Visual state is controlled by CSS classes on inline SVG elements (see `src/main.ts` for class names such as `.svg_charger`, `.svg_parking`, `.svg_driver`, `.svg_moving`, `.svg_cable`)
- Calendar fetching uses the Home Assistant `callApi` endpoint `calendar/<entity>`; validate this against your HA version if events don't appear