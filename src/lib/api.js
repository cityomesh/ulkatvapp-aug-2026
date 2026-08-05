import {
  API_HOST,
  CHANNELS_ENDPOINT,
  LOGIN_ENDPOINT,
  LOGOUT_ENDPOINT,
  GENRE_ENDPOINT,
  SUB_GENRE_ENDPOINT,
  SUBSCRIBED_CHANNEL_LIST_URL,
  PALLYCON_TOKEN_URL,
  APP_ID,
  PLATFORM_ID,
  APP_VERSION,
} from './constants.js';
import { APP_NAME } from './app_manifest.js';

const DEVICE_ID_SEED = '3233108c-a97b-4aad-9987-4000747d9790';

function fnv1a32(input, seed = 0x811c9dc5) {
  let hash = seed >>> 0;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function generateDeviceIdFromString(seed) {
  const p1 = fnv1a32(`${seed}|1`, 0x811c9dc5).toString(16).padStart(8, '0');
  const p2 = fnv1a32(`${seed}|2`, 0x9e3779b1).toString(16).padStart(8, '0');
  const p3 = fnv1a32(`${seed}|3`, 0x85ebca6b).toString(16).padStart(8, '0');
  const p4 = fnv1a32(`${seed}|4`, 0xc2b2ae35).toString(16).padStart(8, '0');
  const raw = `${p1}${p2}${p3}${p4}`;
  return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(16, 20)}-${raw.slice(20, 32)}`;
}

function generateFakeMacAddressFromString(seed) {
  const a = fnv1a32(`${seed}|mac|a`, 0x811c9dc5);
  const b = fnv1a32(`${seed}|mac|b`, 0x9e3779b1);
  const bytes = [
    (a >>> 24) & 0xff,
    (a >>> 16) & 0xff,
    (a >>> 8) & 0xff,
    a & 0xff,
    (b >>> 8) & 0xff,
    b & 0xff
  ];
  bytes[0] = (bytes[0] | 0x02) & 0xfe;
  return bytes.map((n) => n.toString(16).padStart(2, '0')).join(':');
}

/**
 * Fetch hardware identifiers written by read-device-info.sh at boot.
 * Returns { chipId, macAddress } or null if the file is unavailable.
 */
async function fetchHardwareDeviceInfo() {
  try {
    const res = await fetch('http://127.0.0.1:8081/cgi-bin/device-info.sh', { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    const chipId = (data.chipId || '').trim();
    const mac    = (data.macAddress || '').trim();
    if (chipId && mac) return { chipId, macAddress: mac };
    return null;
  } catch {
    return null;
  }
}

/**
 * Get device ID — uses real chipId from firmware if available,
 * otherwise falls back to a generated ID stored in localStorage.
 */
function getFallbackDeviceId() {
  const key = 'ulka_device_id';
  let id = localStorage.getItem(key);
  if (!id || id === DEVICE_ID_SEED) {
    id = generateDeviceIdFromString(DEVICE_ID_SEED);
    localStorage.setItem(key, id);
  }
  return id;
}

function getFallbackMacAddress(deviceId) {
  const key = 'ulka_fake_mac_address';
  let mac = localStorage.getItem(key);
  if (!mac) {
    mac = generateFakeMacAddressFromString(deviceId || DEVICE_ID_SEED);
    localStorage.setItem(key, mac);
  }
  return mac;
}

/**
 * Parse OS name and version from userAgent.
 */
function parseOsInfo(ua) {
  if (/Android\s([\d.]+)/.test(ua)) return { os: 'Android', version: RegExp.$1 };
  if (/Windows NT\s([\d.]+)/.test(ua)) return { os: 'Windows', version: RegExp.$1 };
  if (/Mac OS X\s([\d_.]+)/.test(ua)) return { os: 'macOS', version: RegExp.$1.replace(/_/g, '.') };
  if (/Linux/.test(ua)) return { os: 'Linux', version: 'unknown' };
  return { os: navigator.platform || 'unknown', version: 'unknown' };
}

/**
 * Parse device/browser brand from userAgent.
 */
function parseDeviceBrand(ua) {
  // Try to extract device model (common in Android/TV user agents)
  const modelMatch = ua.match(/;\s*([^;)]+)\s*Build\//);
  if (modelMatch) return modelMatch[1].trim();
  // Browser-based fallback
  if (/Edg\//.test(ua)) return 'Edge Browser';
  if (/Chrome\//.test(ua)) return 'Chrome Browser';
  if (/Firefox\//.test(ua)) return 'Firefox Browser';
  if (/Safari\//.test(ua) && !/Chrome/.test(ua)) return 'Safari Browser';
  return navigator.platform || 'Web Browser';
}

/**
 * Get timezone offset in hours (e.g. 5.5 for IST).
 */
function getTimezoneOffset() {
  return -(new Date().getTimezoneOffset() / 60);
}

/**
 * Collect device info from the browser and log everything for debugging.
 * Uses real hardware chipId/MAC when available from read-device-info.sh.
 */
async function getDeviceInfo() {
  const ua = navigator.userAgent;
  const osInfo = parseOsInfo(ua);
  const deviceBrand = parseDeviceBrand(ua);
  const timezoneOffset = getTimezoneOffset();
  const screenSize = `${screen.width}x${screen.height}`;

  const hw = await fetchHardwareDeviceInfo();
  const deviceId   = hw ? hw.chipId      : getFallbackDeviceId();
  const macAddress = hw ? hw.macAddress  : getFallbackMacAddress(deviceId);

  if (hw) {
    console.log('[DeviceInfo] Using real hardware IDs — chipId:', deviceId, '| MAC:', macAddress);
  } else {
    console.warn('[DeviceInfo] device-info.sh unavailable — using generated fallback IDs');
  }

  const info = {
    deviceId,
    macAddress,
    userAgent: ua,
    platform: navigator.platform,
    os: osInfo.os,
    osVersion: osInfo.version,
    deviceBrand,
    language: navigator.language,
    hardwareConcurrency: navigator.hardwareConcurrency || 'unknown',
    deviceMemory: navigator.deviceMemory || 'unknown',
    screenSize,
    screenColorDepth: screen.colorDepth,
    pixelRatio: window.devicePixelRatio,
    touchSupport: navigator.maxTouchPoints > 0,
    maxTouchPoints: navigator.maxTouchPoints || 0,
    vendor: navigator.vendor || 'unknown',
    timezoneOffset,
  };

  console.group('[DeviceInfo] Device Details');
  console.log('[DeviceInfo] deviceId:', info.deviceId);
  console.log('[DeviceInfo] macAddress:', info.macAddress);
  console.log('[DeviceInfo] userAgent:', info.userAgent);
  console.log('[DeviceInfo] platform:', info.platform);
  console.log('[DeviceInfo] os:', info.os, '| version:', info.osVersion);
  console.log('[DeviceInfo] deviceBrand:', info.deviceBrand);
  console.log('[DeviceInfo] language:', info.language);
  console.log('[DeviceInfo] hardwareConcurrency:', info.hardwareConcurrency);
  console.log('[DeviceInfo] deviceMemory:', info.deviceMemory, 'GB');
  console.log('[DeviceInfo] screen:', info.screenSize, '@', info.screenColorDepth, 'bit', '| pixelRatio:', info.pixelRatio);
  console.log('[DeviceInfo] touchSupport:', info.touchSupport, '| maxTouchPoints:', info.maxTouchPoints);
  console.log('[DeviceInfo] vendor:', info.vendor);
  console.log('[DeviceInfo] timezoneOffset:', info.timezoneOffset);
  console.groupEnd();

  return info;
}

/**
 * Log in with username + password.
 * Sends device info matching the native app's login API format.
 * On success, persists token to localStorage and returns the response data.
 */
export async function loginUser(username, password) {
  const deviceInfo = await getDeviceInfo();
  const deviceId = deviceInfo.deviceId;

  console.log('[Auth] Login attempt for user:', username);

  const authStr = `username=${username};password=${password};boxid=${deviceId};appid=${APP_ID};timestamp=${Date.now()}`;

  const loginBody = {
    screensize: deviceInfo.screenSize,
    appid: APP_ID,
    devicebrand: deviceInfo.deviceBrand,
    googleappid: deviceId,
    ntype: '1',
    app_name: APP_NAME,
    os: deviceInfo.os,
    api_version: deviceInfo.osVersion,
    appversion: APP_VERSION,
    macaddress: deviceInfo.macAddress,
    language: deviceInfo.language,
    device_ip: '',
    auth: authStr,
    device_timezone: String(deviceInfo.timezoneOffset),
    hdmi: 'false',
    firmwareversion: deviceInfo.userAgent,
  };

  console.group('[Auth] Login request body');
  console.log('[Auth] body:', JSON.stringify(loginBody, null, 2));
  console.groupEnd();

  const response = await fetch(`${API_HOST}${LOGIN_ENDPOINT}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(loginBody)
  });

  if (!response.ok) {
    throw new Error(`Login HTTP ${response.status}`);
  }

  const data = await response.json();

  console.group('[Auth] Login response');
  console.log('[Auth] status_code:', data?.status_code);
  console.log('[Auth] response:', JSON.stringify(data, null, 2));
  console.groupEnd();

  if (data?.status_code === 200 && data.response_object?.[0]?.access_token) {
    const token = data.response_object[0].access_token;
    localStorage.setItem('ulka_token', token);
    console.log('[Auth] Login successful, token stored');
    return token;
  }

  throw new Error(data?.error_description || 'Login failed. Please check your credentials.');
}

