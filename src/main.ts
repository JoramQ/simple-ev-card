// src/main.ts

import { HomeAssistant, LovelaceCardConfig } from "custom-card-helpers";

interface CarCardConfig extends LovelaceCardConfig {
  charger_connected_entity: string;
  is_charging_entity: string;
  car_battery_entity: string;
  car_cruising_range_entity: string;
  car_location_entity: string;
  charger_status: string;
  calendar: string;
  car_charging_entity: string;
}

class CarCard extends HTMLElement {
  private config!: CarCardConfig;
  private _hass!: HomeAssistant;

  private _prevBattery: number | null = null;
  private _prevRange: number | null = null;
  private _prevIsCharging: boolean | null = null;
  private _prevLocation: string | null = null;
  private _prevStatus: string | null = null;
  private _prevChargerStatus: string | null = null;

  private _carEventFetched = false;
  private _carEvent: Record<string, unknown> | null = null;

  private statusEl!: HTMLElement;
  private batteryBar!: HTMLElement;
  private batteryText!: HTMLElement;
  private chargeBtn!: HTMLButtonElement;
  private eventEl!: HTMLElement;
  private chargerEl!: HTMLElement;

  private _displayinsideEl!: HTMLElement;
  private _car_cableEl!: HTMLElement;

  setConfig(config: CarCardConfig): void {
    this.config = config;

    const required = [
      'car_charging_entity',
      'car_battery_entity',
      'car_cruising_range_entity',
      'car_location_entity',
      'charger_connected_entity',
      'calendar',
    ];
    const missing = required.filter((k) => !(this.config as Record<string, unknown>)[k]);
    if (missing.length) {
      throw new Error('Missing required config keys: ' + missing.join(', '));
    }

    this.innerHTML = `
      <ha-card>
        <style>
          .carcard_container {
            position: relative;
            width: 100%;
            display: flex;
            flex-direction: column;
            padding-bottom: 10px;
          }
          .carcard_image {
            width: 100%;
            height: auto;
            display: block;
          }
          .carcard_overlay {
            position: absolute;
            top: 8px;
            left: 12px;
            padding: 4px 12px;
            font-size: var(--ha-card-header-font-size, 24px);
            font-family: var(--ha-card-header-font-family, inherit);
            color: var(--ha-card-header-color,var(--primary-text-color));
            letter-spacing: -0.012em;
            z-index: 2;
          }

          .carcard_battery_bar_container {
            position: relative;
            margin: 10px;
            height: 30px;
            background-color: rgba(0,0,0,0.25);
            border-radius: 15px;
            overflow: hidden;
          }
          .carcard_battery_bar_background {
            position: absolute;
            top: 0;
            left: 0;
            height: 100%;
            width: 0%;
            background-color: red;
            transition: width 0.3s ease, background-color 0.3s ease;
            border-radius: 15px 0 0 15px;
          }
          .carcard_battery_bar_text {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-weight: bold;
            font-size: 16px;
            text-shadow: 1px 1px 2px black;
          }
          
          .charge_button {
            margin: 10px;
            padding: 7px;
            border: none;
            border-radius: 10px;
            font-size: 14px;
            cursor: pointer;
            background-color: #2196F3;
            color: white;
            box-shadow: 0 2px 5px rgba(0,0,0,0.3);
            transition: background-color 0.3s ease;
          }
          .charge_button:hover {
            background-color: #1976D2;
          }
          #car_event {
            text-align: center;
          }
          .hidden {
            display: none !important;
          }
          svg .green {
            fill: #62e027ff !important;
          }
          svg .svg_charger,
          svg .svg_parking,
          svg .svg_carbody,
          svg .svg_carhandles,
          svg .svg_carwheels,
          svg .svg_driver,
          svg .svg_moving,
          svg .svg_cable {
            fill: var(--primary-text-color);
          }
          .bottom_row {
            display: flex;
            align-items: center;
          }
          #charger_status {
            flex: 1;      /* takes up remaining space */
            margin-left: 20px;
          }
          .actions {
            margin-left: auto;  /* pushes the button to the right */
          }
        </style>
        <div class="carcard_container">
          <svg viewBox="0 0 400 200" preserveAspectRatio="none" class="carcard_image">
            <path class="svg_charger body hidden" d="M0,0 L35,0 L41,3 L46,9 L47,12 L47,131 L52,131 L54,133 L54,144 L52,146 L-18,146 L-19,145 L-19,133 L-16,131 L-12,131 L-12,11 L-8,5 L-3,1 Z M1,6 L-5,10 L-7,15 L-7,131 L41,131 L41,13 L36,7 L34,6 Z M-13,137 L-13,141 L48,141 L48,137 Z " transform="translate(331,47)"/>
            <path class="svg_charger display_inside hidden" style="fill: transparent" d="M0,6 L3,35 L26,35 L26,6 Z " transform="translate(334,64)"/>
            <path class="svg_charger display hidden" d="M0,0 L28,0 L32,4 L32,37 L30,40 L27,41 L1,41 L-3,38 L-3,3 Z M3,6 L3,35 L26,35 L26,6 Z " transform="translate(334,64)"/>
            <path class="svg_charger icon hidden" d="M0,0 L2,0 L1,7 L5,7 L4,12 L-1,18 L-3,17 L-2,11 L-6,11 L-5,6 Z " transform="translate(349,76)"/>
            <path class="svg_charger connector hidden" d="M0,0 L7,0 L11,4 L12,6 L12,15 L8,20 L-1,20 L-5,16 L-5,4 Z M2,6 L1,7 L1,14 L5,15 L6,14 L6,7 Z " transform="translate(345,116)"/>
            
            <path class="svg_parking hidden" style="scale:0.8" d="M0,0 L52,0 L56,4 L57,6 L57,56 L54,61 L51,63 L29,64 L29,81 L28,91 L24,88 L23,63 L0,63 L-4,59 L-5,56 L-5,5 Z M5,4 L0,7 L0,55 L2,58 L49,58 L52,55 L52,8 L50,5 L45,4 Z " transform="translate(322,18)"/>
            <path class="svg_parking hidden" style="scale:0.8" d="M0,0 L15,0 L22,3 L25,6 L26,14 L23,19 L19,22 L7,23 L6,34 L0,34 L-1,1 Z M7,6 L6,7 L6,16 L7,17 L15,17 L19,13 L18,8 L16,6 Z " transform="translate(337,32)"/>
            
            <path class="svg_carbody" d="M0,0 L36,0 L58,1 L78,4 L92,11 L105,21 L116,29 L130,34 L134,39 L134,63 L133,81 L132,90 L129,99 L124,103 L116,105 L107,106 L102,115 L96,121 L94,121 L94,123 L119,123 L120,127 L119,128 L-151,128 L-152,123 L-108,123 L-108,121 L-113,119 L-119,111 L-120,106 L-140,105 L-150,103 L-154,99 L-155,86 L-155,74 L-152,69 L-148,59 L-143,54 L-135,49 L-117,43 L-91,37 L-78,34 L-66,26 L-49,15 L-30,5 L-19,2 Z M6,6 L-11,7 L-25,10 L-41,18 L-56,27 L-74,39 L-90,43 L-120,50 L-133,55 L-133,56 L-114,57 L-114,62 L-120,69 L-127,73 L-148,74 L-149,75 L-149,90 L-147,97 L-140,99 L-122,99 L-120,86 L-116,78 L-107,70 L-99,67 L-85,67 L-76,71 L-70,76 L-65,84 L-63,91 L-62,99 L10,99 L10,63 L11,48 L-63,48 L-62,43 L-51,34 L-32,22 L-21,17 L-4,14 L47,14 L62,16 L72,21 L78,26 L83,34 L83,47 L78,65 L91,69 L99,75 L103,80 L107,89 L109,99 L119,98 L124,96 L126,92 L128,67 L129,61 L129,44 L126,39 L113,34 L103,27 L87,15 L76,10 L56,7 L32,6 Z M2,19 L-15,21 L-26,25 L-41,34 L-43,37 L-36,38 L-35,43 L-8,43 L9,42 L14,24 L14,19 Z M23,19 L22,20 L20,37 L20,42 L53,42 L60,41 L62,27 L62,22 L56,20 L41,19 Z M67,25 L66,26 L65,41 L77,41 L78,36 L72,28 Z M39,47 L16,48 L14,62 L14,99 L48,99 L51,85 L56,77 L64,70 L73,66 L76,58 L78,51 L78,47 Z M-141,61 L-144,64 L-145,68 L-144,69 L-131,69 L-124,66 L-120,63 L-120,61 Z M-95,75 L-105,79 L-111,86 L-113,91 L-113,103 L-110,109 L-102,116 L-96,118 L-88,118 L-78,113 L-74,108 L-71,100 L-71,93 L-74,85 L-79,80 L-85,76 Z M76,75 L68,78 L60,85 L57,93 L57,100 L61,110 L68,116 L74,118 L82,118 L90,115 L97,107 L99,102 L99,91 L95,83 L89,78 L81,75 Z M-64,106 L-70,116 L-77,122 L-77,123 L63,123 L58,118 L52,110 L50,106 Z " transform="translate(177,65)"/>
            <path class="svg_carbody" d="M0,0 L14,0 L18,3 L19,6 L19,16 L17,20 L13,22 L1,22 L-4,18 L-5,16 L-5,5 Z M1,6 L1,14 L3,16 L12,16 L13,15 L13,7 L12,6 Z " transform="translate(273,110)"/>
            <!--- doorhandles -->
            <path class="svg_carhandles" d="M0,0 L13,0 L14,3 L13,5 L0,5 L-1,1 Z " transform="translate(234,120)"/>
            <path class="svg_carhandles" d="M0,0 L14,0 L15,4 L14,5 L0,5 L-1,2 Z " transform="translate(167,121)"/>
            <!--- wieldop -->
            <path class="svg_carwheels" d="M0,0 L9,0 L15,4 L17,7 L18,14 L15,21 L10,25 L3,26 L-4,23 L-8,17 L-8,8 L-5,3 Z M2,6 L-2,10 L-1,17 L1,19 L8,19 L11,16 L11,10 L7,6 Z " transform="translate(80,149)"/>
            <path class="svg_carwheels" d="M0,0 L8,0 L14,4 L17,10 L16,19 L11,24 L6,26 L-1,25 L-7,20 L-9,11 L-5,3 Z M2,6 L-2,9 L-2,16 L1,19 L5,20 L10,17 L11,11 L6,6 Z " transform="translate(251,149)"/>

            <path class="svg_driver hidden" style="scale:0.8" d="M0,0 L8,3 L11,7 L12,14 L9,24 L12,27 L12,31 L-12,31 L-12,27 L-8,25 L-8,23 L-11,22 L-14,13 L-11,6 L-6,1 Z M-3,7 L-8,11 L-8,17 L-5,20 L1,20 L4,17 L4,10 L-1,7 Z M0,26 L-4,28 L5,28 L3,26 Z " transform="translate(216,105)"/>
            <path class="svg_moving hidden" d="M0,0 L28,0 L28,4 L0,4 Z " transform="translate(339,119)"/>
            <path class="svg_moving hidden" d="M0,0 L16,0 L18,2 L17,6 L-2,6 L-3,3 Z " transform="translate(338,130)"/>
            <path class="svg_moving hidden" d="M0,0 L19,0 L20,4 L19,5 L0,5 L-1,1 Z " transform="translate(330,144)"/>

            <path class="svg_cable hidden" d="M0,0 L9,1 L15,4 L20,9 L23,15 L24,31 L27,40 L34,46 L37,47 L46,47 L53,44 L57,39 L59,32 L59,22 L58,19 L60,15 L66,17 L65,37 L60,47 L51,53 L48,54 L36,54 L26,49 L19,41 L17,37 L17,21 L14,12 L8,8 L0,7 Z " transform="translate(286,119)"/>
          </svg>
          <div class="carcard_overlay" id="carcard_status">Loading...</div>
          <div class="carcard_battery_bar_container">
            <div class="carcard_battery_bar_background" id="battery_bar"></div>
            <div class="carcard_battery_bar_text" id="battery_text">0%</div>
          </div>
          <div class="carcard_event hidden" id="car_event"></div>
          <div class="bottom_row">
            <span class="hidden" id="charger_status"></span>
            <span class="actions">
              <button class="charge_button hidden" id="charge_toggle_btn">no action</button>
            </span>
          </div>
        </div>
    </ha-card>`;

    this.statusEl = this.querySelector("#carcard_status") as HTMLElement;
    this.batteryBar = this.querySelector("#battery_bar") as HTMLElement;
    this.batteryText = this.querySelector("#battery_text") as HTMLElement;
    this.chargeBtn = this.querySelector("#charge_toggle_btn") as HTMLButtonElement;
    this.eventEl = this.querySelector("#car_event") as HTMLElement;
    this.chargerEl = this.querySelector("#charger_status") as HTMLElement;

    this.chargeBtn?.addEventListener("click", () => this._handleChargeToggle());

    this._displayinsideEl = this.querySelector('.display_inside') as HTMLElement;
    this._car_cableEl = this.querySelector('.svg_cable') as HTMLElement;
  }

