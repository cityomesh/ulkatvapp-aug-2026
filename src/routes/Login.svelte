<script>
  import { onMount, onDestroy } from "svelte";
  import { push } from "svelte-spa-router";
  import { loginUser } from "../lib/api.js";
  import { setAuth, authToken } from "../stores/appStore.js";
  import VirtualKeyboard from "../components/VirtualKeyboard.svelte";
  import { APP_NAME, VERSION_NAME, BUILD_TYPE } from "../lib/app_manifest.js";


  // ── State ────────────────────────────────────────────────────────────────
  let username = "linuxtest";
  let password = "Ulka@123";
  let showPassword = false;
  let loading = false;
  let errorMessage = "";

  // Keyboard state
  let isKeyboardVisible = false;
  let keyboardTarget = ""; // 'username' | 'password'
  let keyboard; // component ref

  // Focus: 'username' | 'password' | 'login_btn'
  let focusKey = "username";

  // Background rotation
  let bgIndex = 0;
  let bgTimer;

  // Temporary message (for key feedback)
  let tempMessage = "";
  let tempMessageTimeout;

  // Power state (track locally for toggle)
  let isSystemPoweredOn = true;

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  onMount(() => {
    if (localStorage.getItem("ulka_token")) {
      push("/profile");
      return;
    }

    document.addEventListener("keydown", handleKeyDown);

    bgTimer = setInterval(() => {
      bgIndex = (bgIndex + 1) % 2;
    }, 8000);
  });

  onDestroy(() => {
    document.removeEventListener("keydown", handleKeyDown);
    clearInterval(bgTimer);
    if (tempMessageTimeout) clearTimeout(tempMessageTimeout);
  });

  // ── Helper: temporary on‑screen message ─────────────────────────────────
  function showTempMessage(msg, isError = false) {
    if (tempMessageTimeout) clearTimeout(tempMessageTimeout);
    tempMessage = msg;
    tempMessageTimeout = setTimeout(() => {
      tempMessage = "";
    }, 2000);
  }

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

  // ── Login ─────────────────────────────────────────────────────────────────
  async function handleLogin() {
    if (loading) return;
    errorMessage = "";
    loading = true;
    isKeyboardVisible = false;
    keyboardTarget = "";

    try {
      const token = await loginUser(username, password);
      setAuth(token, username);
      push("/profile");
    } catch (err) {
      errorMessage = err.message || "Login failed.";
    } finally {
      loading = false;
    }
  }

  // ── Virtual keyboard ──────────────────────────────────────────────────────
  function openKeyboard(target) {
    if (
      document.activeElement &&
      typeof document.activeElement.blur === "function"
    ) {
      document.activeElement.blur();
    }
    keyboardTarget = target;
    isKeyboardVisible = true;
    if (keyboard) keyboard.reset();
  }

  function closeKeyboard(nextFocus) {
    isKeyboardVisible = false;
    keyboardTarget = "";
    focusKey = nextFocus;
  }

  function onKeyboardInput(e) {
    const char = e.detail;
    if (char === "backspace") {
      if (keyboardTarget === "username") username = username.slice(0, -1);
      else password = password.slice(0, -1);
    } else {
      if (keyboardTarget === "username") username += char;
      else password += char;
    }
    errorMessage = "";
  }

  function onKeyboardConfirm() {
    closeKeyboard(keyboardTarget === "username" ? "password" : "login_btn");
  }

  // ── D-pad + full remote control navigation ───────────────────────────────
  function handleKeyDown(e) {
    const keyCode = e.keyCode || e.which;
    const key = e.key;

    // ── Special keys that should work even when keyboard is visible ──
    if (isKeyboardVisible) {
      // POWER, HOME, SETUP, etc. – handle globally
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
      if (keyCode === 14 || keyCode === 21 || keyCode === 36) { // SETUP, SETTINGS, MENU
        e.preventDefault();
        showTempMessage("Not available on login screen");
        return;
      }
      // Delegate all other keys to virtual keyboard
      if (keyboard) keyboard.handleKey(e.key);
      return;
    }

    // ── Prevent default for all remote keys ──
    const navKeys = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter", "Backspace", "Escape"];
    if (navKeys.includes(key) || 
        keyCode === 33 || keyCode === 34 ||   // CH UP/DOWN
        keyCode === 152 ||                    // POWER
        keyCode === 403 || keyCode === 404 || keyCode === 405 || keyCode === 406 || // Color
        keyCode === 226 || keyCode === 227 || keyCode === 228 || // OTT
        keyCode === 19 || keyCode === 20 || keyCode === 14 || keyCode === 36 || keyCode === 16 || // GUIDE, LIVETV, SETUP, MENU, FAV
        keyCode === 33 || keyCode === 34 ||   // PGUP/PGDN
        keyCode === 35 || keyCode === 45 || keyCode === 46 || // END, INSERT, DELETE
        (keyCode >= 112 && keyCode <= 123) || // F1-F12
        (keyCode >= 48 && keyCode <= 57) ||   // 0-9
        (keyCode >= 96 && keyCode <= 105) ||  // Keypad 0-9
        (keyCode >= 65 && keyCode <= 90) ||   // A-Z
        (keyCode >= 186 && keyCode <= 222)    // punctuation
    ) {
      e.preventDefault();
    }

    // ── CH UP / DOWN ────────────────────────────────────────────────
    if (keyCode === 33) { // CHUP
      showTempMessage("CH ▲ – Not available on login");
      return;
    }
    if (keyCode === 34) { // CHDOWN
      showTempMessage("CH ▼ – Not available on login");
      return;
    }

    // ── POWER ───────────────────────────────────────────────────────
    if (keyCode === 152) {
      handlePowerToggle();
      return;
    }

    // ── Colored keys ────────────────────────────────────────────────
    if (keyCode === 403) { showTempMessage("🔴 Red button"); return; }
    if (keyCode === 404) { showTempMessage("🟢 Green button"); return; }
    if (keyCode === 405) { showTempMessage("🟡 Yellow button"); return; }
    if (keyCode === 406) { showTempMessage("🔵 Blue button"); return; }

    // ── Dedicated OTT apps ─────────────────────────────────────────
    if (keyCode === 226) { showTempMessage("Netflix – Not on login"); return; }
    if (keyCode === 227) { showTempMessage("Prime Video – Not on login"); return; }
    if (keyCode === 228) { showTempMessage("JioStar – Not on login"); return; }

    // ── Other function keys ────────────────────────────────────────
    if (keyCode === 19) { showTempMessage("Guide – Not on login"); return; }
    if (keyCode === 20) { showTempMessage("Live TV – Not on login"); return; }
    if (keyCode === 14) { showTempMessage("Setup – Not on login"); return; }
    if (keyCode === 36) { showTempMessage("Menu – Not on login"); return; }
    if (keyCode === 16) { showTempMessage("Favorites – Not on login"); return; }
    if (keyCode === 15) { // HOME
      window.location.href = "/launcher/index.html";
      return;
    }

    // ── Page Up / Down ─────────────────────────────────────────────
    if (keyCode === 33) { showTempMessage("Page Up"); return; }
    if (keyCode === 34) { showTempMessage("Page Down"); return; }

    // ── END, INSERT, DELETE ────────────────────────────────────────
    if (keyCode === 35) { showTempMessage("End"); return; }
    if (keyCode === 45) { showTempMessage("Insert"); return; }
    if (keyCode === 46) { showTempMessage("Delete"); return; }

    // ── Function keys F1-F12 ───────────────────────────────────────
    if (keyCode >= 112 && keyCode <= 123) {
      showTempMessage(`F${keyCode - 111} pressed`);
      return;
    }

    // ── Numeric keys (0-9) – can be used to enter numbers in password? ──
    if ((keyCode >= 48 && keyCode <= 57) || (keyCode >= 96 && keyCode <= 105)) {
      let num = String.fromCharCode(keyCode);
      if (keyCode >= 96 && keyCode <= 105) num = String(keyCode - 96);
      // If password field is focused, we could append number, but we don't have direct input.
      // For simplicity, show toast.
      showTempMessage(`Number ${num} pressed – Use virtual keyboard`);
      return;
    }

    // ── Letters A-Z – show toast (no direct input) ─────────────────
    if (keyCode >= 65 && keyCode <= 90) {
      showTempMessage(`Key ${key} – Use virtual keyboard`);
      return;
    }

    // ── Punctuation keys ───────────────────────────────────────────
    const punctMap = {
      186: ";", 187: "=", 188: ",", 189: "-", 190: ".", 191: "/",
      192: "`", 219: "[", 220: "\\", 221: "]", 222: "'"
    };
    if (punctMap[keyCode]) {
      showTempMessage(`Key ${punctMap[keyCode]} – Use virtual keyboard`);
      return;
    }

    // ── Existing navigation (arrows, Enter, Backspace/Escape) ──────
    // Only handle if not already captured above
    switch (key) {
      case "ArrowUp":
        if (focusKey === "password") focusKey = "username";
        else if (focusKey === "login_btn") focusKey = "password";
        break;
      case "ArrowDown":
        if (focusKey === "username") focusKey = "password";
        else if (focusKey === "password") focusKey = "login_btn";
        break;
      case "Enter":
        if (focusKey === "username" || focusKey === "password") {
          openKeyboard(focusKey);
        } else if (focusKey === "login_btn") {
          handleLogin();
        }
        break;
      case "Escape":
      case "Backspace":
        if (focusKey === "username" || focusKey === "password") {
          // Clear current field? Or do nothing? We'll just show message.
          showTempMessage("Use virtual keyboard to edit");
        }
        break;
    }
  }
