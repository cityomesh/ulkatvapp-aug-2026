<script>
  import { onMount, onDestroy } from "svelte";
  import { push } from "svelte-spa-router";
  import { clearAuth, activeProfile, authUsername } from "../stores/appStore.js";
  import VirtualKeyboard from "../components/VirtualKeyboard.svelte";

  let name = "";
  let age = 18;
  let gender = "Male";

  let currentFocus = 0;
  let focusRefs = [];
  let showDeleteConfirm = false;
  let confirmFocus = "cancel";

  // Background slider
  const BG_IMAGES = [
    "/images/appstore/ottapps/wall10.jpg",
    "/images/appstore/ottapps/wall4.png",
  ];
  let bgIndex = 0;
  let bgTimer;

  // Virtual Keyboard state
  let isKeyboardVisible = false;
  let keyboardTarget = "";
  let keyboard;

  // Auto‑dismiss timer
  let inactivityTimer = null;

  const focusMap = {
    0: { up: null, down: 1, left: null, right: null, id: "name" },
    1: { up: 0, down: 3, left: null, right: 2, id: "age" },
    2: { up: 0, down: 4, left: 1, right: null, id: "gender" },
    3: { up: 1, down: null, left: null, right: 4, id: "save" },
    4: { up: 2, down: null, left: 3, right: 5, id: "back" },
    5: { up: 2, down: null, left: 4, right: null, id: "delete" },
  };

  onMount(() => {
    loadProfile();
    setTimeout(() => setFocus(0), 100);
    window.addEventListener("keydown", handleKeydown);

    bgTimer = setInterval(() => {
      bgIndex = (bgIndex + 1) % BG_IMAGES.length;
    }, 3000);

    return () => {
      window.removeEventListener("keydown", handleKeydown);
      clearInterval(bgTimer);
      clearTimeout(inactivityTimer);
    };
  });

  onDestroy(() => {
    clearInterval(bgTimer);
    clearTimeout(inactivityTimer);
  });

  function loadProfile() {
    try {
      const raw = localStorage.getItem("ulka_main_profile");
      if (raw) {
        const data = JSON.parse(raw);
        name = data.name || "";
        age = data.age ? parseInt(data.age, 10) : 18;
        gender = data.gender || "Male";
      } else {
        name = localStorage.getItem("ulka_main_profile_name") || "";
      }
    } catch (_) {
      name = localStorage.getItem("ulka_main_profile_name") || "";
    }
    if (!name) name = "User";
    if (isNaN(age) || age < 1) age = 18;
    if (!["Male", "Female", "Other"].includes(gender)) gender = "Male";
  }

  function setFocus(index) {
    if (index === null || index === undefined) return;
    if (index < 0 || index >= focusRefs.length) return;
    currentFocus = index;
    const el = focusRefs[index];
    if (el) {
      el.focus();
      if (el.tagName === "INPUT") {
        el.select();
      }
    }
  }

  function openKeyboard() {
    if (document.activeElement && typeof document.activeElement.blur === "function") {
      document.activeElement.blur();
    }
    keyboardTarget = "name";
    isKeyboardVisible = true;
    if (keyboard) keyboard.reset();
    resetInactivityTimer();
  }

  function closeKeyboard() {
    isKeyboardVisible = false;
    keyboardTarget = "";
    clearTimeout(inactivityTimer);
    setFocus(0);
  }

  function resetInactivityTimer() {
    clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(() => {
      if (isKeyboardVisible) {
        closeKeyboard();
      }
    }, 10000);
  }

  function onKeyboardInput(event) {
    const char = event.detail;
    if (char === "backspace") {
      name = name.slice(0, -1);
    } else {
      name += char;
    }
    resetInactivityTimer();
  }

  function onKeyboardConfirm() {
    closeKeyboard();
  }

  function toggleGender() {
    gender = gender === "Male" ? "Female" : "Male";
  }

  function handleKeydown(e) {
    const key = e.key;
    const keyCode = e.keyCode || e.which;

    if (keyCode === 152) { e.preventDefault(); return; }
    if (keyCode === 15) { e.preventDefault(); window.location.href = "/launcher/index.html"; return; }

    if (showDeleteConfirm) {
      if (key === "ArrowRight" || key === "ArrowLeft") {
        e.preventDefault();
        confirmFocus = confirmFocus === "cancel" ? "confirm" : "cancel";
      } else if (key === "Escape" || key === "Backspace") {
        e.preventDefault();
        showDeleteConfirm = false;
        setFocus(5);
      } else if (key === "Enter") {
        e.preventDefault();
        if (confirmFocus === "confirm") {
          handleDeleteConfirm();
        } else {
          showDeleteConfirm = false;
          setFocus(5);
        }
      }
      return;
    }

    if (isKeyboardVisible) {
      if (key === "Escape") {
        e.preventDefault();
        closeKeyboard();
        return;
      }
      if (keyboard) {
        keyboard.handleKey(key);
        resetInactivityTimer();
      }
      e.preventDefault();
      return;
    }

    const current = focusMap[currentFocus];
    if (!current) return;

    if (currentFocus === 1) {
      if (key === "ArrowUp") { e.preventDefault(); age = Math.min(120, age + 1); return; }
      if (key === "ArrowDown") { e.preventDefault(); age = Math.max(1, age - 1); return; }
    }
    if (currentFocus === 2) {
      if (key === "ArrowLeft" || key === "ArrowRight") {
        e.preventDefault();
        toggleGender();
        return;
      }
    }

    let target = null;
    switch (key) {
      case "ArrowUp": e.preventDefault(); target = current.up; break;
      case "ArrowDown": e.preventDefault(); target = current.down; break;
      case "ArrowLeft": if (currentFocus === 0) return; e.preventDefault(); target = current.left; break;
      case "ArrowRight": if (currentFocus === 0) return; e.preventDefault(); target = current.right; break;
      case "Enter":
        e.preventDefault();
        if (currentFocus === 0) openKeyboard();
        else if (currentFocus === 3) handleSave();
        else if (currentFocus === 4) handleBack();
        else if (currentFocus === 5) { showDeleteConfirm = true; confirmFocus = "cancel"; }
        return;
      case "Escape":
      case "Backspace":
        e.preventDefault();
        handleBack();
        return;
      default: return;
    }
    if (target !== null) setFocus(target);
  }

  function handleSave() {
    const profile = {
      name: name.trim() || "User",
      age: String(age),
      gender: gender,
      image: "/images/appstore/profile/Avatar16.png",
    };
    localStorage.setItem("ulka_main_profile", JSON.stringify(profile));
    localStorage.setItem("ulka_main_profile_name", profile.name);
    try { authUsername.set(profile.name); } catch (_) {}
    try { activeProfile.set(profile.name); } catch (_) {}
    push("/profile");
  }

  function handleBack() { push("/profile"); }

  function handleDeleteConfirm() {
    showDeleteConfirm = false;
    localStorage.removeItem("ulka_main_profile");
    localStorage.removeItem("ulka_main_profile_name");
    localStorage.removeItem("ulka_token");
    localStorage.removeItem("ulka_profiles");
    localStorage.removeItem("ulka_active_profile");
    sessionStorage.removeItem("ulka_profile_selected");
    sessionStorage.removeItem("auto_fullscreen");
    sessionStorage.removeItem("from_login");
    clearAuth();
    activeProfile.set(null);
    push("/login");
  }