/**
 * Log out the current device from the server.
 * Sends the auth token so the server can invalidate the session.
 */
export async function logoutUser() {
  const token = localStorage.getItem('ulka_token');
  if (!token) {
    console.warn('[Auth] No token found, skipping server logout');
    return;
  }

  try {
    const response = await fetch(`${API_HOST}${LOGOUT_ENDPOINT}`, {
      method: 'POST',
      headers: {
        'auth': 'auth=' + token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ auth: token })
    });

    const data = await response.json();
    console.log('[Auth] Logout response:', data);
  } catch (error) {
    console.error('[Auth] Logout API error:', error);
  }
}

/**
 * Fetch all channels from the API.
 */
export async function fetchChannels() {
  const token = localStorage.getItem('ulka_token');
  if (!token) throw new Error('No auth token. Please log in first.');

  const response = await fetch(`${API_HOST}${CHANNELS_ENDPOINT}?platform=${PLATFORM_ID}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', auth: 'auth=' + token },
  });

  if (!response.ok) {
    throw new Error(`Channels API HTTP ${response.status}`);
  }

  const data = await response.json();

  if (data.status_code === 200) {
    console.log(`[API] Loaded ${data.response_object.length} channels`);
    return data.response_object;
  }

  console.error('[API] Unexpected response:', data);
  return [];
}

/**
 * Fetch subscribed channel list for the logged-in user.
 * Returns an array of subscribed channel objects.
 */
export async function fetchSubscribedChannels() {
  const token = localStorage.getItem('ulka_token');
  if (!token) throw new Error('No auth token. Please log in first.');

  const response = await fetch(`${API_HOST}${SUBSCRIBED_CHANNEL_LIST_URL}?platform=${PLATFORM_ID}`, {
    method: 'GET',
    headers: {
      'auth': 'auth=' + token,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`Subscribed channels API HTTP ${response.status}`);
  }

  const data = await response.json();
  console.log('[API] Subscribed channels response:', data);

  if (data.status_code === 200 && data.response_object) {
    console.log(`[API] Loaded ${data.response_object.length} subscribed channels`);
    return data.response_object;
  }

  console.error('[API] Subscribed channels unexpected response:', data);
  return [];
}

/**
 * Fetch categories (genres) from the API.
 * Returns an array of { id, name, icon, order } sorted by order.
 */
export async function fetchCategories() {
  const token = localStorage.getItem('ulka_token');
  if (!token) throw new Error('No auth token. Please log in first.');

  const response = await fetch(`${API_HOST}${GENRE_ENDPOINT}`, {
    method: 'GET',
    headers: {
      'auth': 'auth=' + token,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`Categories API HTTP ${response.status}`);
  }

  const data = await response.json();
  console.log('[API] Categories response:', data);
  if (data.status_code === 200 && data.response_object) {
    const categories = data.response_object
      .filter(cat => cat.name?.toLowerCase() !== 'favorites')
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map(cat => ({ id: cat.id, name: cat.name, icon: cat.icon, order: cat.order }));
    console.log(`[API] Loaded ${categories.length} categories`, categories);
    return categories;
  }

  console.error('[API] Categories unexpected response:', data);
  return [];
}

/**
 * Fetch languages (sub-genres) from the API.
 * Returns an array of { id, name }.
 */
export async function fetchLanguages() {
  const token = localStorage.getItem('ulka_token');
  if (!token) throw new Error('No auth token. Please log in first.');

  const response = await fetch(`${API_HOST}${SUB_GENRE_ENDPOINT}`, {
    method: 'GET',
    headers: {
      'auth': 'auth=' + token,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`Languages API HTTP ${response.status}`);
  }

  const data = await response.json();
  console.log('[API] Languages response:', data);

  if (data.status_code === 200 && data.response_object) {
    const languages = data.response_object
      .map(lang => ({ id: lang.id, name: lang.name }));
    console.log(`[API] Loaded ${languages.length} languages`, languages);
    return languages;
  }

  console.error('[API] Languages unexpected response:', data);
  return [];
}

// ─── OTA ─────────────────────────────────────────────────────────────────────

/**
 * Compare two semver strings (e.g. "1.2.3" vs "1.10.0").
 * Returns negative if a < b, 0 if equal, positive if a > b.
 */
function compareVersions(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * Ask the middleware whether a newer version is available.
 *
 * Returns the update payload object when an update exists:
 *   { update_available, version_name, version_code, build_type,
 *     min_version, release_notes, zip_url }
 *
 * Returns null when the installed version is already the latest.
 */
export async function checkOtaUpdate() {
  // ── TEST MODE ─────────────────────────────────────────────────────────────
  // Fetches a static JSON file from the middleware server for testing.
  // Edit the file at: http://180.188.254.254:8080/1/files/linux_stb_ota_check.json
  //   • set "update_available": false  → popup never shows
  //   • set "min_version" to current app version → forced/blocking update
  //   • set "zip_url" to the real ZIP download URL
  // Switch to the real middleware endpoint when ready:
  //   const url = `${API_HOST}${OTA_CHECK_ENDPOINT}?version=${encodeURIComponent(APP_VERSION)}`;
  // ─────────────────────────────────────────────────────────────────────────
  const url = 'http://180.188.254.254:8080/1/files/linux_stb_ota_check.json';

  console.log('[OTA] ── checkOtaUpdate start ──');
  console.log('[OTA] URL            :', url);
  console.log('[OTA] Installed ver  :', APP_VERSION);

  // ── Fetch ─────────────────────────────────────────────────────────────────
  let response;
  try {
    response = await fetch(url, { cache: 'no-store' });
  } catch (networkErr) {
    console.error('[OTA] ✗ Network error — fetch threw:', networkErr.message);
    throw networkErr;
  }

  console.log('[OTA] HTTP status    -', response.status, response.statusText);
  if (!response.ok) throw new Error(`OTA check HTTP ${response.status}`);

  // ── Parse ─────────────────────────────────────────────────────────────────
  // Read as text first so we can log the raw body before JSON.parse — a parse
  // failure in response.json() swallows the body and makes diagnosis impossible.
  let raw, data;
  try {
    raw  = await response.text();
    console.log('[OTA] Raw body       :', raw.slice(0, 400));
    data = JSON.parse(raw);
  } catch (parseErr) {
    console.error('[OTA] ✗ JSON parse failed:', parseErr.message, '| raw:', raw);
    throw parseErr;
  }

  console.log('[OTA] update_available:', data.update_available);
  console.log('[OTA] Server version  :', data.version_name, '| min_version:', data.min_version);

  if (!data.update_available) {
    console.log('[OTA] Server says no update — returning null');
    return null;
  }

  // ── Client-side version guard ─────────────────────────────────────────────
  // Prevents a false positive after OTA completes and the server JSON hasn't
  // been updated yet. Remove once middleware does server-side comparison.
  const cmp = compareVersions(APP_VERSION, data.version_name);
  console.log('[OTA] compareVersions(', APP_VERSION, ',', data.version_name, ') =', cmp, '(>=0 → already up to date)');
  if (cmp >= 0) {
    console.log('[OTA] Already on latest — returning null');
    return null;
  }

  console.log('[OTA] ✓ Update confirmed — returning payload');
  return data;
}

/**
 * Poll the STB-local CGI for the current OTA progress.
 *
 * Returns the status object written by ota-update.sh:
 *   { state, progress, message, error }
 *
 * States: idle | starting | downloading | extracting | verifying | installing | done | error
 *
 * Returns null if the endpoint is unreachable (non-STB environment).
 */
export async function getOtaStatus() {
  const url = `${window.location.origin}/cgi-bin/ota-status.sh`;
  try {
    const res = await fetch(url, { cache: 'no-store' });
    console.log('[OTA] ota-status.sh HTTP:', res.status);
    if (!res.ok) {
      console.log('[OTA] Status endpoint returned', res.status, '— no active update');
      return null;
    }
    const data = await res.json();
    console.log('[OTA] Status response:', JSON.stringify(data));
    return data;
  } catch (err) {
    console.log('[OTA] Status endpoint unreachable (OK if CGI not configured yet):', err.message);
    return null;
  }
}

/**
 * Tell the STB's local CGI to start downloading and installing the update.
 *
 * The popup already has the ZIP URL from the middleware check response, so
 * we pass it straight through — the shell script (ota-update.sh) uses it
 * directly and never calls the middleware API itself.
 *
 * The local lighttpd CGI script (ota-trigger.sh) receives the call, writes
 * the URL to a temp file, and launches ota-update.sh <zip_url> in the
 * background with nohup so it survives the HTTP response closing.
 *
 * Returns true when the trigger was accepted, false otherwise (e.g. in a
 * non-STB browser environment where the CGI doesn't exist).
 *
 * @param {string} zipUrl  The full ZIP download URL returned by checkOtaUpdate()
 */
export async function triggerOtaUpdate(zipUrl) {
  if (!zipUrl) {
    console.error('[OTA] triggerOtaUpdate called without a zip URL');
    return false;
  }

  // Use window.location.origin so the request is always same-origin.
  // Hardcoding 127.0.0.1 causes a cross-origin fetch when the app is
  // accessed via the STB's network IP, triggering a CORS OPTIONS preflight
  // that the CGI script returns 400 for — silently blocking the real POST.
  const triggerUrl = `${window.location.origin}/cgi-bin/ota-trigger.sh`;
  console.log('[OTA] triggerOtaUpdate — url:', triggerUrl, '| zip_url:', zipUrl);

  try {
    const res = await fetch(triggerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ zip_url: zipUrl }),
    });

    const body = await res.text();
    console.log('[OTA] Trigger HTTP status:', res.status, '| body:', body);

    if (!res.ok) {
      console.error('[OTA] Trigger returned HTTP', res.status);
      return false;
    }

    // Parse JSON response — check the "ok" field the script returns
    try {
      const json = JSON.parse(body);
      console.log('[OTA] Trigger response parsed:', json);
      if (!json.ok) {
        console.error('[OTA] Trigger script error:', json.error);
        return false;
      }
    } catch (e) {
      console.warn('[OTA] Trigger response is not JSON:', body);
    }

    return true;
  } catch (err) {
    console.error('[OTA] Trigger fetch failed:', err.message);
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch a PallyCon DRM token for the given contentId.
 * Returns the raw base64Token string from the API response.
 */
export async function fetchDrmToken(contentId) {
  const token = localStorage.getItem('ulka_token');
  if (!token) throw new Error('No auth token in localStorage');

  const encodedContentId = encodeURIComponent(contentId);
  const url = `${PALLYCON_TOKEN_URL}?contentId=${encodedContentId}`;
  console.log('[DRM] Fetching token — contentId:', contentId);
  console.log('[DRM] Encoded contentId:', encodedContentId);
  console.log('[DRM] Token API URL:', url);

  const response = await fetch(url, {
    method: 'GET',
    headers: { auth: 'auth=' + token }
  });

  console.log('[DRM] Token API status:', response.status);

  if (!response.ok) {
    const errText = await response.text();
    console.error('[DRM] Token API error body:', errText);
    throw new Error(`Token API HTTP ${response.status}`);
  }

  const data = await response.json();
  console.log('[DRM] Token API response:', JSON.stringify(data, null, 2));

  if (data.error_code !== 1) {
    throw new Error(`DRM token error: ${data.error_description}`);
  }

  const base64Token = data?.response_object?.[0]?.base64Token;
  if (!base64Token) {
    console.error('[DRM] base64Token missing. Full response:', data);
    throw new Error('base64Token not found in DRM response');
  }

  console.group('[DRM] Token Validation');
  console.log('[DRM] base64Token length:', base64Token.length);
  console.log('[DRM] base64Token (first 80 chars):', base64Token.substring(0, 80));
  console.log('[DRM] base64Token (last 40 chars):', base64Token.substring(Math.max(0, base64Token.length - 40)));
  try {
    const decoded = atob(base64Token);
    const parsed = JSON.parse(decoded);
    console.log('[DRM] Decoded token JSON keys:', Object.keys(parsed));
    console.log('[DRM] Decoded token drm_type:', parsed.drm_type);
    console.log('[DRM] Decoded token cid:', parsed.cid);
    console.log('[DRM] Decoded token site_id:', parsed.site_id);
    console.log('[DRM] Decoded token timestamp:', parsed.timestamp);
  } catch (error) {
    console.error('[DRM] Failed to decode/parse base64Token:', error?.message || error);
  }
  console.groupEnd();

  return base64Token;
}
