/*
Copyright 2025 Joram Querner

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import { HomeAssistant, LovelaceCardConfig } from "custom-card-helpers";
import {
  BATTERY_LEVEL_RED,
  BATTERY_LEVEL_YELLOW,
  BATTERY_COLOR_GREEN,
  BATTERY_COLOR_YELLOW,
  BATTERY_COLOR_RED,
  CHARGING_STATUSES,
  MAX_CALENDAR_RETRIES,
  CALENDAR_RETRY_DELAY_MS,
  STATUS_HOME,
  STATUS_CONNECTED,
  STATUS_CHARGING,
  STATUS_PARKED,
  STATUS_MOVING,
  STATUS_UNKNOWN,
} from "./constants";

// Calendar event interface
interface CalendarEvent {
  summary?: string;
  start?: string;
  end?: string;
  duration?: string;
  [key: string]: unknown;
}

interface CarCardConfig extends LovelaceCardConfig {
  charger_connected_entity: string;
  is_charging_entity?: string;
  car_battery_entity: string;
  car_cruising_range_entity: string;
  car_location_entity?: string;
  charger_status?: string;
  calendar?: string;

  // Service call configuration for charging
  car_charging_start_service?: string;
  car_charging_start_data?: Record<string, unknown>;
  car_charging_stop_service?: string;
  car_charging_stop_data?: Record<string, unknown>;

  // Charging power display
  car_charging_power_entity?: string;  // Entity providing charging power in kW
  max_charging_power?: number;         // Max power for scaling fill (default: 11)

  // optional: booleans or templates for location/mode
  is_home?: boolean | string;
  is_driving?: boolean | string;
  is_away?: boolean | string;
}

class CarCard extends HTMLElement {
  private config!: CarCardConfig;
  private _hass!: HomeAssistant;

  // State tracking
  private _prevBattery: number | null = null;
  private _prevRange: number | null = null;
  private _prevIsCharging: boolean | null = null;
  private _prevStatus: string | null = null;
  private _prevChargerStatus: string | null = null;
  private _prevChargingPower: number | null = null;

  // Calendar state
  private _carEvent: CalendarEvent | null = null;
  private _calendarFetchAttempts = 0;
  private _calendarLastFetchTime = 0;

  // Element references
  private statusEl: HTMLElement | null = null;
  private batteryBar: HTMLElement | null = null;
  private batteryText: HTMLElement | null = null;
  private chargeBtn: HTMLButtonElement | null = null;
  private eventEl: HTMLElement | null = null;
  private chargerEl: HTMLElement | null = null;
  private errorEl: HTMLElement | null = null;
  private displayInsideEl: SVGPathElement | null = null;
  private cableEl: HTMLElement | null = null;
  private chargingPowerTextEl: SVGTextElement | null = null;

  // Cached SVG element references
  private _svgChargerEls: NodeListOf<Element> | null = null;
  private _svgParkingEls: NodeListOf<Element> | null = null;
  private _svgDriverEls: NodeListOf<Element> | null = null;
  private _svgMovingEls: NodeListOf<Element> | null = null;

  // ==================== Helper Methods ====================

  /**
   * Case-insensitive state comparison
   */
  private _stateEquals(state: string | undefined | null, ...values: string[]): boolean {
    if (state === undefined || state === null) return false;
    const normalizedState = state.toLowerCase().trim();
    return values.some(v => v.toLowerCase().trim() === normalizedState);
  }

  /**
   * Check if state represents "on"
   */
  private _stateIsOn(state: string | undefined | null): boolean {
    return this._stateEquals(state, 'on', 'true', '1', 'yes');
  }

  /**
   * Check if a state value is valid (not unavailable/unknown/empty)
   */
  private _isValidState(state: string | undefined | null): boolean {
    return state !== undefined &&
           state !== null &&
           state !== '' &&
           state !== 'unavailable' &&
           state !== 'unknown';
  }

  /**
   * Show error message to user
   */
  private _showError(message: string): void {
    if (this.errorEl) {
      this.errorEl.textContent = message;
      this.errorEl.classList.remove('hidden');
    }
    console.error(`[simple-ev-card] ${message}`);
  }

  /**
   * Clear error message
   */
  private _clearError(): void {
    if (this.errorEl) {
      this.errorEl.classList.add('hidden');
      this.errorEl.textContent = '';
    }
  }

  /**
   * Toggle hidden class on SVG elements
   */
  private _toggleSvgElements(elements: NodeListOf<Element> | null, hidden: boolean): void {
    if (elements) {
      elements.forEach(el => el.classList.toggle('hidden', hidden));
    }
  }

  /**
   * Parse service call string to domain and service
   */
  private _parseServiceCall(serviceString: string | undefined): { domain: string; service: string } | null {
    if (!serviceString || typeof serviceString !== 'string') {
      return null;
    }
    const parts = serviceString.split('.');
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      this._showError(`Invalid service format: "${serviceString}". Expected "domain.service"`);
      return null;
    }
    return { domain: parts[0], service: parts[1] };
  }

  /**
   * Centralizes location logic: returns { isHome, isAway, isDriving } booleans.
   */
  private _getLocationBooleans(hass: HomeAssistant, config: CarCardConfig, isConnected: boolean): { isHome: boolean; isAway: boolean; isDriving: boolean } {
    // Helper to resolve a boolean or entity_id
    const resolveBool = (val: boolean | string | undefined): boolean | undefined => {
      if (typeof val === 'boolean') return val;
      if (typeof val === 'string') {
        const entity = hass.states[val];
        if (entity) {
          return this._stateIsOn(entity.state);
        }
        if (val === 'true') return true;
        if (val === 'false') return false;
      }
      return undefined;
    };

    let isHome = resolveBool(config.is_home);
    let isAway = resolveBool(config.is_away);
    let isDriving = resolveBool(config.is_driving);

    // If any are missing, try to infer from tracker
    if (isHome === undefined || isAway === undefined || isDriving === undefined) {
      const tracker = config.car_location_entity ? hass.states[config.car_location_entity] : undefined;
      if (tracker && tracker.state) {
        const trackerHome = this._stateEquals(tracker.state, 'home');
        const trackerAway = this._stateEquals(tracker.state, 'not_home');

        if (isHome === undefined) isHome = trackerHome;
        if (isAway === undefined) isAway = trackerAway;
        if (isDriving === undefined) isDriving = !trackerHome && !trackerAway;
      }
    }

    // If still nothing, and charger is connected, treat as home for visuals
    if (
      isHome === undefined &&
      isAway === undefined &&
      isDriving === undefined &&
      isConnected
    ) {
      isHome = true;
      isAway = false;
      isDriving = false;
    }

    // Fallback: all false if still undefined
    return {
      isHome: isHome ?? false,
      isAway: isAway ?? false,
      isDriving: isDriving ?? false,
    };
  }

  // ==================== Configuration ====================

  setConfig(config: CarCardConfig): void {
    this.config = config;

    // Validate required fields exist
    const required = [
      'car_battery_entity',
      'car_cruising_range_entity',
      'charger_connected_entity',
    ];
    const missing = required.filter((k) => !(this.config as Record<string, unknown>)[k]);
    if (missing.length) {
      throw new Error('Missing required config keys: ' + missing.join(', '));
    }

    // Validate string fields
    const stringFields = [
      'car_battery_entity',
      'car_cruising_range_entity',
      'charger_connected_entity',
      'calendar',
      'charger_status',
      'is_charging_entity',
      'car_location_entity',
      'car_charging_start_service',
      'car_charging_stop_service',
      'car_charging_power_entity',
    ];
    for (const field of stringFields) {
      const value = (this.config as Record<string, unknown>)[field];
      if (value !== undefined && typeof value !== 'string') {
        throw new Error(`Config field "${field}" must be a string, got ${typeof value}`);
      }
    }

    // Validate service data fields are objects
    const objectFields = ['car_charging_start_data', 'car_charging_stop_data'];
    for (const field of objectFields) {
      const value = (this.config as Record<string, unknown>)[field];
      if (value !== undefined && (typeof value !== 'object' || value === null || Array.isArray(value))) {
        throw new Error(`Config field "${field}" must be an object`);
      }
    }

    // Validate service call format if provided
    for (const serviceField of ['car_charging_start_service', 'car_charging_stop_service']) {
      const value = (this.config as Record<string, unknown>)[serviceField] as string | undefined;
      if (value && !value.includes('.')) {
        throw new Error(`Config field "${serviceField}" must be in format "domain.service", got "${value}"`);
      }
    }

    // Validate max_charging_power is a positive number
    if (this.config.max_charging_power !== undefined) {
      if (typeof this.config.max_charging_power !== 'number' || this.config.max_charging_power <= 0) {
        throw new Error(`Config field "max_charging_power" must be a positive number, got ${this.config.max_charging_power}`);
      }
    }

    // Validate location fields are boolean or string
    const locationFields = ['is_home', 'is_driving', 'is_away'];
    for (const field of locationFields) {
      const value = (this.config as Record<string, unknown>)[field];
      if (value !== undefined && typeof value !== 'boolean' && typeof value !== 'string') {
        throw new Error(`Config field "${field}" must be a boolean or entity ID string, got ${typeof value}`);
      }
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
          svg .display_inside {
            transition: clip-path 0.5s ease;
          }
          svg .charging-power-text {
            font-size: 10px;
            font-weight: bold;
            fill: var(--primary-text-color);
            text-anchor: middle;
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
            flex: 1;
            margin-left: 20px;
          }
          .actions {
            margin-left: auto;
          }
          .carcard_error {
            background-color: rgba(244, 67, 54, 0.9);
            color: white;
            padding: 8px 12px;
            margin: 10px;
            border-radius: 8px;
            font-size: 14px;
            text-align: center;
          }
        </style>
        <div class="carcard_container">
          <svg viewBox="0 0 400 200" preserveAspectRatio="none" class="carcard_image">
            <path class="svg_charger body hidden" d="M0,0 L35,0 L41,3 L46,9 L47,12 L47,131 L52,131 L54,133 L54,144 L52,146 L-18,146 L-19,145 L-19,133 L-16,131 L-12,131 L-12,11 L-8,5 L-3,1 Z M1,6 L-5,10 L-7,15 L-7,131 L41,131 L41,13 L36,7 L34,6 Z M-13,137 L-13,141 L48,141 L48,137 Z " transform="translate(331,47)"/>
            <path class="svg_charger display_inside hidden" style="fill: transparent" d="M0,6 L3,35 L26,35 L26,6 Z " transform="translate(334,58)"/>
            <path class="svg_charger display hidden" d="M0,0 L28,0 L32,4 L32,37 L30,40 L27,41 L1,41 L-3,38 L-3,3 Z M3,6 L3,35 L26,35 L26,6 Z " transform="translate(334,58)"/>
            <path class="svg_charger icon hidden" d="M0,0 L2,0 L1,7 L5,7 L4,12 L-1,18 L-3,17 L-2,11 L-6,11 L-5,6 Z " transform="translate(349,70)"/>
            <path class="svg_charger connector hidden" d="M0,0 L7,0 L11,4 L12,6 L12,15 L8,20 L-1,20 L-5,16 L-5,4 Z M2,6 L1,7 L1,14 L5,15 L6,14 L6,7 Z " transform="translate(345,116)"/>
            <text class="charging-power-text hidden" id="charging_power_text" x="351" y="110"></text>

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
          <div class="carcard_error hidden" id="card_error"></div>
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

    // Get element references
    this.statusEl = this.querySelector("#carcard_status");
    this.batteryBar = this.querySelector("#battery_bar");
    this.batteryText = this.querySelector("#battery_text");
    this.chargeBtn = this.querySelector("#charge_toggle_btn");
    this.eventEl = this.querySelector("#car_event");
    this.chargerEl = this.querySelector("#charger_status");
    this.errorEl = this.querySelector("#card_error");
    this.displayInsideEl = this.querySelector('.display_inside') as SVGPathElement | null;
    this.cableEl = this.querySelector('.svg_cable');
    this.chargingPowerTextEl = this.querySelector('#charging_power_text') as SVGTextElement | null;

    // Cache SVG element references
    this._svgChargerEls = this.querySelectorAll('.svg_charger');
    this._svgParkingEls = this.querySelectorAll('.svg_parking');
    this._svgDriverEls = this.querySelectorAll('.svg_driver');
    this._svgMovingEls = this.querySelectorAll('.svg_moving');

    // Set up charge button listener
    if (this.chargeBtn) {
      this.chargeBtn.addEventListener("click", () => this._handleChargeToggle());
    } else {
      console.warn('[simple-ev-card] Charge button not found, charging controls disabled');
    }
  }

  // ==================== State Updates ====================

  set hass(hass: HomeAssistant) {
    this._hass = hass;

    // Clear previous errors
    this._clearError();

    // Get entity states
    const connected = this.config.charger_connected_entity ? hass.states[this.config.charger_connected_entity] : undefined;
    const battery = this.config.car_battery_entity ? hass.states[this.config.car_battery_entity] : undefined;
    const cruising_range = this.config.car_cruising_range_entity ? hass.states[this.config.car_cruising_range_entity] : undefined;
    const is_charging = this.config.is_charging_entity ? hass.states[this.config.is_charging_entity] : undefined;
    const charger_status = this.config.charger_status ? hass.states[this.config.charger_status] : undefined;
    const charging_power = this.config.car_charging_power_entity ? hass.states[this.config.car_charging_power_entity] : undefined;

    // Check required entities exist
    if (!connected) {
      this._showError(`Entity not found: ${this.config.charger_connected_entity}`);
    }
    if (!battery) {
      this._showError(`Entity not found: ${this.config.car_battery_entity}`);
    }

    // Derive state values
    const isConnected = !!(connected && this._stateIsOn(connected.state));
    const chargerStatus = charger_status?.state ?? '';

    let isCharging: boolean;
    if (is_charging && is_charging.state !== undefined) {
      isCharging = this._stateIsOn(is_charging.state);
    } else {
      isCharging = CHARGING_STATUSES.some(s => this._stateEquals(chargerStatus, s));
    }

    // Centralized location logic
    const { isHome, isAway, isDriving } = this._getLocationBooleans(hass, this.config, isConnected);

    // Check if charging controls are configured
    const hasChargingControls = !!(
      this.config.car_charging_start_service &&
      this.config.car_charging_start_data &&
      this.config.car_charging_stop_service &&
      this.config.car_charging_stop_data
    );

    // Determine status
    let status: string;
    if (isHome) {
      if (isConnected) {
        status = isCharging ? STATUS_CHARGING : STATUS_CONNECTED;
      } else {
        status = STATUS_HOME;
      }
    } else if (isDriving) {
      status = STATUS_MOVING;
    } else if (isAway) {
      status = STATUS_PARKED;
    } else {
      status = STATUS_UNKNOWN;
    }

    // Update SVG visibility
    if (this.cableEl) {
      this.cableEl.classList.toggle('hidden', !isConnected);
    }

    // Charger visibility
    const showCharger = status === STATUS_HOME || status === STATUS_CONNECTED || status === STATUS_CHARGING;
    this._toggleSvgElements(this._svgChargerEls, !showCharger);

    // Charge button visibility
    if (this.chargeBtn) {
      const showButton = showCharger && isConnected && hasChargingControls;
      this.chargeBtn.classList.toggle('hidden', !showButton);
    }

    // Charging indicator and power display
    // Only use simple green toggle if car_charging_power_entity is NOT configured
    // Otherwise, the power-based fill effect handles the display
    if (this.displayInsideEl && !this.config.car_charging_power_entity) {
      this.displayInsideEl.classList.toggle('green', isCharging);
    }

    // Charging power display (kW text and fill effect)
    if (this.config.car_charging_power_entity) {
      // Remove green class since we're using power-based fill
      if (this.displayInsideEl) {
        this.displayInsideEl.classList.remove('green');
      }
      const chargingPowerRaw = charging_power?.state;
      const chargingPower = this._isValidState(chargingPowerRaw) ? Number(chargingPowerRaw) : null;
      const validPower = chargingPower !== null && !Number.isNaN(chargingPower) && chargingPower > 0;
      // Show power if we have a valid power reading > 0 (power > 0 implies charging)
      const showPower = validPower;

      // Update kW text
      if (this.chargingPowerTextEl) {
        if (showPower && chargingPower !== null) {
          this.chargingPowerTextEl.classList.remove('hidden');
          if (this._prevChargingPower !== chargingPower) {
            this._prevChargingPower = chargingPower;
            this.chargingPowerTextEl.textContent = `${chargingPower.toFixed(1)} kW`;
          }
        } else {
          this.chargingPowerTextEl.classList.add('hidden');
          this._prevChargingPower = null;
        }
      }

      // Update fill effect on display_inside
      if (this.displayInsideEl && showPower && chargingPower !== null) {
        const maxPower = this.config.max_charging_power ?? 11;
        const fillPercent = Math.min(100, (chargingPower / maxPower) * 100);
        // Use clip-path to show partial fill from bottom up
        if (fillPercent >= 100) {
          // At full power, remove clip-path to avoid rendering artifacts
          this.displayInsideEl.style.clipPath = '';
        } else {
          const clipTop = 100 - fillPercent;
          this.displayInsideEl.style.clipPath = `inset(${clipTop}% 0 0 0)`;
        }
        this.displayInsideEl.style.fill = '#62e027ff';
      } else if (this.displayInsideEl) {
        // Reset fill when not charging or no valid power
        this.displayInsideEl.style.clipPath = '';
        this.displayInsideEl.style.fill = 'transparent';
      }
    }

    // Parking visibility
    this._toggleSvgElements(this._svgParkingEls, status !== STATUS_PARKED);

    // Moving/driver visibility
    const isMoving = status === STATUS_MOVING;
    this._toggleSvgElements(this._svgDriverEls, !isMoving);
    this._toggleSvgElements(this._svgMovingEls, !isMoving);

    // Status text update
    if (this.statusEl && this._prevStatus !== status) {
      this._prevStatus = status;
      this.statusEl.textContent = status;
    }

    // Charging button text
    if (this._prevIsCharging !== isCharging) {
      this._prevIsCharging = isCharging;
      if (this.chargeBtn) {
        this.chargeBtn.textContent = isCharging ? "Stop Charging" : "Start Charging";
      }
    }

    // Battery bar
    if (this.batteryBar && this.batteryText) {
      const batteryLevelRaw = battery?.state;
      const cruisingRangeRaw = cruising_range?.state;

      // Guard against invalid states
      const batteryLevel = this._isValidState(batteryLevelRaw) ? Number(batteryLevelRaw) : null;
      const cruisingRange = this._isValidState(cruisingRangeRaw) ? Number(cruisingRangeRaw) : null;

      const validBattery = batteryLevel !== null && !Number.isNaN(batteryLevel);
      const validRange = cruisingRange !== null && !Number.isNaN(cruisingRange);

      if (this._prevBattery !== batteryLevel || this._prevRange !== cruisingRange) {
        this._prevBattery = batteryLevel;
        this._prevRange = cruisingRange;

        if (validBattery) {
          this.batteryBar.style.width = `${batteryLevel}%`;

          if (validRange) {
            this.batteryText.textContent = `${batteryLevel}% (${cruisingRange} km)`;
          } else {
            this.batteryText.textContent = `${batteryLevel}%`;
          }

          // Update battery bar color
          if (batteryLevel > BATTERY_LEVEL_YELLOW) {
            this.batteryBar.style.backgroundColor = BATTERY_COLOR_GREEN;
          } else if (batteryLevel > BATTERY_LEVEL_RED) {
            this.batteryBar.style.backgroundColor = BATTERY_COLOR_YELLOW;
          } else {
            this.batteryBar.style.backgroundColor = BATTERY_COLOR_RED;
          }
        } else {
          // Invalid battery state
          this.batteryBar.style.width = '0%';
          this.batteryText.textContent = 'Battery: N/A';
          this.batteryBar.style.backgroundColor = BATTERY_COLOR_RED;
        }
      }
    }

    // Charger status
    if (this.chargerEl && this._prevChargerStatus !== chargerStatus) {
      this._prevChargerStatus = chargerStatus;
      if (chargerStatus) {
        this.chargerEl.classList.remove("hidden");
        this.chargerEl.textContent = chargerStatus;
      } else {
        this.chargerEl.classList.add("hidden");
      }
    }

    // Calendar event fetching with retry logic
    if (this.eventEl && this.config.calendar && !this._carEvent) {
      const now = Date.now();
      const retryDelay = CALENDAR_RETRY_DELAY_MS * Math.pow(2, this._calendarFetchAttempts);
      const canRetry = this._calendarFetchAttempts < MAX_CALENDAR_RETRIES;
      const cooldownPassed = now - this._calendarLastFetchTime > retryDelay;

      if (canRetry && cooldownPassed) {
        this._calendarLastFetchTime = now;
        this._fetchCalendarEvent(hass);
      }
    }
  }

  // ==================== Calendar ====================

  private async _fetchCalendarEvent(hass: HomeAssistant): Promise<void> {
    try {
      if (this.config.calendar) {
        await this._getCarEventToday(hass, this.config.calendar);
      }
      if (this._carEvent && this.eventEl) {
        this.eventEl.classList.remove('hidden');
        const summary = this._carEvent.summary || 'Event';
        const duration = this._carEvent.duration || '?';
        this.eventEl.textContent = `${summary} (${duration}h)`;
      }
    } catch (error) {
      this._calendarFetchAttempts++;
      console.error(`[simple-ev-card] Calendar fetch failed (attempt ${this._calendarFetchAttempts}/${MAX_CALENDAR_RETRIES})`, error);
      if (this._calendarFetchAttempts >= MAX_CALENDAR_RETRIES && this.eventEl) {
        this._showError(`Calendar unavailable`);
      }
    }
  }

  private async _getCarEventToday(hass: HomeAssistant, calendar: string): Promise<void> {
    if (!calendar) return;

    const now = new Date();
    const later = new Date(now);
    later.setHours(23, 59, 59);

    const response = await hass.callApi<unknown>(
      "GET",
      `calendars/${calendar}?start=${now.toISOString()}&end=${later.toISOString()}`
    );

    // Validate response format
    if (!Array.isArray(response)) {
      throw new Error(`Calendar API returned unexpected format: expected array, got ${typeof response}`);
    }

    const events = response as Record<string, unknown>[];

    // Find first event with valid start and end
    const relevantEvent = events.find((e): e is CalendarEvent =>
      e !== null &&
      typeof e === 'object' &&
      typeof e.start === 'string' &&
      typeof e.end === 'string'
    );

    if (relevantEvent && relevantEvent.start && relevantEvent.end) {
      const start = new Date(relevantEvent.start);
      const end = new Date(relevantEvent.end);

      // Validate dates
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        throw new Error(`Invalid date format in calendar event`);
      }

      const duration = (end.getTime() - start.getTime()) / 3600000;

      this._carEvent = {
        ...relevantEvent,
        duration: duration.toFixed(1),
      };
    }
  }

  // ==================== Charging Control ====================

  private async _handleChargeToggle(): Promise<void> {
    if (!this._hass) {
      this._showError('Cannot toggle charging: Home Assistant not available');
      return;
    }

    try {
      if (this._prevIsCharging) {
        // Stop charging
        const parsed = this._parseServiceCall(this.config.car_charging_stop_service);
        if (!parsed) {
          this._showError('Stop charging service not configured correctly');
          return;
        }
        if (!this.config.car_charging_stop_data) {
          this._showError('Stop charging data not configured');
          return;
        }
        await this._hass.callService(parsed.domain, parsed.service, this.config.car_charging_stop_data);
      } else {
        // Start charging
        const parsed = this._parseServiceCall(this.config.car_charging_start_service);
        if (!parsed) {
          this._showError('Start charging service not configured correctly');
          return;
        }
        if (!this.config.car_charging_start_data) {
          this._showError('Start charging data not configured');
          return;
        }
        await this._hass.callService(parsed.domain, parsed.service, this.config.car_charging_start_data);
      }
    } catch (error) {
      const action = this._prevIsCharging ? 'stop' : 'start';
      this._showError(`Failed to ${action} charging: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // ==================== Card Size ====================

  getCardSize(): number {
    return 3;
  }
}

customElements.define("car-card", CarCard);