  set hass(hass: HomeAssistant) {
    this._hass = hass;

    // statuses (null-safe lookups)
    const connected = this.config.charger_connected_entity ? hass.states[this.config.charger_connected_entity] : undefined; // boolean
    const is_charging = this.config.is_charging_entity ? hass.states[this.config.is_charging_entity] : undefined; // boolean (optional)
    const battery = this.config.car_battery_entity ? hass.states[this.config.car_battery_entity] : undefined; // battery percentage
    const cruising_range = this.config.car_cruising_range_entity ? hass.states[this.config.car_cruising_range_entity] : undefined; // range in km
    const car_location = this.config.car_location_entity ? hass.states[this.config.car_location_entity] : undefined; // text (tracker)
    const charger_status = this.config.charger_status ? hass.states[this.config.charger_status] : undefined; // text

    const isConnected = !!(connected && connected.state === "on");
    const isHome = !!(car_location && car_location.state === "home");
    const isParked = !!(car_location && car_location.state === "not_home");
    const chargerStatus = charger_status && charger_status.state ? charger_status.state : '';

    let isCharging; // boolean based on is_charging if available or on the charger status text
    if (is_charging && is_charging.state !== undefined) {
      isCharging = is_charging.state === "on";
    } else {
      isCharging = ["Charging Normal", "Load Balancing Limited"].includes(chargerStatus);
    }

    let status = "Unknown";

    if (this._car_cableEl) this._car_cableEl.classList.toggle('hidden', !isConnected);

    if (isHome) {
      status = "Home";
      this.querySelectorAll('.svg_charger').forEach(el => el.classList.remove('hidden'));
      if (isConnected) {
        status = "Connected";
        if (this.chargeBtn) this.chargeBtn.classList.remove('hidden');
        if (this._displayinsideEl) this._displayinsideEl.classList.toggle('green', isCharging);
        status = isCharging ? "Charging" : "Connected";
      } else {
        if (this.chargeBtn) this.chargeBtn.classList.add('hidden');
      }
    } else {
      this.querySelectorAll('.svg_charger').forEach(el => el.classList.add('hidden'));
    }
    
    if (!isHome && isParked) {
      status = "Parked";
      this.querySelectorAll('.svg_parking').forEach(el => el.classList.remove('hidden'));
    } else {
      this.querySelectorAll('.svg_parking').forEach(el => el.classList.add('hidden'));
    }

    if (!isHome && !isParked) {
      status = "Moving";
      this.querySelectorAll('.svg_driver').forEach(el => el.classList.remove('hidden'));
      this.querySelectorAll('.svg_moving').forEach(el => el.classList.remove('hidden'));
    } else {
      this.querySelectorAll('.svg_driver').forEach(el => el.classList.add('hidden'));
      this.querySelectorAll('.svg_moving').forEach(el => el.classList.add('hidden'));
    }

    // Status text update
    if (this.statusEl && this._prevStatus !== status) {
      this._prevStatus = status;
      this.statusEl.textContent = status;
    }

    // Charging button
    if (this._prevIsCharging !== isCharging) {
      this._prevIsCharging = isCharging;
      if (this.chargeBtn) this.chargeBtn.textContent = isCharging ? "Stop Charging" : "Start Charging";
    }

    // Battery bar
    if (this.batteryBar && this.batteryText) {
      const batteryLevelRaw = battery?.state;
      const cruisingRangeRaw = cruising_range?.state;
      const batteryLevel = Number(batteryLevelRaw);
      const cruisingRange = Number(cruisingRangeRaw);

      const validBattery = !Number.isNaN(batteryLevel) && typeof batteryLevel === 'number';
      const validRange = !Number.isNaN(cruisingRange) && typeof cruisingRange === 'number';

      if (validBattery && (this._prevBattery !== batteryLevel || this._prevRange !== (validRange ? cruisingRange : this._prevRange))) {
        this._prevBattery = batteryLevel;
        this._prevRange = validRange ? cruisingRange : this._prevRange;

        this.batteryBar.style.width = `${batteryLevel}%`;
        this.batteryText.textContent = validRange ? `${batteryLevel}% / ${cruisingRange} km` : `${batteryLevel}%`;

        if (batteryLevel > 80) {
          this.batteryBar.style.backgroundColor = "green";
        } else if (batteryLevel > 50) {
          this.batteryBar.style.backgroundColor = "orange";
        } else {
          this.batteryBar.style.backgroundColor = "red";
        }
      }
    }

    // Calendar events
    if (!this._carEventFetched && this.eventEl && this.config.calendar) {
      this._carEventFetched = true;
      this.getCarEventToday(hass, this.config.calendar).then(() => {
        if (this._carEvent && this.statusEl) {
          const carEvent = this._carEvent as Record<string, unknown> & { start?: string; duration?: string };
          const startTime = new Date(carEvent.start as string);

          const formatter = new Intl.DateTimeFormat(this._hass.language || 'default', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false, // 24-hour format
          });
          const formattedStart = formatter.format(startTime);
          this.eventEl.textContent = `Charge planned at ${formattedStart} for ${carEvent.duration}h`;
          this.eventEl.classList.remove("hidden");
        }
      });
    }

