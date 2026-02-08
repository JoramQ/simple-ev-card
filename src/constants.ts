// SVG and UI constants
export const SVG_SCALE = 0.8;
export const BATTERY_BAR_TRANSITION = 'width 0.3s ease, background-color 0.3s ease';
export const BATTERY_BAR_TEXT_SHADOW = '1px 1px 2px black';
export const CHARGE_BUTTON_SHADOW = '0 2px 5px rgba(0,0,0,0.3)';
export const CHARGE_BUTTON_TRANSITION = 'background-color 0.3s ease';

// Charging status constants
export const CHARGING_STATUSES = ['Charging Normal', 'Load Balancing Limited'];

// Time constants
export const HOURS_IN_DAY = 24;
export const MINUTES_IN_HOUR = 60;
export const SECONDS_IN_MINUTE = 60;
export const MILLISECONDS_IN_SECOND = 1000;
export const MILLISECONDS_IN_HOUR = HOURS_IN_DAY * MINUTES_IN_HOUR * SECONDS_IN_MINUTE * MILLISECONDS_IN_SECOND;

// Status constants
export const STATUS_HOME = 'Home';
export const STATUS_CONNECTED = 'Connected';
export const STATUS_CHARGING = 'Charging';
export const STATUS_PARKED = 'Parked';
export const STATUS_MOVING = 'Moving';
export const STATUS_UNKNOWN = 'Unknown';

// Battery constants
export const BATTERY_LEVEL_RED = 20;
export const BATTERY_LEVEL_YELLOW = 50;
export const BATTERY_LEVEL_GREEN = 80;

// Battery bar colors
export const BATTERY_COLOR_GREEN = '#4CAF50';
export const BATTERY_COLOR_YELLOW = '#FF9800';
export const BATTERY_COLOR_RED = '#F44336';

// Calendar retry settings
export const MAX_CALENDAR_RETRIES = 3;
export const CALENDAR_RETRY_DELAY_MS = 30000;

// Charge toggle timeout (ms) - max wait for state change after pressing button
export const CHARGE_TOGGLE_TIMEOUT_MS = 60000;

// CSS class names
export const CSS_CLASS_HIDDEN = 'hidden';
export const CSS_CLASS_GREEN = 'green';