</script>

<div class="main-container">
  <!-- Left panel: login form -->
  <div class="left-panel">
    <div class="login-form-container">
      <div class="header-text">
        <h2 class="header-title">THE FUTURE OF</h2>
        <h2 class="header-title">ENTERTAINMENT</h2>
        <div class="header-row">
          <h2 class="header-is-here">IS HERE</h2>
          <div class="down-arrow">
            <img
              src="/images/appstore/profile/DownArrow.png"
              alt="Down Arrow"
            />
          </div>
        </div>
      </div>

      <div style="width:100%">
        <!-- Username -->
        <button
          class="input-container"
          class:focused={focusKey === "username" && !isKeyboardVisible}
          on:click={() => openKeyboard("username")}
          on:keydown={(e) => e.key === "Enter" && openKeyboard("username")}
          tabindex="0"
        >
          <input type="text" placeholder="Username" value={username} readonly />
        </button>

        <!-- Password -->
        <button
          class="input-container"
          class:focused={focusKey === "password" && !isKeyboardVisible}
          on:click={() => openKeyboard("password")}
          on:keydown={(e) => e.key === "Enter" && openKeyboard("password")}
          tabindex="0"
        >
          <input type={showPassword ? "text" : "password"} placeholder="Password" value={password} readonly />
          <button class="password-toggle" on:click|stopPropagation={() => { showPassword = !showPassword; }}>{showPassword ? "👁️‍🗨️" : "👁️"}</button>
        </button>

        {#if errorMessage}
          <div class="error-message">⚠️ {errorMessage}</div>
        {/if}

        <button
          class="signin-btn"
          class:focused={focusKey === "login_btn" && !isKeyboardVisible}
          on:click={handleLogin}
          disabled={loading}
        >
          {loading ? "Signing In…" : "Sign In"}
        </button>

        <div class="info-section">
          <button
            class="privacy-link"
            on:click={() => alert(`Privacy Policy — ${APP_NAME}`)}
          >
            Privacy Policy
          </button>
          <p class="hdr-text">
            <span class="hdr-4k">4K</span> Ultra HD Streaming
          </p>
        </div>

        <div class="device-tags">
          <span class="device-tag">SmartTV</span>
          <span class="device-tag">STB</span>
          <span class="device-tag">Stick</span>
          <span class="device-tag">Mobile</span>
        </div>
      </div>

      <img
        src="/images/appstore/ottapps/UlkaTV.png"
        alt="UlkaTV"
        class="ulka-logo"
      />

      <div class="version-badge">
        v{VERSION_NAME}{#if BUILD_TYPE !== 'live'}&nbsp;<span class="build-type build-type--{BUILD_TYPE}">{BUILD_TYPE}</span>{/if}
      </div>
    </div>
  </div>

  <!-- Right panel: background images – now full width and properly contained -->
  <div class="right-panel">
    <div class="background-container">
      <img
        src="/images/appstore/ottapps/allnames.webp"
        alt="Background"
        class="background-img"
        style="opacity: {bgIndex === 0 ? 1 : 0}"
      />
      <img
        src="/images/appstore/ottapps/allnames2.webp"
        alt="Channels"
        class="background-img"
        style="opacity: {bgIndex === 1 ? 1 : 0}"
      />
    </div>
    <!-- overlay removed because it's unnecessary and may cause visual cut-off -->
  </div>
</div>

<!-- Temporary message overlay -->
{#if tempMessage}
  <div class="temp-message">
    {tempMessage}
  </div>
{/if}

<!-- Virtual keyboard -->
<VirtualKeyboard
  bind:this={keyboard}
  visible={isKeyboardVisible}
  active={isKeyboardVisible}
  on:input={onKeyboardInput}
  on:confirm={onKeyboardConfirm}
/>

<style>
  /* Reset any potential overflow issues */
  * {
    box-sizing: border-box;
  }

  .main-container {
    display: flex;
    width: 100%;           /* Was 130% – now full width to prevent horizontal cut */
    min-height: 100vh;
    background-color: #020202;
    overflow-x: hidden;    /* No horizontal scroll */
  }

  /* Left panel: fixed width, no overflow issues */
  .left-panel {
    flex: 0 0 480px;       /* Fixed width for login form, can adjust */
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    background-color: #020202;
    z-index: 10;
    position: relative;
    height: 100vh;
    overflow-y: auto;
  }

  /* Right panel: takes remaining full width, no cut */
  .right-panel {
    flex: 1;               /* Fill remaining space */
    position: relative;
    background-color: #020202;
    overflow: hidden;      /* Prevents any overflow from child absolute */
    height: 100vh;
  }

  /* Background container covers entire right panel */
  .background-container {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
  }

  /* Images always cover the container without cropping edges */
  .background-img {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    object-fit: fill;     /* Explicitly set fill to avoid cut on STB */
    object-position: center center;
    transition: opacity 1s ease-in-out;
  }

  /* Rest of the styles remain unchanged (only layout fixes) */

  .login-form-container {
    width: 100%;
    max-width: 400px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 40px 20px;
  }

  .header-text {
    width: 100%;
    text-align: center;
    margin-bottom: 30px;
  }

  .header-title {
    font-size: 25px;
    margin-top: 8px;
    font-weight: 900;
    letter-spacing: 2px;
    color: #e6dc53;
    line-height: 1.3;
  }

  .header-row {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .header-is-here {
    font-size: 25px;
    font-weight: 900;
    margin-top: 8px;
    letter-spacing: 0.15em;
    color: #e6dc53;
  }

  .down-arrow {
    width: 40px;
    height: 40px;
    margin-left: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .down-arrow img {
    width: 30px;
    height: 30px;
  }

  .input-container {
    width: 100%;
    height: 50px;
    background-color: rgba(255, 255, 255, 0.1);
    border: 4px solid #444;
    border-radius: 8px;
    padding: 0 16px;
    display: flex;
    align-items: center;
    margin-bottom: 20px;
    transition: all 0.3s;
    cursor: text;
  }

  .input-container.focused {
    border-color: #e1001e;
    box-shadow: 0 0 10px #e1001e;
    background-color: rgba(255, 255, 255, 0.15);
  }

  .input-container input {
    flex: 1;
    background: transparent;
    color: #fff;
    border: none;
    outline: none;
    font-size: 16px;
    width: 100%;
  }

  .input-container input::placeholder {
    color: rgba(255, 255, 255, 0.5);
  }

  .password-toggle {
    background: none;
    border: none;
    cursor: pointer;
    padding: 0 5px;
    color: #fff;
    font-size: 20px;
  }

  .error-message {
    color: #e50914;
    margin-bottom: 15px;
    font-size: 14px;
    text-align: center;
  }

  .signin-btn {
    width: 100%;
    height: 50px;
    border-radius: 8px;
    font-weight: bold;
    font-size: 18px;
    margin-bottom: 25px;
    background-color: #e50914;
    border: none;
    cursor: pointer;
    transition: all 0.2s;
    color: #fff;
    outline: none;
  }

  .signin-btn.focused {
    background-color: #e1001e;
    border: 3px solid #fff;
    transform: scale(1.02);
  }

  .signin-btn:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }

  .info-section {
    text-align: center;
    width: 100%;
    margin-bottom: 25px;
  }

  .privacy-link {
    font-size: 16px;
    font-weight: bold;
    text-decoration: underline;
    color: #e6dc53;
    background: none;
    border: none;
    cursor: pointer;
  }

  .hdr-text {
    font-size: 18px;
    font-weight: bold;
    color: #e6dc53;
    margin-top: 10px;
  }

  .hdr-4k {
    color: #ffb800;
    font-size: 26px;
  }

  .device-tags {
    display: flex;
    justify-content: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  .device-tag {
    color: #fff;
    font-size: 14px;
    font-weight: bold;
    padding: 6px 15px;
    border-radius: 20px;
    background-color: rgba(229, 9, 20, 0.8);
  }

  .ulka-logo {
    width: 365px;
    margin-top: 20px;
  }

  /* Overlay removed – no longer needed */

  /* Temp message styling */
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

  /* Responsive: if screen too narrow, left panel can shrink a bit */
  @media (max-width: 1024px) {
    .left-panel {
      flex-basis: 400px;
    }
  }

  @media (max-width: 768px) {
    .left-panel {
      flex-basis: 320px;
    }
    .header-title, .header-is-here {
      font-size: 20px;
    }
    .temp-message {
      font-size: 16px;
      bottom: 50px;
    }
  }
</style>