    // Charger status
    if (this.chargerEl && this._prevChargerStatus !== chargerStatus) {
      this._prevChargerStatus = chargerStatus;
      this.chargerEl.classList.remove("hidden");
      this.chargerEl.textContent = chargerStatus || '';
    }
  }

  private async getCarEventToday(hass: HomeAssistant, calendar: string): Promise<void> {
    // Fetch calendar events
    try {
      if (!calendar) return;
      const now = new Date();
      const later = new Date(now);
      later.setHours(23, 59, 59);

      const events = await hass.callApi<Record<string, unknown>[]>("GET", `calendar/${calendar}?start=${now.toISOString()}&end=${later.toISOString()}`);

      const relevantEvent = events.find(e => e.start && e.end) as (Record<string, unknown> & { start?: string; end?: string }) | undefined;
      if (relevantEvent && relevantEvent.start && relevantEvent.end) {
        const start = new Date(relevantEvent.start as string);
        const end = new Date(relevantEvent.end as string);
        const duration = (end.getTime() - start.getTime()) / 3600000;

        this._carEvent = {
          ...relevantEvent,
          duration: duration.toFixed(1),
        } as Record<string, unknown>;
      }
    } catch (error) {
      console.error("Failed to fetch calendar event", error);
    }
  }

  private _handleChargeToggle(): void {
    if (!this._hass || !this.config?.car_charging_entity) {
      console.warn('Cannot toggle charging: hass or car_charging_entity not available');
      return;
    }
    const service = this._prevIsCharging ? "turn_off" : "turn_on";
    this._hass.callService("switch", service, {
      entity_id: this.config.car_charging_entity,
    });
  }

  getCardSize(): number {
    return 3;
  }
}

customElements.define("car-card", CarCard);
