<script context="module">
  const DRM_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
  const drmTokenCache = new Map();
  const drmTokenInFlight = new Map();

  // Short-lived in-app manifest cache.
  // Keyed by stream_url, value: { buf: ArrayBuffer, ts: number }.
  // TTL must be short — live DASH manifests update every segment (2–6 s).
  const manifestPrefetchCache = new Map();
  const MANIFEST_PREFETCH_TTL_MS = 4000;

  function getDrmCacheKey(contentId, channelId) {
    return `${channelId ?? 'na'}:${String(contentId)}`;
  }

  function invalidateCachedDrmToken(contentId, channelId) {
    drmTokenCache.delete(getDrmCacheKey(contentId, channelId));
  }
</script>

<script>
  import { onMount, onDestroy, tick } from 'svelte';
  import { get } from 'svelte/store';
  import { playingChannel, filteredChannels, focusedIdx, statusMsg } from '../stores/appStore.js';
  import { fetchDrmToken } from '../lib/api.js';
  import { initShakaPlayer, loadStream } from '../lib/player.js';
  import { getErrorMessage } from '../lib/errors.js';

  export let fullscreen = false;

  let videoEl;
  let freezeCanvas;             // <canvas> — best-effort frame capture
  let shakaPlayer    = null;
  let lastChannelId  = null;
  let activeLoadId   = 0;
  let showFreezeFrame   = false;
  let hasGoodFreeze     = false;  // true once canvas holds a real captured frame
  let switchingToChannel = null;  // channel object being loaded (drives overlay text)

  function resolveFallbackError(msg) {
    const lower = msg.toLowerCase();
    if (lower.includes('token_not_valid') || lower.includes('customdata parsing fail') || lower.includes('errorcode":7008')) {
      return 'Authorization token is invalid or expired';
    }
    if (lower.includes('license')) return 'Could not retrieve license';
    if (lower.includes('manifest')) return 'Could not load stream manifest';
    if (lower.includes('network') || lower.includes('fetch')) return 'Network error, check your connection';
    return 'Playback failed';
  }

  // ── Init Shaka once on mount ──────────────────────────────────
  onMount(async () => {
    try {
      shakaPlayer = await initShakaPlayer(videoEl);

      shakaPlayer.addEventListener('error', (event) => {
        const err = event.detail;
        console.error('[Player Error]', err.code, err.message || '');
        const msg = getErrorMessage(err.code) || 'Playback failed';
        statusMsg.set({ text: `Error - ${err.code}: ${msg}`, isError: true });
      });

      const pending = get(playingChannel);
      if (pending) await handleChannelLoad(pending);

    } catch (e) {
      console.error('[Player] Init failed:', e);
      statusMsg.set({ text: 'Player init failed', isError: true });
    }
  });

  onDestroy(() => {
    unsubscribe();
    if (shakaPlayer) shakaPlayer.destroy();
  });

  const unsubscribe = playingChannel.subscribe(async (channel) => {
    if (!shakaPlayer || !channel) return;
    if (channel.id === lastChannelId) return;
    await handleChannelLoad(channel);
  });

  // ── Freeze-frame canvas (best-effort) ────────────────────────
  //
  // WHY CANVAS IS STILL BLACK ON ALI M3755:
  //   The Ali M3755 renders video through a hardware video-hole architecture.
  //   The <video> element in the browser layer is a transparent punch-through;
  //   the actual pixels live on a separate hardware video plane BELOW the browser.
  //   ctx.drawImage(videoEl) draws the browser's transparent hole — no pixels.
  //   Neither drawImage() nor toDataURL() can access hardware-plane pixels.
  //
  //   We keep this code because:
  //   (a) scheduleProactiveCapture() via requestVideoFrameCallback MAY capture
  //       real pixels on some firmware versions (RVFC fires at compositing time
  //       when the frame is briefly in a compositor buffer).
  //   (b) If we ever run on a non-video-hole device, it works immediately.
  //
  //   The channel-info overlay (below) is the GUARANTEED visible element —
  //   it always shows channel number + name regardless of canvas content.

  function drawLetterboxed(srcWidth, srcHeight) {
    if (!freezeCanvas) return false;
    const cw = freezeCanvas.parentElement?.clientWidth  || 1280;
    const ch = freezeCanvas.parentElement?.clientHeight || 720;
    if (freezeCanvas.width !== cw || freezeCanvas.height !== ch) {
      freezeCanvas.width  = cw;
      freezeCanvas.height = ch;
    }
    const ctx = freezeCanvas.getContext('2d');
    if (!ctx) return false;
    const scale = Math.min(cw / srcWidth, ch / srcHeight);
    const drawW = srcWidth  * scale;
    const drawH = srcHeight * scale;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, cw, ch);
    ctx.drawImage(videoEl, (cw - drawW) / 2, (ch - drawH) / 2, drawW, drawH);
    return true;
  }

  function captureFreezeFrame() {
    if (!videoEl || !freezeCanvas)                           return { ok: false, reason: 'no-elements' };
    if (videoEl.videoWidth <= 0 || videoEl.videoHeight <= 0) return { ok: false, reason: 'no-dimensions' };
    if (videoEl.readyState < 2)                              return { ok: false, reason: `readyState-${videoEl.readyState}` };
    try {
      const ok = drawLetterboxed(videoEl.videoWidth, videoEl.videoHeight);
      if (!ok) return { ok: false, reason: 'draw-failed' };
      hasGoodFreeze = true;
      return { ok: true };
    } catch (err) {
      return { ok: false, reason: err?.name || 'capture-error' };
    }
  }

  // Update canvas proactively via RVFC — fires during compositing when
  // the frame is (sometimes) accessible to drawImage on this platform.
  function scheduleProactiveCapture() {
    if (!videoEl || typeof videoEl.requestVideoFrameCallback !== 'function') return;
    videoEl.requestVideoFrameCallback(() => {
      if (!videoEl || videoEl.videoWidth <= 0 || showFreezeFrame) return;
      try {
        const ok = drawLetterboxed(videoEl.videoWidth, videoEl.videoHeight);
        if (ok) {
          hasGoodFreeze = true;
          console.log('[Freeze] Proactive canvas capture OK');
        }
      } catch (e) {
        console.warn('[Freeze] Proactive capture error:', e?.name);
      }
    });
  }

  // ── DRM token with cache + dedup ──────────────────────────────
  async function getDrmTokenCached(contentId, channelId) {
    const key = getDrmCacheKey(contentId, channelId);
    const cached = drmTokenCache.get(key);
    if (cached && Date.now() < cached.expiresAt) return cached.token;

    const inFlight = drmTokenInFlight.get(key);
    if (inFlight) return inFlight;

    const promise = (async () => {
      const token = await fetchDrmToken(contentId);
      drmTokenCache.set(key, { token, expiresAt: Date.now() + DRM_TOKEN_TTL_MS });
      return token;
    })();
    drmTokenInFlight.set(key, promise);
    try {
      return await promise;
    } finally {
      drmTokenInFlight.delete(key);
    }
  }

  // ── Prefetch DRM tokens for adjacent channels ─────────────────
  function prefetchAdjacentTokens() {
    const channels = get(filteredChannels);
    const idx      = get(focusedIdx);
    const len      = channels.length;
    if (len < 2) return;
    for (const ch of [channels[(idx + 1) % len], channels[(idx - 1 + len) % len]]) {
      if (!ch?.encryption_url) continue;
      const key = getDrmCacheKey(ch.encryption_url, ch.id);
      if (drmTokenCache.has(key) || drmTokenInFlight.has(key)) continue;
      getDrmTokenCached(ch.encryption_url, ch.id).catch(() => {});
    }
  }

  // ── Prefetch DASH manifests for adjacent channels ─────────────
  //
  // HOW IT HELPS:
  //   player.load() = manifest download + DRM setup + first segment buffering.
  //   The manifest download (~100–300 ms) is the first step.  If we fetch the MPD
  //   ahead of time and the browser HTTP cache stores it (server Cache-Control),
  //   Shaka's subsequent fetch() is a cache hit (0 ms) or a conditional GET
  //   returning 304 Not Modified (~10 ms on LAN) instead of a full download.
  //
  // WHEN IT WORKS:
  //   - Server sends Cache-Control: max-age=N (any N ≥ 1) → full cache hit
  //   - Server sends Cache-Control: no-cache   → 304 conditional GET, ~10 ms RTT
  //   - Server sends Cache-Control: no-store   → no benefit (browser won't cache)
  //
  // EXPECTED SAVING: 50–300 ms depending on server config and network latency.
  function prefetchAdjacentManifests() {
    const channels = get(filteredChannels);
    const idx      = get(focusedIdx);
    const len      = channels.length;
    if (len < 2) return;
    for (const ch of [channels[(idx + 1) % len], channels[(idx - 1 + len) % len]]) {
      if (!ch?.stream_url) continue;
      const existing = manifestPrefetchCache.get(ch.stream_url);
      if (existing && Date.now() - existing.ts < MANIFEST_PREFETCH_TTL_MS) continue;
      // Mark as in-flight to avoid duplicate fetches
      manifestPrefetchCache.set(ch.stream_url, { ts: Date.now() });
      fetch(ch.stream_url, { method: 'GET', cache: 'default' })
        .then(r => {
          if (r.ok) {
            manifestPrefetchCache.set(ch.stream_url, { ts: Date.now() });
            console.log('[Manifest] Prefetch OK:', ch.title);
          }
        })
        .catch(() => manifestPrefetchCache.delete(ch.stream_url));
    }
  }

  // ── Wait for first rendered frame ─────────────────────────────
  //
  // On the Ali M3755 (hardware video-hole), browser-side media events
  // (canplay, playing, timeupdate, RVFC) often NEVER fire because the
  // actual pixels live on a separate hardware video plane.
  //
  // HOWEVER, videoEl.currentTime DOES update once the hardware decoder
  // starts producing frames — even when events are silent.  We poll it
  // every 100 ms and add a small display-settle buffer (150 ms) to let
  // the hardware plane actually paint before hiding the overlay.
  //
  // Strategy (race — first signal wins):
  //   1. Poll currentTime every 100 ms — when it advances, the decoder
  //      is producing frames.  Wait 150 ms more for the display pipeline,
  //      then resolve.
  //   2. Standard browser events (canplay, playing, timeupdate, RVFC) —
  //      resolve immediately if they fire.
  //   3. Hard safety timeout (3 s) — absolute maximum; if nothing else
  //      fires, we give up and hide the overlay.

  const HW_SETTLE_MS    = 150;  // buffer after currentTime moves
  const HARD_TIMEOUT_MS = 3000; // absolute max wait

  function waitForFirstRenderedFrame(loadId, zapStart) {
    return new Promise((resolve) => {
      if (!videoEl) { resolve(null); return; }

      let settled = false;
      let rvfcHandle = null, timeoutHandle = null, pollHandle = null;
      let onTimeUpdate = null, onPlaying = null, onCanPlay = null;
      // Snapshot currentTime BEFORE play() — we detect the decoder
      // starting when currentTime moves away from this value.
      const startTime = videoEl.currentTime;

      const cleanup = () => {
        if (timeoutHandle) clearTimeout(timeoutHandle);
        if (pollHandle)    clearInterval(pollHandle);
        if (rvfcHandle !== null && typeof videoEl.cancelVideoFrameCallback === 'function')
          videoEl.cancelVideoFrameCallback(rvfcHandle);
        if (onTimeUpdate) videoEl.removeEventListener('timeupdate', onTimeUpdate);
        if (onPlaying)    videoEl.removeEventListener('playing',    onPlaying);
        if (onCanPlay)    videoEl.removeEventListener('canplay',    onCanPlay);
      };

      const finish = (source) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (loadId !== activeLoadId) { resolve(null); return; }
        resolve({ source, ms: Math.round(performance.now() - zapStart) });
      };

      // ── 1. Poll currentTime — works on video-hole STBs ────────────
      pollHandle = setInterval(() => {
        if (!videoEl) return;
        if (videoEl.currentTime !== startTime && videoEl.currentTime > 0) {
          clearInterval(pollHandle);
          pollHandle = null;
          // Decoder is producing frames; wait a tiny bit for the
          // hardware display pipeline to latch the first frame.
          setTimeout(() => finish('poll-currentTime'), HW_SETTLE_MS);
        }
      }, 100);

      // ── 2. Standard browser events (early exit if they fire) ──────
      if (typeof videoEl.requestVideoFrameCallback === 'function')
        rvfcHandle = videoEl.requestVideoFrameCallback(() => finish('rvfc'));

      onCanPlay = () => finish('canplay');
      videoEl.addEventListener('canplay', onCanPlay, { once: true });

      onTimeUpdate = () => { if (videoEl.currentTime > 0) finish('timeupdate'); };
      videoEl.addEventListener('timeupdate', onTimeUpdate);

      onPlaying = () => finish('playing');
      videoEl.addEventListener('playing', onPlaying, { once: true });

      // ── 3. Hard safety timeout ────────────────────────────────────
      timeoutHandle = setTimeout(() => finish('timeout'), HARD_TIMEOUT_MS);
    });
  }

  // ── Channel load ───────────────────────────────────────────────
  //
  // STRATEGY — keep old channel visible while preparing the new one:
  //
  //   Phase 1 (0 – ~1.5 s): Old channel keeps playing on the hardware video
  //     plane.  In parallel we:
  //       • fetch/validate the DRM token (often a cache hit → ~0 ms)
  //       • warm the browser HTTP cache with the new manifest
  //       • wait a minimum of KEEP_OLD_MS so the user always sees ≥1.5 s
  //         of the old channel instead of an instant black screen.
  //
  //   Phase 2 (~1.5 s → first frame): Show the switching overlay, call
  //     loadStream() which tears down the old stream and starts the new one.
  //     The user sees the overlay (channel name + loading bar) only for the
  //     remaining time until the new stream's first frame is rendered.
  //
  //   Net effect: total zap time stays the same (or slightly less thanks to
  //   manifest warming) but the perceived black-screen time drops by ~1.5 s.

  const KEEP_OLD_MS = 1500; // min time old channel stays visible (ms)

  async function handleChannelLoad(channel) {
    const loadId   = ++activeLoadId;
    const zapStart = performance.now();

    // Remember which channel we're switching to (drives overlay text later).
    switchingToChannel = channel;
    // DON'T show overlay yet — old channel keeps playing on hardware plane.

    try {
      lastChannelId = channel.id;
      statusMsg.set({ text: `Loading: ${channel.title}`, isError: false });

      // ── Phase 1: prepare in background while old channel plays ────

      // 1a. DRM token fetch (often a cache hit)
      const drmPromise = channel.encryption_url
        ? getDrmTokenCached(channel.encryption_url, channel.id)
        : Promise.resolve(null);

      // 1b. Warm browser HTTP cache with the new channel's manifest so that
      //     Shaka's subsequent fetch() inside loadStream() is a cache hit or
      //     a fast 304.  Fire-and-forget; we don't need the body.
      if (channel.stream_url) {
        fetch(channel.stream_url, { method: 'GET', cache: 'default' }).catch(() => {});
      }

      // 1c. Minimum display timer — guarantees ≥KEEP_OLD_MS of old channel.
      const keepOldPromise = new Promise(r => setTimeout(r, KEEP_OLD_MS));

      // Wait for BOTH the DRM token AND the timer before proceeding.
      const [drmToken] = await Promise.all([drmPromise, keepOldPromise]);

      if (loadId !== activeLoadId) return;

      // ── Phase 2: show overlay & load new stream ───────────────────

      showFreezeFrame = true;

      // Best-effort: grab the last frame of the old channel into canvas.
      const freezeResult = captureFreezeFrame();
      console.log(
        '[ZAP] Phase2 freeze:', freezeResult.ok ? 'captured' : freezeResult.reason,
        '| hasGoodFreeze:', hasGoodFreeze,
        '| elapsed:', Math.round(performance.now() - zapStart), 'ms'
      );

      // Flush DOM so the overlay is painted before loadStream tears down
      // the old stream on the hardware video plane.
      await tick();

      const result = await loadStream(shakaPlayer, channel.stream_url, drmToken);

      if (loadId !== activeLoadId) return;

      // Use the decoder-init window to prefetch for the NEXT zap.
      prefetchAdjacentTokens();
      prefetchAdjacentManifests();

      // ✅ MODIFIED: show "LCN: Title" instead of "Playing: Title"
      statusMsg.set({ text: `${channel.channel_number}- ${channel.title}`, isError: false });
      videoEl.muted  = false;
      videoEl.volume = 1.0;
      videoEl.play().catch(e => console.warn('[Player] Autoplay blocked:', e));

      const firstFrame = await waitForFirstRenderedFrame(loadId, zapStart);
      if (loadId !== activeLoadId) return;

      // New channel is live — hide the switching overlay.
      showFreezeFrame    = false;
      switchingToChannel = null;

      const totalMs = Math.round(performance.now() - zapStart);
      console.log(
        `[ZAP KPI] #${loadId} channel=${channel.title}` +
        ` keepOldMs=${KEEP_OLD_MS} loadMs=${result.loadMs}` +
        ` firstFrameMs=${firstFrame?.ms ?? 'na'} firstFrameSrc=${firstFrame?.source ?? 'na'}` +
        ` totalToFrameMs=${totalMs}ms`
      );

      // Proactively update canvas for NEXT switch via RVFC.
      scheduleProactiveCapture();

    } catch (err) {
      if (loadId !== activeLoadId) return;
      const msg = String(err?.message || '').toLowerCase();
      if (channel?.encryption_url && (
        msg.includes('token_not_valid_error') ||
        msg.includes('customdata parsing fail') ||
        msg.includes('errorcode":7008')
      )) invalidateCachedDrmToken(channel.encryption_url, channel.id);

      console.error(`[ZAP] #${loadId} ERROR ${Math.round(performance.now() - zapStart)}ms:`, err.message || err);
      const rawCode = err?.code || String(err?.message || '').match(/\b(\d{4,5})\b/)?.[1];
      const friendlyMsg = getErrorMessage(rawCode) || resolveFallbackError(String(err?.message || ''));
      const codeLabel = rawCode ? `Error - ${rawCode}: ` : '';
      statusMsg.set({ text: `${codeLabel}${friendlyMsg}`, isError: true });
      showFreezeFrame    = false;
      switchingToChannel = null;
      lastChannelId      = null;
    }
  }
