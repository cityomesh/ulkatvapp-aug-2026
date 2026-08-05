<script>
  import { onDestroy } from "svelte";

  export let channelNumber = null;
  export let triggerKey = 0;
  export let hideAfterMs = 3000;

  let visible = false;
  let timer = null;
  let lastTrigger = null;

  function showTemporarily() {
    visible = true;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      visible = false;
    }, hideAfterMs);
  }

  $: {
    if (channelNumber && triggerKey !== lastTrigger) {
      lastTrigger = triggerKey;
      showTemporarily();
    }
  }

  onDestroy(() => {
    if (timer) clearTimeout(timer);
  });
</script>

{#if channelNumber}
  <div class="top-channel-overlay" class:hidden={!visible}>
    <div class="top-channel-number">{channelNumber}</div>
  </div>
{/if}

<style>
  .top-channel-overlay {
    position: absolute;
    top: 40px;
    left: 40px;
    background: linear-gradient(135deg, rgba(0, 0, 0, 0.85), rgba(0, 0, 0, 0.7));
    backdrop-filter: blur(15px);
    padding: 15px 35px;
    border-radius: 20px;
    border: 3px solid #ffd700;
    box-shadow: 0 0 30px rgba(255, 215, 0, 0.4);
    z-index: 10001;
    transition: opacity 0.3s ease, visibility 0.3s ease;
    animation: pulse 0.5s ease;
  }

  .top-channel-overlay.hidden {
    opacity: 0;
    visibility: hidden;
  }

  .top-channel-number {
    font-size: 64px;
    font-weight: 900;
    color: #ffd700;
    text-shadow: 0 0 20px rgba(255, 215, 0, 0.5);
    letter-spacing: 4px;
    text-align: center;
  }

  @keyframes pulse {
    0% {
      transform: scale(1);
      opacity: 1;
    }
    50% {
      transform: scale(1.05);
      opacity: 0.9;
    }
    100% {
      transform: scale(1);
      opacity: 1;
    }
  }

  @media (max-width: 768px) {
    .top-channel-overlay {
      top: 20px;
      left: 20px;
      padding: 10px 25px;
    }

    .top-channel-number {
      font-size: 48px;
    }
  }
</style>
