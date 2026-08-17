<script>
  import { onMount, onDestroy } from 'svelte';
  import { push } from 'svelte-spa-router';
  import VirtualKeyboard from '../components/VirtualKeyboard.svelte';

  // ── Form state ──────────────────────────────────────────────
  let nameValue   = '';
  let ageValue    = 18;
  let genderValue = 'Male';   // 'Male' | 'Female'

  // ── Focus state ─────────────────────────────────────────────
  let focusKey = 'name';

  // ── Keyboard state ──────────────────────────────────────────
  let isKeyboardVisible = false;
  let keyboardTarget    = '';
  let keyboard;

  // ── Background rotation ─────────────────────────────────────
  const BG_IMAGES = [
    '/images/appstore/ottapps/wall4.png',
    '/images/appstore/ottapps/wall3.png',
    '/images/appstore/ottapps/wall9.png',
    '/images/appstore/ottapps/wall10.jpg',
  ];
  let bgIndex = 0;
  let bgTimer;

  // ── Temporary message ──────────────────────────────────────
  let tempMessage = "";
  let tempMessageTimeout;

  // ── Power state ─────────────────────────────────────────────
  let isSystemPoweredOn = true;

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

  function showTempMessage(msg) {
    if (tempMessageTimeout) clearTimeout(tempMessageTimeout);
    tempMessage = msg;
    tempMessageTimeout = setTimeout(() => {
      tempMessage = "";
    }, 2000);
  }

  // ── Lifecycle ───────────────────────────────────────────────
  onMount(() => {
    if (!localStorage.getItem('ulka_token')) {
      push('/login');
      return;
    }

    // Preload background images for instant display
    BG_IMAGES.forEach(src => {
      const img = new Image();
      img.src = src;
    });

    document.addEventListener('keydown', handleKeyDown);
    bgTimer = setInterval(() => {
      bgIndex = (bgIndex + 1) % BG_IMAGES.length;
    }, 3000);
  });

  onDestroy(() => {
    document.removeEventListener('keydown', handleKeyDown);
    clearInterval(bgTimer);
    if (tempMessageTimeout) clearTimeout(tempMessageTimeout);
  });

  // ── Keyboard helpers (only for Name) ──────────────────────
  function openKeyboard() {
    if (document.activeElement && typeof document.activeElement.blur === 'function') {
      document.activeElement.blur();
    }
    keyboardTarget = 'name';
    isKeyboardVisible = true;
    if (keyboard) keyboard.reset();
  }

  function closeKeyboard() {
    isKeyboardVisible = false;
    keyboardTarget = '';
  }

  function onKeyboardInput(e) {
    const char = e.detail;
    if (char === 'backspace') {
      nameValue = nameValue.slice(0, -1);
    } else {
      nameValue += char;
    }
  }

  function onKeyboardConfirm() {
    closeKeyboard();
  }

  // ── Gender keyboard handler (Enter/Space to toggle) ──────
  function handleGenderKeydown(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      genderValue = genderValue === 'Male' ? 'Female' : 'Male';
    }
  }

  // ── Full remote control key handling ───────────────────────
  function handleKeyDown(e) {
    const keyCode = e.keyCode || e.which;
    const key = e.key;

    // ── Keys that should work even when keyboard is visible ──
    if (isKeyboardVisible) {
      if (keyCode === 152) { e.preventDefault(); handlePowerToggle(); return; }
      if (keyCode === 15) { e.preventDefault(); window.location.href = "/launcher/index.html"; return; }
      if (keyCode === 14 || keyCode === 21 || keyCode === 36) {
        e.preventDefault();
        showTempMessage("Not available on this screen");
        return;
      }
      if (keyboard) keyboard.handleKey(e.key);
      return;
    }

    // ── Prevent default for remote keys ──────────────────────
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

    // ── POWER / HOME etc. ────────────────────────────────────
    if (keyCode === 152) { handlePowerToggle(); return; }
    if (keyCode === 15) { window.location.href = "/launcher/index.html"; return; }
    if (keyCode === 33 || keyCode === 34) { showTempMessage("CH not available"); return; }
    if (keyCode === 403) { showTempMessage("🔴 Red button"); return; }
    if (keyCode === 404) { showTempMessage("🟢 Green button"); return; }
    if (keyCode === 405) { showTempMessage("🟡 Yellow button"); return; }
    if (keyCode === 406) { showTempMessage("🔵 Blue button"); return; }
    if (keyCode === 226) { showTempMessage("Netflix – Not available"); return; }
    if (keyCode === 227) { showTempMessage("Prime Video – Not available"); return; }
    if (keyCode === 228) { showTempMessage("JioStar – Not available"); return; }
    if (keyCode === 19) { showTempMessage("Guide – Not available"); return; }
    if (keyCode === 20) { showTempMessage("Live TV – Not available"); return; }
    if (keyCode === 14) { showTempMessage("Setup – Not available"); return; }
    if (keyCode === 36) { showTempMessage("Menu – Not available"); return; }
    if (keyCode === 16) { showTempMessage("Favorites – Not available"); return; }
    if (keyCode === 35) { showTempMessage("End"); return; }
    if (keyCode === 45) { showTempMessage("Insert"); return; }
    if (keyCode === 46) { showTempMessage("Delete"); return; }
    if (keyCode >= 112 && keyCode <= 123) { showTempMessage(`F${keyCode-111} pressed`); return; }
    if ((keyCode >= 48 && keyCode <= 57) || (keyCode >= 96 && keyCode <= 105)) {
      let num = String.fromCharCode(keyCode);
      if (keyCode >= 96 && keyCode <= 105) num = String(keyCode - 96);
      showTempMessage(`Number ${num} – Use virtual keyboard for Name only`);
      return;
    }
    if (keyCode >= 65 && keyCode <= 90) {
      showTempMessage(`Key ${key} – Use virtual keyboard for Name only`);
      return;
    }
    const punctMap = {
      186: ";", 187: "=", 188: ",", 189: "-", 190: ".", 191: "/",
      192: "`", 219: "[", 220: "\\", 221: "]", 222: "'"
    };
    if (punctMap[keyCode]) {
      showTempMessage(`Key ${punctMap[keyCode]} – Use virtual keyboard for Name only`);
      return;
    }

    // ── Age adjustment with ArrowUp/Down (when age is focused) ──
    if (focusKey === 'age') {
      if (key === 'ArrowUp') {
        ageValue = Math.min(120, ageValue + 1);
        return;
      }
      if (key === 'ArrowDown') {
        ageValue = Math.max(1, ageValue - 1);
        return;
      }
      // Move focus left/right from age
      if (key === 'ArrowLeft') {
        focusKey = 'name';
        return;
      }
      if (key === 'ArrowRight') {
        focusKey = 'gender';
        return;
      }
    }

    // ── Gender toggle with Left/Right (when gender is focused) ──
    if (focusKey === 'gender') {
      if (key === 'ArrowLeft' || key === 'ArrowRight') {
        genderValue = genderValue === 'Male' ? 'Female' : 'Male';
        return;
      }
    }

    // ── Navigation inside form ────────────────────────────────
    const navKeys = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter", "Backspace"];
    if (!navKeys.includes(key)) return;

    switch (key) {
      case 'ArrowDown':
        if (focusKey === 'name') focusKey = 'age';
        else if (focusKey === 'age') focusKey = 'gender';
        else if (focusKey === 'gender') focusKey = 'save';
        else if (focusKey === 'save') focusKey = 'cancel';
        break;
      case 'ArrowUp':
        if (focusKey === 'age') focusKey = 'name';
        else if (focusKey === 'gender') focusKey = 'age';
        else if (focusKey === 'save') focusKey = 'gender';
        else if (focusKey === 'cancel') focusKey = 'save';
        break;
      case 'ArrowLeft':
        if (focusKey === 'save') focusKey = 'gender';
        else if (focusKey === 'cancel') focusKey = 'save';
        break;
      case 'ArrowRight':
        if (focusKey === 'name') focusKey = 'age';
        else if (focusKey === 'save') focusKey = 'cancel';
        break;
      case 'Enter':
        handleFieldEnter();
        break;
      case 'Backspace':
        if (focusKey === 'name') {
          nameValue = nameValue.slice(0, -1);
        }
        break;
    }
  }

  function handleFieldEnter() {
    if (focusKey === 'name') {
      openKeyboard();
    } else if (focusKey === 'save') {
      handleSave();
    } else if (focusKey === 'cancel') {
      handleCancel();
    } else if (focusKey === 'gender') {
      genderValue = genderValue === 'Male' ? 'Female' : 'Male';
    }
  }

  function handleSave() {
    if (!nameValue.trim()) {
      alert('Please enter a name');
      return;
    }
    const newProfile = {
      id: Date.now().toString(),
      name: nameValue.trim(),
      age: String(ageValue),
      gender: genderValue,
      image: '/images/appstore/profile/Avatar16.png',
    };
    let stored = JSON.parse(localStorage.getItem('ulka_profiles') || '[]');
    if (stored.length >= 3) {
      alert('Maximum 3 profiles reached.');
      return;
    }
    stored.push(newProfile);
    localStorage.setItem('ulka_profiles', JSON.stringify(stored));
    push('/profile');
  }

  function handleCancel() {
    push('/profile');
  }
