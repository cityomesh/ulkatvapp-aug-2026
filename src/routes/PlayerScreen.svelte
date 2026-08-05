<script>
  import { onMount, onDestroy } from "svelte";
  import { push } from "svelte-spa-router";
  import { allChannels, filteredChannels, focusedIdx, playingChannel, statusMsg } from "../stores/appStore.js";
  import VideoPlayer from "../components/VideoPlayer.svelte";
  import ChannelNumberOverlay from "../components/ChannelNumberOverlay.svelte";
  import PlayerScreenError from "../components/PlayerScreenError.svelte";
  import FullScreenOverlay from "../components/FullScreenOverlay.svelte";
  import { ERROR_MESSAGES } from "../lib/errors.js";

  let interactionTick = 0;
  let showError = false;
  let errorMessage = "";
  let errorDetails = "";
  let errorCode = "N/A";
  let shortErrorMessage = "Playback failed";
  let previousStatusText = "";
  let previousStatusError = false;
  let retryAttempt = 0;
  let retryCountdown = 0;
  const maxRetries = 5;
  const baseRetryDelayMs = 5000;
  const maxRetryDelayMs = 60000;
  const zapApplyDelayMs = 100;

  // Channel number input
  let channelNumberInput = "";
  let showChannelNumberInput = false;
  let channelNumberTimeout = null;

  let retryTimer = null;
  let retryTickTimer = null;
  let zapTimer = null;

  function loop(idx, len) {
    if (len === 0) return 0;
    return (idx + len) % len;
  }

  function goHome() {
    clearRetryTimers();
    clearZapTimer();
    console.log("[PlayerScreen] Navigating back to /home");
    push("/home");
  }

  function markInteraction() {
    interactionTick += 1;
    console.log("[PlayerScreen] Interaction tick:", interactionTick);
  }

  function clearRetryTimers() {
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
    if (retryTickTimer) {
      clearInterval(retryTickTimer);
      retryTickTimer = null;
    }
    retryCountdown = 0;
  }

  function clearZapTimer() {
    if (zapTimer) {
      clearTimeout(zapTimer);
      zapTimer = null;
    }
  }

  function resetErrorState() {
    showError = false;
    errorMessage = "";
    errorDetails = "";
    errorCode = "N/A";
    shortErrorMessage = "Playback failed";
    clearRetryTimers();
  }

  function updateCompactError(errorText) {
    const normalized = String(errorText || "Playback failed");
    const lower = normalized.toLowerCase();
    const matchedCode =
      normalized.match(/\((\d{3,5})\)/)?.[1] ||
      normalized.match(/code[:\s]+(\d{3,5})/i)?.[1] ||
      normalized.match(/\b(\d{4})\b/)?.[1] ||
      "N/A";
    errorCode = matchedCode;

    const numericCode = Number(matchedCode);
    if (Number.isFinite(numericCode) && ERROR_MESSAGES[numericCode]) {
      shortErrorMessage = ERROR_MESSAGES[numericCode];
      return;
    }

    if (lower.includes("customdata parsing fail") || lower.includes("errorcode\":7008")) {
      shortErrorMessage = "Authorization token is invalid or expired";
      return;
    }

    shortErrorMessage = "Playback failed";
  }

  function switchChannel(direction) {
    const len = $filteredChannels.length;
    if (len === 0) {
      console.warn("[PlayerScreen] switchChannel aborted: filtered channel list is empty");
      return;
    }
    focusedIdx.update((i) => loop(i + direction, len));
    const channel = $filteredChannels[$focusedIdx];
    if (channel) {
      const keyAt = performance.now();
      console.group("[PlayerScreen] Channel switch");
      console.log("[PlayerScreen] direction:", direction);
      console.log("[PlayerScreen] focusedIdx:", $focusedIdx);
      console.log("[PlayerScreen] channel:", channel);
      console.log("[PlayerScreen] keyTime:", new Date().toISOString());
      console.groupEnd();
      statusMsg.set({ text: `Zapping: ${channel.title}`, isError: false });
      clearZapTimer();
      zapTimer = setTimeout(() => {
        console.log(
          "[PlayerScreen] Apply zapped channel:",
          channel.title,
          "delayMs:",
          Math.round(performance.now() - keyAt)
        );
        playingChannel.set(channel);
        // EPG overlay కోసం interaction tick increment చేయండి (కావాలంటే)
        markInteraction();
      }, zapApplyDelayMs);
      retryAttempt = 0;
      resetErrorState();
    }
  }

  async function retryCurrentChannel() {
    const channel = $playingChannel;
    if (!channel) {
      console.warn("[PlayerScreen] Retry ignored: no current channel");
      return;
    }
    console.group("[PlayerScreen] Retry playback");
    console.log("[PlayerScreen] channel:", channel);
    console.groupEnd();
    resetErrorState();
    playingChannel.set(null);
    await Promise.resolve();
    playingChannel.set(channel);
    // Show retry message with LCN format
    statusMsg.set({ text: `Retrying: ${channel.channel_number} - ${channel.title}`, isError: false });
  }

  function scheduleAutoRetry() {
    if (!$playingChannel) {
      console.warn("[PlayerScreen] Auto-retry skipped: no playing channel");
      return;
    }
    if (retryAttempt >= maxRetries) {
      console.error("[PlayerScreen] Auto-retry exhausted");
      return;
    }

    clearRetryTimers();
    retryAttempt += 1;
    const retryDelayMs = Math.min(
      baseRetryDelayMs * (2 ** (retryAttempt - 1)),
      maxRetryDelayMs
    );
    retryCountdown = Math.ceil(retryDelayMs / 1000);

    console.group("[PlayerScreen] Schedule auto-retry");
    console.log("[PlayerScreen] retryAttempt:", retryAttempt, "/", maxRetries);
    console.log("[PlayerScreen] baseRetryDelayMs:", baseRetryDelayMs);
    console.log("[PlayerScreen] maxRetryDelayMs:", maxRetryDelayMs);
    console.log("[PlayerScreen] retryDelayMs:", retryDelayMs);
    console.log("[PlayerScreen] channel:", $playingChannel);
    console.groupEnd();

    retryTickTimer = setInterval(() => {
      retryCountdown = Math.max(0, retryCountdown - 1);
    }, 1000);

    retryTimer = setTimeout(async () => {
      clearRetryTimers();
      await retryCurrentChannel();
    }, retryDelayMs);
  }

  // ── Channel Number Input Functions ─────────────────────────
  function clearChannelNumberTimeout() {
    if (channelNumberTimeout) {
      clearTimeout(channelNumberTimeout);
      channelNumberTimeout = null;
    }
  }

  function switchToChannelByNumber(inputNumber) {
    const inputNum = parseInt(inputNumber);

    // Search across ALL subscribed channels (not just current filter)
    const channel = $allChannels.find(ch => parseInt(ch.channel_number) === inputNum);

    if (channel) {
      console.log("[PlayerScreen] Switching to channel by number:", inputNumber, channel.title);

      // Update focused index if channel is in current filtered list
      const filteredIndex = $filteredChannels.findIndex(ch => parseInt(ch.channel_number) === inputNum);
      if (filteredIndex !== -1) {
        focusedIdx.set(filteredIndex);
      }

      // Reset error state and apply channel
      retryAttempt = 0;
      resetErrorState();
      clearZapTimer();
      statusMsg.set({ text: `Zapping: ${channel.title}`, isError: false });
      zapTimer = setTimeout(() => {
        playingChannel.set(channel);
        markInteraction();
      }, zapApplyDelayMs);
    } else {
      console.log("[PlayerScreen] Channel not found:", inputNumber);
      statusMsg.set({ text: `Channel ${inputNumber} not found`, isError: true });
      setTimeout(() => {
        if ($statusMsg?.text === `Channel ${inputNumber} not found`) {
          const current = $playingChannel;
          if (current) {
            statusMsg.set({ text: `${current.channel_number} - ${current.title}`, isError: false });
          } else {
            statusMsg.set({ text: "Ready", isError: false });
          }
        }
      }, 2000);
    }

    // Clear input state
    channelNumberInput = "";
    showChannelNumberInput = false;
    clearChannelNumberTimeout();
  }

  function handleNumberInput(number) {
    clearChannelNumberTimeout();
    markInteraction();
    showChannelNumberInput = true;
    channelNumberInput += number;

    if (channelNumberInput.length > 3) {
      channelNumberInput = channelNumberInput.slice(0, 3);
    }

    console.log("[PlayerScreen] Channel input:", channelNumberInput);

    channelNumberTimeout = setTimeout(() => {
      if (channelNumberInput.length > 0) {
        switchToChannelByNumber(channelNumberInput);
      }
    }, 1500);
  }

  // ─────────────────────────────────────────────────────────────
  // KEYBOARD HANDLER (FIXED FOR CH UP/DOWN = PAGEUP/PAGEDOWN)
  // ─────────────────────────────────────────────────────────────
  function handleKeyDown(e) {
    markInteraction();
    const keyCode = e.keyCode || e.which;
    const key = e.key;
    console.log("[PlayerScreen] Keydown - key:", key, "keyCode:", keyCode);

    // ── Handle numeric keys (0-9) for direct channel input ──
    if (/^[0-9]$/.test(key)) {
      e.preventDefault();
      handleNumberInput(key);
      return;
    }

    // Handle Enter key to submit channel number immediately
    if ((key === "Enter" || keyCode === 13) && showChannelNumberInput && channelNumberInput.length > 0) {
      e.preventDefault();
      clearChannelNumberTimeout();
      switchToChannelByNumber(channelNumberInput);
      return;
    }

    // ── CHANNEL UP / DOWN (PAGEUP = 33, PAGEDOWN = 34) ──
    // మీ C code ప్రకారం CHUP → KEY_PAGEUP (33), CHDOWN → KEY_PAGEDOWN (34)
    if (keyCode === 33) {  // PAGEUP = CH UP
      e.preventDefault();
      console.log("[PlayerScreen] CH UP (PAGEUP)");
      switchChannel(1);
      return;
    }
    if (keyCode === 34) {  // PAGEDOWN = CH DOWN
      e.preventDefault();
      console.log("[PlayerScreen] CH DOWN (PAGEDOWN)");
      switchChannel(-1);
      return;
    }

    // ── BACK (Backspace / Escape) ──
    if (key === "Escape" || key === "Backspace" || keyCode === 8 || keyCode === 27) {
      e.preventDefault();
      // If typing a channel number, cancel the input first
      if (showChannelNumberInput) {
        channelNumberInput = "";
        showChannelNumberInput = false;
        clearChannelNumberTimeout();
        return;
      }
      goHome();
      return;
    }

    // ── EPG KEY (usually 19) ──
    if (keyCode === 19) {
      e.preventDefault();
      console.log("[PlayerScreen] EPG key pressed");
      // FullScreenOverlay లో EPG చూపించడానికి interactionTick increment చేయండి
      markInteraction();
      statusMsg.set({ text: "EPG Guide", isError: false });
      setTimeout(() => {
        if ($statusMsg?.text === "EPG Guide") {
          const current = $playingChannel;
          if (current) {
            statusMsg.set({ text: `${current.channel_number}: ${current.title}`, isError: false });
          } else {
            statusMsg.set({ text: "Ready", isError: false });
          }
        }
      }, 2000);
      return;
    }

    // ── Arrow Up/Down as fallback (if remote doesn't send PAGEUP/PAGEDOWN) ──
    if (key === "ArrowUp") {
      e.preventDefault();
      switchChannel(1);
      return;
    }
    if (key === "ArrowDown") {
      e.preventDefault();
      switchChannel(-1);
      return;
    }

    // ── Other keys: prevent default for arrow keys, etc. ──
    if (key.startsWith("Arrow")) e.preventDefault();
  }

  onMount(() => {
    console.log("[PlayerScreen] Mounted");
    console.log("[PlayerScreen] Current channel on mount:", $playingChannel);
    if (!$playingChannel) {
      console.warn("[PlayerScreen] No channel found on mount");
      showError = true;
      errorMessage = "No channel selected";
      errorDetails = "Go back to dashboard, select a channel and open player again.";
    }
    const handleWindowError = (event) => {
      const message = event?.error?.message || event?.message || "Unknown runtime error";
      const stack = event?.error?.stack || "";
      console.error("[PlayerScreen] Window error:", event?.error || event);
      showError = true;
      errorMessage = message;
      errorDetails = stack;
      updateCompactError(message);
    };
    const handleUnhandledRejection = (event) => {
      const reason = event?.reason;
      const message = reason?.message || String(reason || "Unhandled rejection");
      const stack = reason?.stack || "";
      console.error("[PlayerScreen] Unhandled promise rejection:", reason);
      showError = true;
      errorMessage = message;
      errorDetails = stack;
      updateCompactError(message);
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("error", handleWindowError);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);

    cleanup = () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("error", handleWindowError);
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    };
  });

  let cleanup = () => {};

  onDestroy(() => {
    clearZapTimer();
    clearRetryTimers();
    clearChannelNumberTimeout();
    cleanup();
    console.log("[PlayerScreen] Destroyed");
  });

  $: if (
    $statusMsg &&
    ($statusMsg.text !== previousStatusText || $statusMsg.isError !== previousStatusError)
  ) {
    console.log("[PlayerScreen] statusMsg update:", $statusMsg);
    previousStatusText = $statusMsg.text;
    previousStatusError = $statusMsg.isError;
    if ($statusMsg.isError) {
      showError = true;
      errorMessage = $statusMsg.text || "Playback failed";
      errorDetails = [
        `channel: ${$playingChannel?.title || "N/A"}`,
        `stream: ${$playingChannel?.stream_url || "N/A"}`,
        `contentId: ${$playingChannel?.encryption_url || "N/A"}`
      ].join("\n");
      updateCompactError(errorMessage);
      console.group("[PlayerScreen] Playback error context");
      console.error("[PlayerScreen] user-visible error:", errorMessage);
      console.error("[PlayerScreen] channel:", $playingChannel);
      console.groupEnd();
      scheduleAutoRetry();
    } else {
      // Check for successful playback messages (now without "Playing:")
      const looksLikePlaybackSuccess =
        typeof $statusMsg.text === "string" &&
        ($statusMsg.text.includes(":") && !$statusMsg.text.startsWith("Zapping:") && !$statusMsg.text.startsWith("Retrying:"));
      if (looksLikePlaybackSuccess) {
        retryAttempt = 0;
        resetErrorState();
      }
    }
  }
