const ERROR_MESSAGES = {
  1001: "Could not load stream",
  1002: "Stream unavailable",
  1003: "Stream connection timed out",
  2000: "Network error, check your connection",
  3001: "Invalid license, cannot decrypt content",
  3002: "Could not retrieve license",
  3003: "License rejected by server",
  3004: "Content is encrypted and cannot be played",
  3016: "No license server configured",
  4001: "Stream manifest error",
  4002: "Could not parse stream manifest",
  4003: "Manifest server returned an error",
  4008: "No segment info in stream",
  4010: "Invalid playlist format",
  4012: "Invalid playlist structure",
  4017: "Unsupported encryption format",
  4032: "Authorization token is invalid",
  5001: "Render error, could not decode stream",
  5005: "Video render error",
  5006: "Render error, media source failed",
  6001: "Could not load stream",
  6002: "Could not load stream segment",
  6004: "Render error, could not parse stream",
  6007: "Could not parse license response"
};

export function getErrorMessage(code) {
  if (code && ERROR_MESSAGES[Number(code)]) {
    return ERROR_MESSAGES[Number(code)];
  }
  return null;
}

export { ERROR_MESSAGES };