</script>

<!-- ══════════════════════════════════════════════════════════════
     TEMPLATE
══════════════════════════════════════════════════════════════ -->
<div class="create-profile-container">
  <!-- Full screen background -->
  <div class="background-container">
    {#each BG_IMAGES as src, i}
      <img {src} alt="Background {i+1}" class="bg-slider-image" class:active={bgIndex === i} loading="eager" />
    {/each}
    <div class="overlay"></div>
  </div>

  <!-- Left sidebar panel -->
  <div class="profile-panel">
    <div class="profile-group">
      <h2 class="create-title">Create Profile</h2>

      <!-- Name -->
      <button
        class="input-wrapper name-wrapper"
        class:focused={focusKey === 'name' && !isKeyboardVisible}
        on:click={openKeyboard}
        on:focus={() => focusKey = 'name'}
        tabindex="0"
      >
        <input type="text" placeholder="Name" value={nameValue} readonly />
      </button>

      <!-- Age -->
      <button
        class="input-wrapper age-wrapper"
        class:focused={focusKey === 'age' && !isKeyboardVisible}
        on:focus={() => focusKey = 'age'}
        tabindex="0"
      >
        <input type="text" placeholder="Age" value={ageValue} readonly />
        <span class="age-hint">▲/▼  ◄/►</span>
      </button>

      <!-- Gender toggle -->
      <div
        class="gender-selector"
        class:focused={focusKey === 'gender' && !isKeyboardVisible}
        tabindex="0"
        role="button"
        aria-label="Toggle gender"
        on:focus={() => focusKey = 'gender'}
        on:click={() => { genderValue = genderValue === 'Male' ? 'Female' : 'Male'; }}
        on:keydown={handleGenderKeydown}
      >
        <span class="gender-option" class:active={genderValue === 'Male'}>Male</span>
        <span class="gender-option" class:active={genderValue === 'Female'}>Female</span>
      </div>

      <!-- Action buttons -->
      <div class="action-buttons">
        <button class="action-btn save" class:focused={focusKey === 'save' && !isKeyboardVisible}
                on:click={handleSave} on:focus={() => focusKey = 'save'} tabindex="0">Save</button>
        <button class="action-btn cancel" class:focused={focusKey === 'cancel' && !isKeyboardVisible}
                on:click={handleCancel} on:focus={() => focusKey = 'cancel'} tabindex="0">Cancel</button>
      </div>
    </div>
  </div>
</div>

<!-- Temporary message overlay -->
{#if tempMessage}
  <div class="temp-message">{tempMessage}</div>
{/if}

<!-- Virtual keyboard (only for Name) -->
<VirtualKeyboard bind:this={keyboard} visible={isKeyboardVisible} active={isKeyboardVisible}
                 on:input={onKeyboardInput} on:confirm={onKeyboardConfirm} />

<style>
  .create-profile-container {
    width: 100vw;
    height: 100vh;
    display: flex;
    justify-content: flex-start;
    align-items: center;
    background-color: #020202;  /* fallback – no white flash */
    position: relative;
    overflow: hidden;
  }

  .background-container {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 1;
  }

  .bg-slider-image {
    position: absolute;
    width: 100%;
    height: 100%;
    opacity: 0;
    transition: opacity 1.5s ease-in-out;
    will-change: opacity;  /* GPU acceleration for smooth fades */
  }
  .bg-slider-image.active { opacity: 1; }

  .overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 2;
  }

  .profile-panel {
    display: flex;
    flex-direction: column;
    align-items: center;
    z-index: 10;
    width: 27%;
    height: 100vh;
    padding: 30px 16px 40px;
    background: linear-gradient(to right, rgba(0,0,0,0.92) 50%, rgba(0,0,0,0.7) 80%, transparent 100%);
  }

  .profile-group {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    flex: 1;
    width: 100%;
    max-width: 400px;
  }

  .create-title {
    font-size: 32px;
    font-weight: 700;
    color: #fff;
    margin-bottom: 30px;
    text-align: center;
    width: 100%;
  }

  /* ── All input wrappers, gender selector, and action buttons share equal spacing ── */
  .input-wrapper,
  .gender-selector {
    width: 100%;
    height: 50px;
    background-color: rgba(255,255,255,0.1);
    border: 4px solid #888;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.25s ease-in-out;
    cursor: pointer;
    margin-bottom: 16px;        /* equal gap between all fields */
    position: relative;
    background: none;
    font: inherit;
    color: inherit;
    padding: 0;
  }

  .input-wrapper input {
    flex: 1;
    background: transparent;
    color: #fff;
    border: none;
    outline: none;
    font-size: 16px;
    padding: 0 15px;
    width: 100%;
    pointer-events: none;
  }
  .input-wrapper input::placeholder {
    color: rgba(255,255,255,0.5);
  }

  .input-wrapper.focused,
  .gender-selector.focused,
  .action-btn.focused {
    border-color: #e1001e;
    transform: scale(1.02);
    box-shadow: 0 0 18px rgba(225,0,30,0.6);
  }

  .age-wrapper .age-hint {
    position: absolute;
    right: 12px;
    color: rgba(255,255,255,0.3);
    font-size: 12px;
    letter-spacing: 1px;
  }

  /* ─── Gender selector ───────────────────────────────────── */
  .gender-selector {
    padding: 2px;
    margin-bottom: 16px;        /* same as others */
  }
  .gender-option {
    flex: 1;
    text-align: center;
    padding: 10px 0;
    font-size: 16px;
    font-weight: 500;
    color: #888;
    background: transparent;
    border-radius: 8px;
    transition: all 0.25s;
  }
  .gender-option.active {
    background: #e1001e;
    color: #fff;
    box-shadow: 0 4px 12px rgba(225,0,30,0.4);
  }

  /* ─── Action buttons ────────────────────────────────────── */
  .action-buttons {
    display: flex;
    width: 100%;
    justify-content: space-between;
    gap: 16px;
    margin-top: 16px;          /* equal gap from the last field */
  }
  .action-btn {
    flex: 1;
    height: 50px;
    background-color: rgba(255,255,255,0.1);
    border: 4px solid #888;
    border-radius: 12px;
    font-size: 18px;
    font-weight: bold;
    color: #fff;
    cursor: pointer;
    transition: all 0.25s ease-in-out;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .action-btn.save { background-color: #27ae60; }
  .action-btn.cancel { background-color: #c0392b; }

  /* ─── Temp message ──────────────────────────────────────── */
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

  /* ─── Responsive ────────────────────────────────────────── */
  @media (max-width: 768px) {
    .profile-panel { width: 40%; padding: 20px 12px 30px; }
    .create-title { font-size: 26px; }
  }
  @media (max-width: 480px) {
    .profile-panel { width: 55%; padding: 16px 10px 20px; }
    .create-title { font-size: 22px; }
    .input-wrapper, .gender-selector, .action-btn { height: 44px; }
    .action-buttons { gap: 10px; }
  }
</style>