</script>

<!-- ════════════════════════════════════════════════════════════ -->
<!-- TEMPLATE                                                  -->
<!-- ════════════════════════════════════════════════════════════ -->
<div class="edit-container">
  <!-- Background slider -->
  <div class="background-container">
    {#each BG_IMAGES as src, i}
      <img {src} alt="Background {i+1}" class="bg-image" class:active={bgIndex === i} />
    {/each}
    <div class="overlay"></div>
  </div>

  <!-- Main layout: form at top, keyboard at bottom -->
  <div class="main-layout">
    <!-- Form panel (top) -->
    <div class="form-panel">
      <div class="edit-card">
        <h1 class="edit-title">Edit Profile</h1>

        <div class="field-group">
          <label class="field-label" for="name-field">Name</label>
          <button
            id="name-field"
            class="name-trigger"
            class:focused={currentFocus === 0 && !isKeyboardVisible}
            on:click={openKeyboard}
            on:focus={() => setFocus(0)}
            tabindex="0"
          >
            <span class="name-value">{name || "Enter name"}</span>
            <span class="keyboard-hint">Press Enter to open keyboard</span>
          </button>
        </div>

        <div class="field-group">
          <label class="field-label" for="age-field">Age</label>
          <input
            id="age-field"
            bind:this={focusRefs[1]}
            type="number"
            class="field-input"
            class:focused={currentFocus === 1}
            bind:value={age}
            min="1"
            max="120"
            on:focus={() => setFocus(1)}
          />
          <span class="hint">▲/▼ to adjust</span>
        </div>

        <div class="field-group">
          <label class="field-label" for="gender-field">Gender</label>
          <div
            id="gender-field"
            bind:this={focusRefs[2]}
            class="gender-selector"
            class:focused={currentFocus === 2}
            tabindex="0"
            role="button"
            on:focus={() => setFocus(2)}
            on:click={toggleGender}
            on:keydown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                toggleGender();
              }
            }}
          >
            <span class="gender-option" class:active={gender === "Male"}>Male</span>
            <span class="gender-option" class:active={gender === "Female"}>Female</span>
          </div>
          <span class="hint">◄/► to toggle</span>
        </div>

        <div class="actions-row">
          <button bind:this={focusRefs[3]} class="action-btn save-btn" class:focused={currentFocus === 3} on:click={handleSave} on:focus={() => setFocus(3)}>💾 Save</button>
          <button bind:this={focusRefs[4]} class="action-btn back-btn" class:focused={currentFocus === 4} on:click={handleBack} on:focus={() => setFocus(4)}>↩ Back</button>
          <button bind:this={focusRefs[5]} class="action-btn delete-btn" class:focused={currentFocus === 5} on:click={() => { showDeleteConfirm = true; confirmFocus = "cancel"; }} on:focus={() => setFocus(5)}>🗑 Delete</button>
        </div>
      </div>
    </div>

    <!-- Keyboard panel (bottom, wide) -->
    <div class="keyboard-panel" class:keyboard-visible={isKeyboardVisible}>
      {#if isKeyboardVisible}
        <VirtualKeyboard
          bind:this={keyboard}
          visible={isKeyboardVisible}
          active={isKeyboardVisible}
          on:input={onKeyboardInput}
          on:confirm={onKeyboardConfirm}
        />
      {/if}
    </div>
  </div>
</div>

<!-- Delete Confirm -->
{#if showDeleteConfirm}
  <div class="confirm-overlay">
    <div class="confirm-box">
      <h3>Delete Profile?</h3>
      <p>All data will be permanently lost. Are you sure?</p>
      <div class="confirm-actions">
        <button class="confirm-btn" class:focused={confirmFocus === "cancel"} on:click={() => { showDeleteConfirm = false; setFocus(5); }} on:focus={() => { confirmFocus = "cancel"; }}>Cancel</button>
        <button class="confirm-btn danger" class:focused={confirmFocus === "confirm"} on:click={handleDeleteConfirm} on:focus={() => { confirmFocus = "confirm"; }}>Delete</button>
      </div>
    </div>
  </div>
{/if}

<style>
  /* ─── Container & Background ────────────────────────────── */
  .edit-container {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: #020202;
    overflow: hidden;
    z-index: 10000;
  }

  .background-container {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 1;
  }

  .bg-image {
    position: absolute;
    width: 100%;
    height: 100%;
    object-fit: cover;
    opacity: 0;
    transition: opacity 1.5s ease-in-out;
  }
  .bg-image.active { opacity: 1; }

  .overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 2;
    background: rgba(0, 0, 0, 0.7);
  }

  /* ─── Main Layout (vertical) ────────────────────────────── */
  .main-layout {
    position: relative;
    display: flex;
    flex-direction: column;
    justify-content: space-between;  /* form at top, keyboard at bottom */
    width: 100%;
    height: 100%;
    z-index: 10;
    padding: 5% 5% 2% 5%;
    box-sizing: border-box;
    gap: 20px;
  }

  /* ─── Form Panel (top) ──────────────────────────────────── */
  .form-panel {
    flex: 0 0 auto;
    display: flex;
    justify-content: center;
    align-items: flex-start;
    width: 100%;
  }

  .edit-card {
    background: #1a1a1a;
    padding: 30px 36px 36px;
    border-radius: 24px;
    border: 2px solid #333;
    max-width: 500px;
    width: 100%;
    box-shadow: 0 30px 80px rgba(0, 0, 0, 0.9);
    margin: 0 auto;
  }

  .edit-title {
    color: #fff;
    font-size: 26px;
    font-weight: 700;
    margin-bottom: 24px;
    text-align: center;
    letter-spacing: 0.5px;
  }
  .edit-title::after {
    content: "";
    display: block;
    width: 50px;
    height: 3px;
    background: #e50914;
    margin: 8px auto 0;
    border-radius: 4px;
  }

  .field-group {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-bottom: 14px;
  }
  .field-label {
    color: #aaa;
    font-size: 13px;
    font-weight: 500;
    letter-spacing: 0.3px;
    margin-left: 4px;
  }

  .name-trigger {
    width: 100%;
    padding: 10px 14px;
    border-radius: 12px;
    border: 2px solid #333;
    background: #222;
    color: #fff;
    font-size: 15px;
    text-align: left;
    cursor: pointer;
    transition: all 0.2s;
    outline: none;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
  }
  .name-trigger.focused {
    border-color: #e50914;
    box-shadow: 0 0 24px rgba(229, 9, 20, 0.2);
    background: #2a2a2a;
  }
  .name-value { font-size: 15px; color: #fff; }
  .keyboard-hint { font-size: 10px; color: #555; }

  .field-input {
    padding: 10px 14px;
    border-radius: 12px;
    border: 2px solid #333;
    background: #222;
    color: #fff;
    font-size: 15px;
    transition: all 0.2s;
    outline: none;
    width: 100%;
    box-sizing: border-box;
  }
  .field-input.focused,
  .field-input:focus {
    border-color: #e50914;
    box-shadow: 0 0 24px rgba(229, 9, 20, 0.2);
    background: #2a2a2a;
  }

  .gender-selector {
    display: flex;
    border-radius: 12px;
    border: 2px solid #333;
    background: #222;
    overflow: hidden;
    cursor: pointer;
    transition: all 0.2s;
    outline: none;
    padding: 2px;
  }
  .gender-selector.focused {
    border-color: #e50914;
    box-shadow: 0 0 24px rgba(229, 9, 20, 0.2);
  }
  .gender-option {
    flex: 1;
    text-align: center;
    padding: 8px 0;
    font-size: 15px;
    font-weight: 500;
    color: #888;
    background: transparent;
    border-radius: 8px;
    transition: all 0.25s;
  }
  .gender-option.active {
    background: #e50914;
    color: #fff;
    box-shadow: 0 4px 12px rgba(229, 9, 20, 0.4);
  }
  .hint {
    font-size: 10px;
    color: #555;
    margin-top: 2px;
    margin-left: 4px;
    letter-spacing: 0.3px;
  }

  .actions-row {
    display: flex;
    gap: 12px;
    margin-top: 6px;
  }
  .action-btn {
    flex: 1;
    padding: 12px 0;
    border-radius: 12px;
    border: 3px solid transparent;
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    color: #fff;
    background: #333;
    text-align: center;
    outline: none;
    user-select: none;
  }
  .action-btn.focused {
    border-color: #fff;
    transform: scale(1.05);
    box-shadow: 0 0 30px rgba(255, 255, 255, 0.15);
  }
  .save-btn { background: #e50914; }
  .save-btn.focused { background: #ff1a2a; }
  .back-btn { background: #444; }
  .back-btn.focused { background: #555; }
  .delete-btn { background: #7a1a1a; }
  .delete-btn.focused { background: #a02020; }

  /* ─── Keyboard Panel (bottom, WIDE) ──────────────────────── */
  .keyboard-panel {
    flex: 0 0 auto;
    display: flex;
    justify-content: center;
    align-items: center;
    width: 100%;
    min-height: 80px;   /* placeholder when hidden */
  }

  /* Keyboard now has a much wider max-width (increased from 420px) */
  :global(.keyboard-panel.keyboard-visible > *) {
    width: 100%;
    max-width: 750px;          /* Increased width */
    background: rgba(0, 0, 0, 0.85);
    border-radius: 16px;
    padding: 10px;
    box-shadow: 0 0 30px rgba(0, 0, 0, 0.8);
  }

  /* ─── Confirm Overlay ────────────────────────────────────── */
  .confirm-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: rgba(0, 0, 0, 0.85);
    backdrop-filter: blur(4px);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 10001;
  }
  .confirm-box {
    background: #1a1a1a;
    padding: 32px 36px;
    border-radius: 20px;
    border: 2px solid #8b1a1a;
    text-align: center;
    max-width: 380px;
    width: 90%;
  }
  .confirm-box h3 {
    color: #e50914;
    font-size: 24px;
    font-weight: 700;
    margin-bottom: 8px;
  }
  .confirm-box p {
    color: #ccc;
    font-size: 16px;
    margin-bottom: 24px;
  }
  .confirm-actions {
    display: flex;
    gap: 16px;
    justify-content: center;
  }
  .confirm-btn {
    flex: 1;
    padding: 12px 20px;
    border-radius: 10px;
    border: 3px solid transparent;
    font-size: 16px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    background: #333;
    color: #fff;
    outline: none;
  }
  .confirm-btn.focused {
    border-color: #fff;
    transform: scale(1.06);
    box-shadow: 0 0 24px rgba(255, 255, 255, 0.15);
  }
  .confirm-btn.danger {
    background: #8b1a1a;
  }
  .confirm-btn.danger.focused {
    background: #b22222;
    border-color: #fff;
  }

  /* ─── Responsive ────────────────────────────────────────── */
  @media (max-width: 768px) {
    .main-layout {
      padding: 10px;
      gap: 10px;
    }
    .edit-card {
      padding: 20px 16px 24px;
    }
    /* On small screens, keyboard takes full width */
    :global(.keyboard-panel.keyboard-visible > *) {
      max-width: 100%;
    }
  }

  @media (max-width: 480px) {
    .edit-title {
      font-size: 20px;
    }
    .actions-row {
      flex-direction: column;
      gap: 8px;
    }
    .action-btn {
      padding: 10px 0;
      font-size: 14px;
    }
  }
</style>
