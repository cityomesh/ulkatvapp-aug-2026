import { LICENSE_URL } from './constants.js';

/**
 * Mutable DRM token reference — updated before each player.load().
 * The request filter (registered once) reads this by reference,
 * so we never need to tear down and re-register filters per channel switch.
 */
let _currentDrmToken = null;

/**
 * Install Shaka polyfills, attach a new Player, configure DRM + streaming
 * once, and register the license-request filter once.
 *
 * Call this once on mount.  Everything that can be set up front is done here
 * so that subsequent channel switches only need player.load().
 */
export async function initShakaPlayer(videoElement) {
  shaka.polyfill.installAll();

  if (!shaka.Player.isBrowserSupported()) {
    throw new Error('This browser is not supported by Shaka Player');
  }

  const player = new shaka.Player();
  await player.attach(videoElement);

  // ── One-time configuration ──────────────────────────────────────────────
  player.configure({
    drm: {
      servers: {
        'com.widevine.alpha':      LICENSE_URL,
        'com.microsoft.playready': LICENSE_URL
      }
    },
    manifest: {
      retryParameters: { maxAttempts: 2, baseDelay: 100, backoffFactor: 1.4, timeout: 6000 }
    },
    streaming: {
      // Aggressive initial values — ramp up after playback starts
      bufferingGoal:   1,
      rebufferingGoal: 0.3,
      bufferBehind:    10,
      // Limit initial segment prefetch so load() completes faster
      segmentPrefetchLimit: 1,
      // On Ali M3755 the native decoder recovers its own buffer stalls (logged as
      // "Buffer recovered"). Shaka's default stallThreshold of 1 s fires a forward
      // re-seek before the hardware finishes its own recovery, causing a second
      // empty-buffer cycle that adds ~1-1.5 s.  Raising the threshold to 3 s lets
      // the hardware recover without an unnecessary re-seek on every channel switch.
      stallThreshold:  3,
      retryParameters: { maxAttempts: 2, baseDelay: 100, backoffFactor: 1.4, timeout: 6000 }
    }
  });

  // ── Register DRM request filter ONCE ────────────────────────────────────
  const net = player.getNetworkingEngine();
  if (net) {
    net.registerRequestFilter((type, request) => {
      if (type === shaka.net.NetworkingEngine.RequestType.LICENSE && _currentDrmToken) {
        request.headers['pallycon-customdata-v2'] = _currentDrmToken;
      }
    });
  }

  console.log('[Player] Shaka Player initialized (one-time DRM + filter setup)');
  return player;
}

/**
 * Load a stream.  Does NOT call resetConfiguration() — the one-time config
 * from initShakaPlayer() persists.  Only the fast-zap streaming params are
 * reset to their aggressive initial values before each load.
 *
 * @param {shaka.Player} player
 * @param {string}       streamUrl   - DASH/HLS manifest URL
 * @param {string|null}  drmToken    - raw base64Token (null for clear streams)
 * @returns {{ loadMs: number, totalMs: number }}
 */
export async function loadStream(player, streamUrl, drmToken = null) {
  const startedAt = performance.now();

  // Clear buffer-ramp timers from previous channel
  if (player.__bufferRampTimer1) clearTimeout(player.__bufferRampTimer1);
  if (player.__bufferRampTimer2) clearTimeout(player.__bufferRampTimer2);
  player.__bufferRampTimer1 = null;
  player.__bufferRampTimer2 = null;

  // Update the mutable token reference (the filter reads it by reference)
  _currentDrmToken = drmToken;

  // Reset streaming params to aggressive initial values for fast first-frame
  player.configure({
    streaming: {
      bufferingGoal:        1,
      rebufferingGoal:      0.3,
      bufferBehind:         10,
      segmentPrefetchLimit: 1,
      stallThreshold:       3     // keep in sync with initShakaPlayer
    }
  });

  // ── Load ────────────────────────────────────────────────────────────────
  console.log('[Player] Loading:', streamUrl);
  await player.load(streamUrl);
  const loadMs = Math.round(performance.now() - startedAt);
  console.log('[Player] Loaded in', loadMs, 'ms');

  // ── Buffer ramp: gradually increase after playback is stable ────────────
  player.__bufferRampTimer1 = setTimeout(() => {
    player.configure({ streaming: { bufferingGoal: 8, rebufferingGoal: 1.2, bufferBehind: 20 } });
  }, 4000);

  player.__bufferRampTimer2 = setTimeout(() => {
    player.configure({ streaming: { bufferingGoal: 15, rebufferingGoal: 2, bufferBehind: 30 } });
  }, 18000);

  return { loadMs, totalMs: loadMs };
}
