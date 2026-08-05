<script>
  import { onMount, onDestroy } from 'svelte';
  import { location } from 'svelte-spa-router';
  import { APP_NAME, VERSION_NAME } from '../lib/app_manifest.js';
  import { checkOtaUpdate, triggerOtaUpdate, getOtaStatus } from '../lib/api.js';

  // ── Portal action ──────────────────────────────────────────────────────────
  // Moves the node to document.body so it escapes #app's stacking context.
  // Old Chromium STB browsers (Chrome ~83) don't always honour position:fixed
  // z-index when the element lives inside a non-body container div.
  function portal(node) {
    document.body.appendChild(node);
    return {
      destroy() {
        node.parentNode?.removeChild(node);
      }
    };
  }

  // ── State ──────────────────────────────────────────────────────────────────
  let visible     = false;   // update-available popup shown
  let otaData     = null;    // payload from checkOtaUpdate()

  let isLoading   = false;   // checking for update
  let isUpdating  = false;   // update triggered, polling in progress
  let updateDone  = false;   // shell script reported "done"
  let updateError = '';

  // Progress (from ota-status.sh polling)
  let statusState   = 'idle';  // mirrors shell script state
  let statusProgress = 0;       // 0-100
  let statusMessage  = '';

  // TV remote focus for the initial popup buttons
  let focusedBtn  = 'update';  // 'update' | 'ignore'

  let pollInterval  = null;
  let hasChecked    = false;  // ensures we only run the auto-check once per session

  // ── Trigger OTA check when user reaches /profile (after login) ───────────────
  // Profile Select is the first authenticated screen — network is stable by this
  // point and the user hasn't entered the main app yet, so focus conflicts with
  // Home.svelte's keyboard handler are avoided entirely.
  // Re-evaluates on every location change so we never miss the transition.
  $: {
    const _loc = $location;
    console.log('[OTA] Route changed →', _loc, '| hasChecked:', hasChecked, '| isUpdating:', isUpdating);
    if (_loc === '/profile' && !hasChecked && !isUpdating) {
      console.log('[OTA] /profile reached — scheduling update check in 2 s');
      hasChecked = true;
      setTimeout(() => performUpdateCheck(false), 2000);
    }
  }

  // ── Computed ───────────────────────────────────────────────────────────────
  /** True when the installed version is below the mandatory minimum. */
  $: isForced = otaData?.min_version
    ? isVersionLower(VERSION_NAME, otaData.min_version)
    : false;

  /** Label shown on the progress card. */
  $: progressLabel = statusMessage || stateLabel(statusState);

  // ── Public API ─────────────────────────────────────────────────────────────
  export function triggerCheck(isManual = false) {
    performUpdateCheck(isManual);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  function isVersionLower(v1, v2) {
    const a = String(v1).split('.').map(Number);
    const b = String(v2).split('.').map(Number);
    for (let i = 0; i < 3; i++) {
      const x = a[i] ?? 0;
      const y = b[i] ?? 0;
      if (x < y) return true;
      if (x > y) return false;
    }
    return false;
  }

  function stateLabel(state) {
    const labels = {
      starting:    'Preparing update…',
      downloading: 'Downloading update…',
      extracting:  'Extracting package…',
      verifying:   'Verifying files…',
      installing:  'Installing update…',
      done:        'Update complete',
      error:       'Update failed',
    };
    return labels[state] || '';
  }

  // ── Polling ────────────────────────────────────────────────────────────────

  function startPolling() {
    if (pollInterval) return;
    pollInterval = setInterval(async () => {
      const status = await getOtaStatus();
      if (!status) return;

      statusState    = status.state;
      statusProgress = status.progress ?? 0;
      statusMessage  = status.message  ?? '';

      if (status.state === 'done') {
        stopPolling();
        isUpdating = false;
        updateDone = true;
        // Give the user a moment to read "Update complete", then reload
        // so lighttpd serves the freshly swapped files.
        setTimeout(() => window.location.reload(), 3000);
      }

      if (status.state === 'error') {
        stopPolling();
        isUpdating  = false;
        updateError = status.error || 'Update failed';
      }
    }, 1000);
  }

  function stopPolling() {
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
  }

  // ── Core logic ─────────────────────────────────────────────────────────────

  async function performUpdateCheck(isManual = false) {
    console.log('[OTA] performUpdateCheck — isManual:', isManual, '| isLoading:', isLoading, '| isUpdating:', isUpdating);
    if (isLoading || isUpdating) {
      console.log('[OTA] Check skipped — already in progress');
      return;
    }
    isLoading   = true;
    updateError = '';

    try {
      console.log('[OTA] Calling checkOtaUpdate...');
      const data = await checkOtaUpdate();
      console.log('[OTA] checkOtaUpdate result:', data ? JSON.stringify(data) : 'null (no update)');

      if (data) {
        otaData    = data;
        visible    = true;
        focusedBtn = 'update';
        console.log('[OTA] ✓ Popup shown for version:', data.version_name);
      } else {
        console.log('[OTA] No update available — popup suppressed');
        if (isManual) console.log('[OTA] Already on latest version:', VERSION_NAME);
      }
    } catch (err) {
      console.error('[OTA] ✗ Update check threw:', err.message);
      if (isManual) updateError = `Update check failed: ${err.message}`;
    } finally {
      isLoading = false;
    }
  }

  async function handleUpdate() {
    if (isUpdating || updateDone) return;

    visible    = false;   // close the initial popup
    isUpdating = true;
    updateError = '';
    statusState    = 'starting';
    statusProgress = 5;
    statusMessage  = 'Preparing update…';

    const ok = await triggerOtaUpdate(otaData.zip_url);
    if (ok) {
      startPolling();
    } else {
      // Non-STB dev environment — simulate progress for testing
      isUpdating  = false;
      updateError = 'OTA trigger not available on this device.';
    }
  }

  function handleIgnore() {
    if (isForced || isUpdating || updateDone) return;
    visible = false;
  }

  // ── Keyboard navigation ────────────────────────────────────────────────────
  function handleKeyDown(e) {
    // ── Forced update in progress — block every key, no exceptions ────────────
    if (isUpdating && isForced) {
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }

    // ── Initial popup visible — handle popup nav, block Home.svelte ───────────
    // stopImmediatePropagation() prevents the event from reaching the window
    // listener in Home.svelte so the channel list doesn't move in the background.
    if (visible) {
      e.preventDefault();
      e.stopImmediatePropagation();
      switch (e.key) {
        case 'ArrowLeft':  focusedBtn = 'update'; break;
        case 'ArrowRight': if (!isForced) focusedBtn = 'ignore'; break;
        case 'Enter':
          if (focusedBtn === 'update') handleUpdate();
          else if (focusedBtn === 'ignore' && !isForced) handleIgnore();
          break;
        case 'Escape':
          if (!isForced) handleIgnore();
          break;
      }
      return;
    }

    // ── Silent update in progress — do nothing, let Home.svelte handle keys ──
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────
  onMount(async () => {
    document.addEventListener('keydown', handleKeyDown);

    console.log('[OTA] ══ OtaUpdatePopup mounted ══');
    console.log('[OTA] App version  :', VERSION_NAME);
    console.log('[OTA] Window URL   :', window.location.href);
    console.log('[OTA] Route (store):', $location);

    // ── Step 1: resume an interrupted update (power cut mid-download) ─────────
    // Wrap in a race so a hung CGI endpoint never blocks the rest of startup.
    console.log('[OTA] Checking for interrupted update via ota-status.sh...');
    const statusTimeout = new Promise(resolve => setTimeout(() => resolve(null), 3000));
    const status = await Promise.race([getOtaStatus(), statusTimeout]);
    console.log('[OTA] Boot status result:', JSON.stringify(status));

    if (status && status.state !== 'idle' && status.state !== 'done' && status.state !== 'error') {
      console.log('[OTA] Resuming interrupted update — state:', status.state);
      isUpdating     = true;
      statusState    = status.state;
      statusProgress = status.progress ?? 0;
      statusMessage  = status.message  ?? '';
      hasChecked     = true;  // block the /home reactive check — we are already updating
      startPolling();
      return;
    }

    // ── Step 2: safety fallback ───────────────────────────────────────────────
    // The reactive $: block above handles the normal case (location store fires
    // when the user navigates to /profile).  This timer is a belt-and-suspenders
    // backup for STB environments where the production bundle's store subscription
    // may behave differently from the dev build.
    const FALLBACK_MS = 15000;
    console.log('[OTA] Fallback timer set for', FALLBACK_MS, 'ms');
    setTimeout(() => {
      if (!hasChecked) {
        console.warn('[OTA] ⚠ Fallback timer fired — reactive /home trigger did NOT run on this device');
        console.log('[OTA] Route at fallback time:', $location);
        hasChecked = true;
        performUpdateCheck(false);
      } else {
        console.log('[OTA] Fallback timer fired — check already triggered, skipping');
      }
    }, FALLBACK_MS);
  });

  onDestroy(() => {
    document.removeEventListener('keydown', handleKeyDown);
    stopPolling();
  });
</script>

<!-- ── Toast banner — single element for all OTA states ───────────────────────
     Replaces the previous complex overlay/modal approach.
     Uses position:fixed top banner — much simpler for STB browsers to render.
     Portal moves it to document.body to escape #app stacking context.
──────────────────────────────────────────────────────────────────────────── -->

{#if visible || isUpdating || updateDone || updateError}
  <div
    class="ota-toast"
    class:ota-toast--forced={isForced && (isUpdating || updateDone)}
    use:portal
  >
    <!-- Left accent bar colour-codes the state -->
    <div
      class="ota-accent"
      class:ota-accent--red={!updateDone && !updateError}
      class:ota-accent--green={updateDone}
      class:ota-accent--yellow={!!updateError}
    ></div>

    <div class="ota-content">

      <!-- ── Row 1: label + message ── -->
      <div class="ota-row">
        <span class="ota-label">
          {#if updateDone}
            UPDATE COMPLETE
          {:else if updateError}
            UPDATE FAILED
          {:else if isUpdating}
            {isForced ? 'MANDATORY UPDATE' : 'UPDATING'}
          {:else if isForced}
            UPDATE REQUIRED
          {:else}
            UPDATE AVAILABLE
          {/if}
        </span>

        <span class="ota-msg">
          {#if updateDone}
            {APP_NAME} updated — restarting...
          {:else if updateError}
            {updateError}
          {:else if isUpdating}
            {progressLabel} &nbsp; {statusProgress}%
          {:else}
            {APP_NAME} {otaData?.version_name ?? ''} is ready &nbsp;|&nbsp; installed v{VERSION_NAME}
          {/if}
        </span>
      </div>

      <!-- ── Row 2: progress bar (while updating) ── -->
      {#if isUpdating && !updateDone && !updateError}
        <div class="ota-bar-track">
          <div class="ota-bar-fill" style="width:{statusProgress}%"></div>
        </div>
      {/if}

    </div>

    <!-- ── Buttons (only on initial prompt) ── -->
    {#if visible && !isUpdating && !updateDone && !updateError}
      <div class="ota-btns">
        <button
          class="ota-btn ota-btn--update"
          class:ota-btn--focused={focusedBtn === 'update'}
          tabindex="-1"
          on:click={handleUpdate}
        >UPDATE</button>
        {#if !isForced}
          <button
            class="ota-btn ota-btn--ignore"
            class:ota-btn--focused={focusedBtn === 'ignore'}
            tabindex="-1"
            on:click={handleIgnore}
          >LATER</button>
        {/if}
      </div>
    {/if}
  </div>
{/if}

<style>
  /* ── Toast wrapper ────────────────────────────────────────────────────────── */
  .ota-toast {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 30000;
    display: flex;
    align-items: center;
    background: #1a1a1a;
    border-bottom: 2px solid #333;
    min-height: 64px;
    padding: 0 20px 0 0;
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.8);
  }

  /* Forced mandatory update: taller banner so it's unmissable */
  .ota-toast--forced {
    min-height: 80px;
    background: #110000;
    border-bottom-color: #e50914;
  }

  /* ── Left colour accent bar ───────────────────────────────────────────────── */
  .ota-accent {
    width: 6px;
    min-height: 64px;
    flex-shrink: 0;
    margin-right: 16px;
  }
  .ota-toast--forced .ota-accent { min-height: 80px; }
  .ota-accent--red    { background: #e50914; }
  .ota-accent--green  { background: #1a7f3c; }
  .ota-accent--yellow { background: #e6b800; }

  /* ── Content area ─────────────────────────────────────────────────────────── */
  .ota-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 10px 0;
  }

  .ota-row {
    display: flex;
    align-items: baseline;
  }
  .ota-row > * + * { margin-left: 14px; }

  .ota-label {
    font-size: 11px;
    font-weight: 900;
    letter-spacing: 1.5px;
    color: #e50914;
    white-space: nowrap;
    flex-shrink: 0;
  }
  .ota-toast--forced .ota-label { color: #ff4444; }

  .ota-msg {
    font-size: 14px;
    font-weight: 500;
    color: #ddd;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* ── Progress bar ─────────────────────────────────────────────────────────── */
  .ota-bar-track {
    margin-top: 8px;
    height: 4px;
    background: #333;
    border-radius: 2px;
    overflow: hidden;
    width: 100%;
  }

  .ota-bar-fill {
    height: 100%;
    background: #e50914;
    border-radius: 2px;
    min-width: 4px;
    transition: width 0.4s ease;
  }

  /* ── Buttons ──────────────────────────────────────────────────────────────── */
  .ota-btns {
    display: flex;
    flex-shrink: 0;
    margin-left: 20px;
  }
  .ota-btns > * + * { margin-left: 10px; }

  .ota-btn {
    height: 40px;
    padding: 0 20px;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 1px;
    border: 2px solid transparent;
    cursor: pointer;
    outline: none;
    white-space: nowrap;
  }

  .ota-btn--update { background: #e50914; color: #fff; }
  .ota-btn--ignore { background: #2a2a2a; color: #aaa; }

  .ota-btn--focused {
    border-color: #fff;
    box-shadow: 0 0 10px rgba(229, 9, 20, 0.6);
  }
  .ota-btn--ignore.ota-btn--focused {
    border-color: #888;
    box-shadow: 0 0 8px rgba(255, 255, 255, 0.2);
  }
</style>