</script>

<div
  class="player-screen"
  role="button"
  tabindex="0"
  on:click={markInteraction}
  on:keydown={(e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      markInteraction();
    }
  }}
>
  <VideoPlayer fullscreen={true} />
  <FullScreenOverlay
    channel={$playingChannel}
    {interactionTick}
  />
  <ChannelNumberOverlay
    channelNumber={$playingChannel?.channel_number || "--"}
    triggerKey={$playingChannel?.id || interactionTick}
    hideAfterMs={3000}
  />
  <PlayerScreenError
    visible={showError}
    code={errorCode}
    shortMessage={shortErrorMessage}
    retryInSeconds={retryCountdown}
    {retryAttempt}
    {maxRetries}
  />

  <!-- Channel Number Input Overlay -->
  {#if showChannelNumberInput}
    <div class="channel-number-overlay">
      <div class="channel-number-box">
        <span class="channel-prefix">CH</span>
        <span class="channel-digits">{channelNumberInput || "---"}</span>
      </div>
    </div>
  {/if}
</div>

<style>
  .player-screen {
    position: fixed;
    inset: 0;
    width: 100vw;
    height: 100vh;
    background: #000;
    z-index: 9999;
  }

  .player-screen :global(#video-player) {
    width: 100%;
    height: 100%;
    object-fit: contain;
    display: block;
  }

  /* Channel Number Input Overlay */
  .channel-number-overlay {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 20000;
    animation: fadeInScale 0.2s ease-out;
  }

  .channel-number-box {
    background: linear-gradient(135deg, rgba(0, 0, 0, 0.95), rgba(0, 0, 0, 0.85));
    backdrop-filter: blur(20px);
    border: 3px solid #ffd700;
    border-radius: 20px;
    padding: 25px 50px;
    text-align: center;
    box-shadow: 0 0 50px rgba(255, 215, 0, 0.5);
    min-width: 300px;
  }

  .channel-prefix {
    font-size: 48px;
    font-weight: bold;
    color: #ffd700;
    margin-right: 20px;
    text-shadow: 0 0 10px rgba(255, 215, 0, 0.5);
  }

  .channel-digits {
    font-size: 72px;
    font-weight: 900;
    color: #ffffff;
    letter-spacing: 8px;
    text-shadow: 0 0 20px rgba(255, 255, 255, 0.5);
    font-family: monospace;
  }

  @keyframes fadeInScale {
    from {
      opacity: 0;
      transform: translate(-50%, -50%) scale(0.8);
    }
    to {
      opacity: 1;
      transform: translate(-50%, -50%) scale(1);
    }
  }
</style>