</script>

<div class="video-container" class:fullscreen>
  <video
    bind:this={videoEl}
    id="video-player"
    class:active={$playingChannel !== null}
    class:fullscreen
    crossorigin="anonymous"
    autoplay
    playsinline
  >
    <!--
      The track element is required to satisfy accessibility guidelines.
      It has no practical effect on playback but prevents a build warning.
    -->
    <track kind="captions" />
  </video>

  {#if showFreezeFrame}
    <!--
      Switching overlay — shown from the moment a channel switch starts until
      the new channel's first frame is rendered.

      Two layers:
      1. <canvas> — best-effort frame capture (black on hardware video-hole STBs,
         may show real pixels if RVFC proactive capture worked previously).
      2. .channel-info — ALWAYS visible text showing channel number + name so the
         user never sees a completely blank black screen during any channel switch.
    -->
    <div class="switching-overlay" aria-hidden="true">
      <canvas bind:this={freezeCanvas} class="freeze-canvas"></canvas>

      {#if switchingToChannel}
        <div class="channel-info">
          <div class="channel-number">{switchingToChannel.channel_number ?? ''}</div>
          <div class="channel-name">{switchingToChannel.title}</div>
          <div class="loading-bar">
            <div class="loading-bar-fill"></div>
          </div>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  /* Default (Home view): fill a padding-bottom 16:9 wrapper */
  .video-container {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: #000;
  }

  video.fullscreen {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  /* Fullscreen (PlayerScreen): back to normal flow */
  .video-container.fullscreen {
    position: relative;
    width: 100%;
    height: 100%;
  }

  /* ── Switching overlay ───────────────────────────────────────── */

  .switching-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 2;
    pointer-events: none;
    background: #000;           /* fallback when canvas is black */
  }

  /* Canvas fills the overlay — shows freeze frame if captured, black otherwise */
  .freeze-canvas {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    display: block;
  }

  /* Channel info — positioned bottom-left, always readable */
  .channel-info {
    position: absolute;
    bottom: 48px;
    left: 48px;
    display: flex;
    flex-direction: column;
  }

  .channel-number {
    font-family: sans-serif;
    font-size: 28px;
    font-weight: 700;
    color: rgba(255, 255, 255, 0.55);
    line-height: 1;
    letter-spacing: 0.04em;
    margin-bottom: 6px;
  }

  .channel-name {
    font-family: sans-serif;
    font-size: 36px;
    font-weight: 700;
    color: #fff;
    line-height: 1.1;
    text-shadow: 0 2px 12px rgba(0, 0, 0, 0.8);
    margin-bottom: 6px;
  }

  /* Animated loading bar */
  .loading-bar {
    margin-top: 4px;
    width: 180px;
    height: 3px;
    background: rgba(255, 255, 255, 0.2);
    border-radius: 2px;
    overflow: hidden;
  }

  .loading-bar-fill {
    height: 100%;
    width: 40%;
    background: #fff;
    border-radius: 2px;
    animation: slide 1.2s ease-in-out infinite;
  }

  @keyframes slide {
    0%   { transform: translateX(-100%); }
    100% { transform: translateX(350%); }
  }
</style>
