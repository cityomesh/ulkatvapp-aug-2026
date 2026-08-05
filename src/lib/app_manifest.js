// ─────────────────────────────────────────────────────────────────────────────
// App identity constants — edit this file before every release.
// The production build plugin reads these values and embeds them in
// dist/manifest.json.  The UI imports VERSION_NAME / BUILD_TYPE at runtime
// to display version info on the Login and ProfileSelect screens.
// ─────────────────────────────────────────────────────────────────────────────

/** Display name of the application (shown in UI and manifest). */
export const APP_NAME = 'UlkaTV';

/**
 * Human-readable version string.
 * Convention: MAJOR.MINOR.PATCH   e.g. "1.0.0", "1.2.3"
 */
export const VERSION_NAME = '0.0.1';

/**
 * Integer version code.
 * Increment by 1 with every release (including beta / internal builds).
 * The middleware uses this for numeric comparison to decide if an update
 * is available (version_code > installed_version_code).
 */
export const VERSION_CODE = 1;

/**
 * Build target audience.
 * Allowed values: 'live' | 'beta' | 'internal'
 *   live     → production release pushed to all devices
 *   beta     → opt-in beta testers only
 *   internal → internal QA / dogfooding only
 */
export const BUILD_TYPE = 'internal';
