<script>
  import { onMount, onDestroy } from 'svelte';
  import { push } from 'svelte-spa-router';
  import { activeProfile } from '../stores/appStore.js';
  import { APP_NAME } from '../lib/app_manifest.js';

  // ── LOCAL IMAGES (replace Unsplash/Google) ──────────────────────────────
  const EXIT_IMAGES = [
    "/images/appstore/ottapps/wall5.png",
    "/images/appstore/ottapps/wallapaper.png",
    "/images/appstore/ottapps/wall10.jpg",
    "/images/appstore/ottapps/wall6.png",
  ];

  let imageIndex = 0;
  let bgTimer;

  let selectedButton = 'change';   // 'change' or 'exit'

  // Temporary message (for key feedback)
  let tempMessage = "";
  let tempMessageTimeout;

  // Power state (track locally for toggle)
  let isSystemPoweredOn = true;

  // ── Native Power Bridge (STB specific) ───────────────────────────────────
  function callNativePowerOff() {
    if (typeof window.powerOff === "function") {
      window.powerOff();
    } else if (typeof window.tizen?.power?.off === "function") {
      window.tizen.power.off();
    } else if (typeof window.webview?.powerOff === "function") {
      window.webview.powerOff();
    } else if (typeof window.AndroidTV?.powerOff === "function") {
      window.AndroidTV.powerOff();
    } else {
      showTempMessage("⚠️ Power bridge missing – integrate with STB", true);
      console.log("No native power bridge found for OFF");
    }
  }

  function callNativePowerOn() {
    if (typeof window.powerOn === "function") {
      window.powerOn();
    } else if (typeof window.tizen?.power?.on === "function") {
      window.tizen.power.on();
    } else if (typeof window.webview?.powerOn === "function") {
      window.webview.powerOn();
    } else if (typeof window.AndroidTV?.powerOn === "function") {
      window.AndroidTV.powerOn();
    } else {
      showTempMessage("⚠️ Power bridge missing – integrate with STB", true);
      console.log("No native power bridge found for ON");
    }
  }

  function handlePowerToggle() {
    if (isSystemPoweredOn) {
      callNativePowerOff();
      isSystemPoweredOn = false;
      showTempMessage("📴 Power OFF", false);
    } else {
      callNativePowerOn();
      isSystemPoweredOn = true;
      showTempMessage("🔋 Power ON", false);
    }
  }

  // ── Helper: temporary on‑screen message ─────────────────────────────────
  function showTempMessage(msg, isError = false) {
    if (tempMessageTimeout) clearTimeout(tempMessageTimeout);
    tempMessage = msg;
    tempMessageTimeout = setTimeout(() => {
      tempMessage = "";
    }, 2000);
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  onMount(() => {
    // Preload all exit images for instant display
    EXIT_IMAGES.forEach(src => {
      const img = new Image();
      img.src = src;
    });

    bgTimer = setInterval(() => {
      imageIndex = (imageIndex + 1) % EXIT_IMAGES.length;
    }, 4000);

    window.addEventListener('keydown', handleKeyDown);
  });

  onDestroy(() => {
    clearInterval(bgTimer);
    window.removeEventListener('keydown', handleKeyDown);
    if (tempMessageTimeout) clearTimeout(tempMessageTimeout);
  });

  // ── Keyboard Navigation (full remote support) ───────────────────────────
  function handleKeyDown(e) {
    const keyCode = e.keyCode || e.which;
    const key = e.key;

    // ── Keys that should always work (including Power) ──
    // Prevent default for all remote keys
    const allRemoteKeys = [
      "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter", "Escape", "Backspace",
      17, 18, 152, 403, 404, 405, 406, 226, 227, 228, 19, 20, 14, 36, 16, 15,
      33, 34, 35, 45, 46, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 122, 123,
      48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 96, 97, 98, 99, 100, 101, 102, 103, 104, 105,
      65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90,
      186, 187, 188, 189, 190, 191, 192, 219, 220, 221, 222
    ];
    if (allRemoteKeys.includes(keyCode) || allRemoteKeys.includes(key)) {
      e.preventDefault();
    }

    // ── POWER ───────────────────────────────────────────────────────────────
    if (keyCode === 152) {
      handlePowerToggle();
      return;
    }

    // ── HOME ────────────────────────────────────────────────────────────────
    if (keyCode === 15) {
      window.location.href = "/launcher/index.html";
      return;
    }

    // ── CH UP / DOWN (not used on exit screen) ─────────────────────────────
    if (keyCode === 33) { showTempMessage("CH ▲ – Not available"); return; }
    if (keyCode === 34) { showTempMessage("CH ▼ – Not available"); return; }

    // ── Colored keys ───────────────────────────────────────────────────────
    if (keyCode === 403) { showTempMessage("🔴 Red button"); return; }
    if (keyCode === 404) { showTempMessage("🟢 Green button"); return; }
    if (keyCode === 405) { showTempMessage("🟡 Yellow button"); return; }
    if (keyCode === 406) { showTempMessage("🔵 Blue button"); return; }

    // ── Dedicated OTT apps ─────────────────────────────────────────────────
    if (keyCode === 226) { showTempMessage("Netflix – Not available"); return; }
    if (keyCode === 227) { showTempMessage("Prime Video – Not available"); return; }
    if (keyCode === 228) { showTempMessage("JioStar – Not available"); return; }

    // ── Other function keys ────────────────────────────────────────────────
    if (keyCode === 19) { showTempMessage("Guide – Not available"); return; }
    if (keyCode === 20) { showTempMessage("Live TV – Not available"); return; }
    if (keyCode === 14) { showTempMessage("Setup – Not available"); return; }
    if (keyCode === 36) { showTempMessage("Menu – Not available"); return; }
    if (keyCode === 16) { showTempMessage("Favorites – Not available"); return; }

    // ── Page Up / Down ─────────────────────────────────────────────────────
    if (keyCode === 33) { showTempMessage("Page Up"); return; }
    if (keyCode === 34) { showTempMessage("Page Down"); return; }

    // ── END, INSERT, DELETE ────────────────────────────────────────────────
    if (keyCode === 35) { showTempMessage("End"); return; }
    if (keyCode === 45) { showTempMessage("Insert"); return; }
    if (keyCode === 46) { showTempMessage("Delete"); return; }

    // ── Function keys F1-F12 ───────────────────────────────────────────────
    if (keyCode >= 112 && keyCode <= 123) {
      showTempMessage(`F${keyCode - 111} pressed`);
      return;
    }

    // ── Numeric keys (0-9) – show toast ────────────────────────────────────
    if ((keyCode >= 48 && keyCode <= 57) || (keyCode >= 96 && keyCode <= 105)) {
      let num = String.fromCharCode(keyCode);
      if (keyCode >= 96 && keyCode <= 105) num = String(keyCode - 96);
      showTempMessage(`Number ${num} pressed`);
      return;
    }

    // ── Letters A-Z – show toast ───────────────────────────────────────────
    if (keyCode >= 65 && keyCode <= 90) {
      showTempMessage(`Key ${key} pressed`);
      return;
    }

    // ── Punctuation keys – show toast ──────────────────────────────────────
    const punctMap = {
      186: ";", 187: "=", 188: ",", 189: "-", 190: ".", 191: "/",
      192: "`", 219: "[", 220: "\\", 221: "]", 222: "'"
    };
    if (punctMap[keyCode]) {
      showTempMessage(`Key ${punctMap[keyCode]} pressed`);
      return;
    }

    // ── Existing navigation (Up, Down, Enter, Escape/Backspace) ────────────
    if (key === 'Escape' || key === 'Backspace' || keyCode === 8) {
      push('/home'); // Go back to app
      return;
    }

    if (key === 'ArrowUp' || key === 'ArrowDown') {
      selectedButton = selectedButton === 'change' ? 'exit' : 'change';
    }

    if (key === 'Enter' || keyCode === 13) {
      if (selectedButton === 'change') {
        // Keep auth token, drop profile session, go to profile selection
        sessionStorage.removeItem('ulka_profile_selected');
        push('/profile');
      } else {
        // Redirect to remote app launcher / website
        window.location.href = 'http://127.0.0.1:8080/';
      }
    }
  }
</script>

<!-- ══════════════════════════════════════════════════════════════════════════
     TEMPLATE
══════════════════════════════════════════════════════════════════════════ -->
<div class="exit-container">

  <!-- Left panel: Rotating image (local images) -->
  <div class="exit-left">
    {#each EXIT_IMAGES as img, idx}
      <img
        src={img}
        alt="Exit banner"
        class:visible={imageIndex === idx}
        loading="eager"
      />
    {/each}
  </div>

  <!-- Right panel: Controls -->
  <div class="exit-right">
    <div class="exit-content">
      <div class="exit-greeting">Goodbye, {$activeProfile || 'User'}!</div>
      <div class="exit-title">Exit {APP_NAME}?</div>

      <div class="exit-buttons">
        <!-- Change Profile -->
        <button
          class="exit-button"
          class:focused={selectedButton === 'change'}
          on:click={() => { selectedButton = 'change'; handleKeyDown({key:'Enter', preventDefault:()=>{}, keyCode:13}); }}
          on:keydown={(e) => e.key === "Enter" && handleKeyDown({key:'Enter', preventDefault:()=>{}, keyCode:13})}
          tabindex="0"
        >
          CHANGE PROFILE
        </button>

        <!-- Exit App -->
        <button
          class="exit-button"
          class:focused={selectedButton === 'exit'}
          on:click={() => { selectedButton = 'exit'; handleKeyDown({key:'Enter', preventDefault:()=>{}, keyCode:13}); }}
          on:keydown={(e) => e.key === "Enter" && handleKeyDown({key:'Enter', preventDefault:()=>{}, keyCode:13})}
          tabindex="0"
        >
          EXIT {APP_NAME}
        </button>
      </div>

      <!-- Local logo – path corrected as requested -->
      <img src="/images/appstore/ottapps/UlkaTV.png" alt="ulkatv" class="exit-logo" />
    </div>
  </div>

</div>

<!-- Temporary message overlay -->
{#if tempMessage}
  <div class="temp-message">
    {tempMessage}
  </div>
{/if}

<!-- ══════════════════════════════════════════════════════════════════════════
     STYLES
══════════════════════════════════════════════════════════════════════════ -->
<style>
  .exit-container {
    display: flex;
    width: 100vw;
    height: 100vh;
    background-color: #000;  /* fallback – no white flash */
  }

  /* ── Left Image Banner ── */
  .exit-left {
    width: 75%;
    height: 100%;
    position: relative;
    overflow: hidden;
  }

  .exit-left img {
    width: 100%;
    height: 100%;
    position: absolute;
    top: 0;
    left: 0;
    opacity: 0;
    transition: opacity 1s ease-in-out;
    will-change: opacity;  /* GPU acceleration for smooth transitions */
  }

  .exit-left img.visible {
    opacity: 1;
  }

  /* ── Right Content Panel ── */
  .exit-right {
    width: 25%;
    height: 100%;
    display: flex;
    justify-content: center;
    align-items: center;
    border-left: 2px solid #333;
    background-color: transparent;
  }

  .exit-content {
    width: 100%;
    max-width: 420px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 25px;
    padding: 20px;
  }

  .exit-greeting {
    color: #00D1FF;
    font-size: 24px;
    font-weight: bold;
    text-align: center;
  }

  .exit-title {
    color: #fff;
    font-size: 32px;
    font-weight: 900;
    text-align: center;
  }

  .exit-buttons {
    width: 70%;
    display: flex;
    flex-direction: column;
    gap: 30px;
  }

  .exit-button {
    height: 60px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 15px;
    border: 3px solid rgba(255, 255, 255, 0.2);
    color: #fff;
    font-size: 18px;
    font-weight: bold;
    transition: all 0.2s;
    cursor: pointer;
    background-color: rgba(20, 20, 20, 0.8);
  }

  .exit-button.focused {
    border: 5px solid #ff3b3b;
    background-color: rgba(255, 50, 50, 0.2);
    transform: scale(1.05);
    box-shadow: 0 0 20px rgba(255, 59, 59, 0.5);
  }

  .exit-logo {
    width: 160%;
    max-width: 230px;
    display: flex;
    flex-direction: column;
    margin-top: 8px;
  }

  /* Temporary message overlay */
  .temp-message {
    position: fixed;
    bottom: 80px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(0,0,0,0.85);
    color: #ffd700;
    padding: 12px 24px;
    border-radius: 40px;
    font-size: 20px;
    font-weight: bold;
    z-index: 20001;
    font-family: monospace;
    border-left: 4px solid #e50914;
    white-space: nowrap;
    pointer-events: none;
  }

  /* Responsive fixes if needed */
  @media (min-width: 1600px) {
    .exit-title { font-size: 38px; }
    .exit-greeting { font-size: 32px; }
    .exit-button { height: 56px; font-size: 16px; }
  }
</style>
