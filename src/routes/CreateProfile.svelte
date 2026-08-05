<script>
  import { onMount, onDestroy } from 'svelte';
  import { push } from 'svelte-spa-router';
  import VirtualKeyboard from '../components/VirtualKeyboard.svelte';

  // ── Form state ──────────────────────────────────────────────
  let nameValue   = '';
  let ageValue    = '';
  let genderValue = null;   // 'Male' | 'Female' | null

  // ── Focus state ─────────────────────────────────────────────
  // 'name' | 'age' | 'gender_male' | 'gender_female' | 'save' | 'cancel'
  let focusKey = 'name';

  // ── Keyboard state ──────────────────────────────────────────
  let isKeyboardVisible = false;
  let keyboardTarget    = '';   // 'name' | 'age'
  let keyboard;                 // component ref

  // ── Background rotation ─────────────────────────────────────
  const BG_IMAGES = [
    '/images/appstore/ottapps/wall4.png',
    '/images/appstore/ottapps/wall3.png',
    '/images/appstore/ottapps/wall9.png',
    '/images/appstore/ottapps/wall10.jpg',
  ];
  let bgIndex = 0;
  let bgTimer;

  // ── Temporary message (for key feedback) ───────────────────
  let tempMessage = "";
  let tempMessageTimeout;

  // ── Power state (track locally for toggle) ─────────────────
  let isSystemPoweredOn = true;

  // ── Native Power Bridge (STB specific) ─────────────────────
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

  // ── Helper: temporary on‑screen message ────────────────────
  function showTempMessage(msg, isError = false) {
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

  // ── Keyboard helpers ────────────────────────────────────────
  function openKeyboard(target) {
    if (document.activeElement && typeof document.activeElement.blur === 'function') {
      document.activeElement.blur();
    }
    keyboardTarget    = target;
    isKeyboardVisible = true;
    if (keyboard) keyboard.reset();
  }

  function closeKeyboard() {
    isKeyboardVisible = false;
    keyboardTarget    = '';
  }

  function onKeyboardInput(e) {
    const char = e.detail;
    if (char === 'backspace') {
      if      (keyboardTarget === 'name')  nameValue  = nameValue.slice(0, -1);
      else if (keyboardTarget === 'age')   ageValue   = ageValue.slice(0, -1);
    } else {
      if      (keyboardTarget === 'name')  nameValue  += char;
      else if (keyboardTarget === 'age')   ageValue   += char;
    }
  }

  function onKeyboardConfirm() {
    closeKeyboard();
  }

  // ── Full remote control key handling ───────────────────────
  function handleKeyDown(e) {
    const keyCode = e.keyCode || e.which;
    const key = e.key;

    // ── Keys that should work even when keyboard is visible ──
    if (isKeyboardVisible) {
      if (keyCode === 152) { // POWER
        e.preventDefault();
        handlePowerToggle();
        return;
      }
      if (keyCode === 15) { // HOME
        e.preventDefault();
        window.location.href = "/launcher/index.html";
        return;
      }
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
      showTempMessage(`Number ${num} – Use virtual keyboard`);
      return;
    }
    if (keyCode >= 65 && keyCode <= 90) {
      showTempMessage(`Key ${key} – Use virtual keyboard`);
      return;
    }
    const punctMap = {
      186: ";", 187: "=", 188: ",", 189: "-", 190: ".", 191: "/",
      192: "`", 219: "[", 220: "\\", 221: "]", 222: "'"
    };
    if (punctMap[keyCode]) {
      showTempMessage(`Key ${punctMap[keyCode]} – Use virtual keyboard`);
      return;
    }

    // ── Navigation inside form ────────────────────────────────
    const navKeys = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter", "Backspace"];
    if (!navKeys.includes(key)) return;

    switch (key) {
      case 'ArrowDown':
        if (focusKey === 'name') focusKey = 'age';
        else if (focusKey === 'age') focusKey = 'gender_male';
        else if (focusKey === 'gender_male') focusKey = 'gender_female';
        else if (focusKey === 'gender_female') focusKey = 'save';
        else if (focusKey === 'save') focusKey = 'cancel';
        break;
      case 'ArrowUp':
        if (focusKey === 'age') focusKey = 'name';
        else if (focusKey === 'gender_male') focusKey = 'age';
        else if (focusKey === 'gender_female') focusKey = 'gender_male';
        else if (focusKey === 'save') focusKey = 'gender_female';
        else if (focusKey === 'cancel') focusKey = 'save';
        break;
      case 'ArrowLeft':
        if (focusKey === 'gender_female') focusKey = 'gender_male';
        else if (focusKey === 'cancel') focusKey = 'save';
        break;
      case 'ArrowRight':
        if (focusKey === 'gender_male') focusKey = 'gender_female';
        else if (focusKey === 'save') focusKey = 'cancel';
        break;
      case 'Enter':
        handleFieldEnter();
        break;
      case 'Backspace':
        handleBackspace();
        break;
    }
  }

  function handleFieldEnter() {
    if (focusKey === 'name' || focusKey === 'age') {
      openKeyboard(focusKey);
    } else if (focusKey === 'gender_male') {
      genderValue = 'Male';
    } else if (focusKey === 'gender_female') {
      genderValue = 'Female';
    } else if (focusKey === 'save') {
      handleSave();
    } else if (focusKey === 'cancel') {
      handleCancel();
    }
  }

  function handleBackspace() {
    if (focusKey === 'name') nameValue = nameValue.slice(0, -1);
    else if (focusKey === 'age') ageValue = ageValue.slice(0, -1);
  }

  function handleSave() {
    if (!nameValue.trim()) {
      alert('Please enter a name');
      return;
    }
    const newProfile = {
      id: Date.now().toString(),
      name: nameValue.trim(),
      age: ageValue.trim(),
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
      <img {src} alt="Background {i+1}" class="bg-slider-image" class:active={bgIndex === i} />
    {/each}
    <div class="overlay"></div>
  </div>

  <!-- Left sidebar panel -->
  <div class="profile-panel">
    <div class="profile-group">
      <h2 class="create-title">Create Profile</h2>

      <!-- Name (same border as others) -->
      <button class="input-wrapper" class:focused={focusKey === 'name' && !isKeyboardVisible}
              on:click={() => openKeyboard('name')} tabindex="0">
        <input type="text" placeholder="Name" value={nameValue} readonly />
      </button>

      <!-- Age (same border) -->
      <button class="input-wrapper" class:focused={focusKey === 'age' && !isKeyboardVisible}
              on:click={() => openKeyboard('age')} tabindex="0">
        <input type="text" placeholder="Age" value={ageValue} readonly />
      </button>

      <!-- Gender buttons – each has identical border & full width (stacked) -->
      <button class="gender-btn" class:selected={genderValue === 'Male'}
              class:focused={focusKey === 'gender_male' && !isKeyboardVisible}
              on:click={() => { genderValue = 'Male'; }} tabindex="0">
        Male
      </button>
      <button class="gender-btn" class:selected={genderValue === 'Female'}
              class:focused={focusKey === 'gender_female' && !isKeyboardVisible}
              on:click={() => { genderValue = 'Female'; }} tabindex="0">
        Female
      </button>

      <!-- Action buttons with same border treatment -->
      <div class="action-buttons">
        <button class="action-btn save" class:focused={focusKey === 'save' && !isKeyboardVisible}
                on:click={handleSave} tabindex="0">Save</button>
        <button class="action-btn cancel" class:focused={focusKey === 'cancel' && !isKeyboardVisible}
                on:click={handleCancel} tabindex="0">Cancel</button>
      </div>
    </div>
  </div>
</div>

<!-- Temporary message overlay -->
{#if tempMessage}
  <div class="temp-message">{tempMessage}</div>
{/if}

<!-- Virtual keyboard -->
<VirtualKeyboard bind:this={keyboard} visible={isKeyboardVisible} active={isKeyboardVisible}
                 on:input={onKeyboardInput} on:confirm={onKeyboardConfirm} />

<style>
  .create-profile-container {
    width: 100vw;
    height: 100vh;
    display: flex;
    justify-content: flex-start;
    align-items: center;
    background-color: #020202;
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
  }

  .bg-slider-image.active {
    opacity: 1;
  }

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

  /* ── ALL buttons (Name, Age, Male, Female, Save, Cancel) share same border style ── */
  .input-wrapper, .gender-btn {
    width: 100%;               /* Full width, consistent */
    height: 50px;
    background-color: rgba(255,255,255,0.1);
    border: 4px solid #888;    /* Thick, same for all */
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.25s ease-in-out;
    cursor: pointer;
    margin-bottom: 16px;       /* Consistent spacing */
  }

  /* Remove extra margin from last button before action-buttons */
  .gender-btn:last-of-type {
    margin-bottom: 20px;
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

  /* Focus effect (identical for all) */
  .input-wrapper.focused, .gender-btn.focused, .action-btn.focused {
    border-color: #e1001e;
    transform: scale(1.02);
    box-shadow: 0 0 18px rgba(225,0,30,0.6);
  }

  /* Gender button selected state (keep border same, just background change) */
  .gender-btn.selected {
    background-color: #e1001e;
    border-color: #e1001e;
  }

  /* Action buttons container */
  .action-buttons {
    display: flex;
    width: 100%;
    justify-content: space-between;
    gap: 16px;
    margin-top: 8px;
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

  .action-btn.save {
    background-color: #27ae60;
  }

  .action-btn.cancel {
    background-color: #c0392b;
  }

  /* Override focus for action buttons – same as others */
  .action-btn.focused {
    border-color: #e1001e;
    transform: scale(1.02);
    box-shadow: 0 0 18px rgba(225,0,30,0.6);
  }

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
</style>
