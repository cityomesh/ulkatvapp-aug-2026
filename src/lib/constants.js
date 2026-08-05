export { VERSION_NAME as APP_VERSION } from './app_manifest.js';

export const API_HOST          = 'http://202.62.66.115:8080';

export const LOGIN_ENDPOINT      = '/apiv2/credentials/loginMini';
export const LOGOUT_ENDPOINT     = '/apiv2/credentials/logoutLite';

export const GENRE_ENDPOINT      = '/apiv2/channels/genre';
export const SUB_GENRE_ENDPOINT  = '/apiv2/channels/subgenre';
export const CHANNELS_ENDPOINT   = '/apiv2/channels/list';
export const SUBSCRIBED_CHANNEL_LIST_URL = '/apiv2/channels/sublist';

export const PALLYCON_TOKEN_URL  = `${API_HOST}/apiv2/pallycon/TokenIssue`;
export const LICENSE_URL        = 'https://license-global.pallycon.com/ri/licenseManager.do';

export const APP_ID = 1;
export const PLATFORM_ID = 1;

export const OTA_CHECK_ENDPOINT   = '/api/ota/check';
