//ProfileFrom.svelte

<script>
  import { onMount, onDestroy } from "svelte";
  import { push } from "svelte-spa-router";
  import { clearAuth, activeProfile, authUsername } from "../stores/appStore.js";
  import VirtualKeyboard from "../components/VirtualKeyboard.svelte";

  // ─── Router params ──────────────────────────────────────────
  export let params = {};

  // ─── Form state ────────────────────────────────────────────
  let mode = "create";        // "create" or "edit"
  let profileId = null;

  let name = "";
  let age = 18;
  let gender = "Male";

  // ─── Age groups (only two) ────────────────────────────────
  const ageGroups = [
    { label: 'Under 18', value: 18 },
    { label: '18+', value: 19 }
  ];
  let selectedAgeGroup = ageGroups[0];

  // ─── Flag to know if we are editing the main profile ──────
  let isEditingMain = false;
  // ─── Computed: show delete button only for non‑main edits ─
  $: showDelete = mode === "edit" && !isEditingMain;

  // ─── Focus and keyboard state ──────────────────────────────
  let currentFocus = 0;
  let focusRefs = [];
  let showDeleteConfirm = false;
  let confirmFocus = "cancel";

  // ─── Background slider – your full list ────────────────────
  const BG_IMAGES = [
    "/images/appstore/ottapps/wall10.jpg",
    "/images/appstore/ottapps/wall4.png",
    "/images/appstore/ottapps/wall3.png",
    "/images/appstore/ottapps/wall9.png",
  ];
  let bgIndex = 0;
  let bgTimer;

  // ─── Virtual Keyboard state ────────────────────────────────
  let isKeyboardVisible = false;
  let keyboardTarget = "";
  let keyboard;

  // ─── Auto‑dismiss timer ────────────────────────────────────
  let inactivityTimer = null;

  // ─── Helper to get age group from numeric age ──────────────
  function getAgeGroup(ageNum) {
    return ageNum <= 18 ? ageGroups[0] : ageGroups[1];
  }

  // ─── Select an age group ──────────────────────────────────
  function selectAgeGroup(group) {
    selectedAgeGroup = group;
    age = group.value;
  }

  // ─── Load profile for editing ──────────────────────────────
  function loadProfileForEdit() {
    if (!profileId) return;

    // 1. Get main profile details
    const mainName = localStorage.getItem("ulka_main_profile_name") || "";
    let mainProfileData = null;
    try {
      const mainRaw = localStorage.getItem("ulka_main_profile");
      if (mainRaw) mainProfileData = JSON.parse(mainRaw);
    } catch (_) {}

    // 2. Check if we are editing the main profile (by name)
    if (profileId === mainName || (mainProfileData && profileId === mainProfileData.name)) {
      isEditingMain = true;
      // Use main profile data if available, otherwise fallback
      if (mainProfileData) {
        name = mainProfileData.name || mainName;
        age = parseInt(mainProfileData.age, 10) || 18;
        gender = mainProfileData.gender || "Male";
      } else {
        name = mainName;
        age = 18;
        gender = "Male";
      }
      selectedAgeGroup = getAgeGroup(age);
      return;
    }

    // 3. Not main – look in profiles array
    const stored = JSON.parse(localStorage.getItem("ulka_profiles") || "[]");
    const profile = stored.find(p => p.id === profileId || p.name === profileId);
    if (profile) {
      name = profile.name || "";
      age = parseInt(profile.age, 10) || 18;
      gender = profile.gender || "Male";
      selectedAgeGroup = getAgeGroup(age);
      isEditingMain = false;
      return;
    }

    // 4. Still nothing? fallback
    name = profileId;
    age = 18;
    gender = "Male";
    selectedAgeGroup = getAgeGroup(age);
    isEditingMain = false;
  }

  // ─── Save ──────────────────────────────────────────────────
  function handleSave() {
    if (!name.trim()) {
      alert("Please enter a name");
      return;
    }

    const newProfile = {
      id: profileId || Date.now().toString(),
      name: name.trim(),
      age: String(age),
      gender: gender,
      image: "/images/appstore/profile/Avatar16.png",
    };

    let profiles = JSON.parse(localStorage.getItem("ulka_profiles") || "[]");

    if (mode === "create") {
      if (profiles.length >= 3) {
        alert("Maximum 3 profiles reached.");
        return;
      }
      profiles.push(newProfile);
      localStorage.setItem("ulka_profiles", JSON.stringify(profiles));
    } else {
      const index = profiles.findIndex(p => p.id === profileId || p.name === profileId);
      if (index !== -1) {
        profiles[index] = newProfile;
        localStorage.setItem("ulka_profiles", JSON.stringify(profiles));
      }
    }

    // Always update main profile if this is the main one
    if (isEditingMain) {
      const mainData = {
        name: newProfile.name,
        age: newProfile.age,
        gender: newProfile.gender,
        image: newProfile.image,
      };
      localStorage.setItem("ulka_main_profile", JSON.stringify(mainData));
      localStorage.setItem("ulka_main_profile_name", newProfile.name);
      try { authUsername.set(newProfile.name); } catch (_) {}
      try { activeProfile.set(newProfile.name); } catch (_) {}
    }

    push("/profile");
  }

  function handleCancel() {
    push("/profile");
  }

  // ─── Delete profile ──────────────────────────────────────────
  function handleDeleteConfirm() {
    showDeleteConfirm = false;
    let profiles = JSON.parse(localStorage.getItem("ulka_profiles") || "[]");
    const index = profiles.findIndex(p => p.id === profileId || p.name === profileId);
    if (index !== -1) {
      profiles.splice(index, 1);
      localStorage.setItem("ulka_profiles", JSON.stringify(profiles));
    }

    if (isEditingMain) {
      localStorage.removeItem("ulka_main_profile");
      localStorage.removeItem("ulka_main_profile_name");
      localStorage.removeItem("ulka_token");
      localStorage.removeItem("ulka_active_profile");
      sessionStorage.removeItem("ulka_profile_selected");
      sessionStorage.removeItem("auto_fullscreen");
      sessionStorage.removeItem("from_login");
      clearAuth();
      activeProfile.set(null);
      push("/login");
    } else {
      push("/profile");
    }
  }

  // ─── Focus management ──────────────────────────────────────
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

  // ─── Keyboard functions ────────────────────────────────────
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

  // ─── Remote control key handling ──────────────────────────
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
        setFocus(showDelete ? 5 : 4); // fallback to cancel if delete button absent
      } else if (key === "Enter") {
        e.preventDefault();
        if (confirmFocus === "confirm") {
          handleDeleteConfirm();
        } else {
          showDeleteConfirm = false;
          setFocus(showDelete ? 5 : 4);
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

    // Age group navigation
    if (currentFocus === 1) {
      if (key === "ArrowLeft") {
        e.preventDefault();
        const idx = ageGroups.indexOf(selectedAgeGroup);
        if (idx > 0) selectAgeGroup(ageGroups[idx - 1]);
        return;
      }
      if (key === "ArrowRight") {
        e.preventDefault();
        const idx = ageGroups.indexOf(selectedAgeGroup);
        if (idx < ageGroups.length - 1) selectAgeGroup(ageGroups[idx + 1]);
        return;
      }
    }

    // Gender toggle
    if (currentFocus === 2) {
      if (key === "ArrowLeft" || key === "ArrowRight") {
        e.preventDefault();
        gender = gender === "Male" ? "Female" : "Male";
        return;
      }
    }

    // ─── Focus map (adjusted for showDelete) ────────────────
    let focusMap = {};
    focusMap[0] = { up: null, down: 1, left: null, right: null };
    focusMap[1] = { up: 0, down: 2, left: null, right: null };
    focusMap[2] = { up: 1, down: 3, left: null, right: null };
    focusMap[3] = { up: 2, down: 4, left: null, right: 4 };
    focusMap[4] = { up: 3, down: showDelete ? 5 : null, left: 3, right: showDelete ? 5 : null };
    if (showDelete) {
      focusMap[5] = { up: 4, down: null, left: 4, right: null };
    }

    const current = focusMap[currentFocus];
    if (!current) return;

    let target = null;
    switch (key) {
      case "ArrowUp":
        e.preventDefault();
        target = current.up;
        break;
      case "ArrowDown":
        e.preventDefault();
        target = current.down;
        break;
      case "ArrowLeft":
        if (currentFocus === 0) return;
        e.preventDefault();
        target = current.left;
        break;
      case "ArrowRight":
        if (currentFocus === 0) return;
        e.preventDefault();
        target = current.right;
        break;
      case "Enter":
        e.preventDefault();
        if (currentFocus === 0) {
          openKeyboard();
        } else if (currentFocus === 3) {
          handleSave();
        } else if (currentFocus === 4) {
          handleCancel();
        } else if (currentFocus === 5 && showDelete) {
          showDeleteConfirm = true;
          confirmFocus = "cancel";
        }
        return;
      case "Escape":
      case "Backspace":
        e.preventDefault();
        handleCancel();
        return;
      default:
        return;
    }
    if (target !== null && target < focusRefs.length) {
      setFocus(target);
    }
  }

  // ─── Lifecycle ─────────────────────────────────────────────
  onMount(() => {
    const token = localStorage.getItem("ulka_token");
    if (!token) {
      push("/login");
      return;
    }

    const id = params.id;
    if (id) {
      mode = "edit";
      profileId = id;
      loadProfileForEdit();
    } else {
      mode = "create";
      selectedAgeGroup = getAgeGroup(age);
    }

    // Preload all background images
    BG_IMAGES.forEach(src => {
      const img = new Image();
      img.src = src;
    });

    document.addEventListener("keydown", handleKeydown);
    bgTimer = setInterval(() => {
      bgIndex = (bgIndex + 1) % BG_IMAGES.length;
    }, 3000);

    setTimeout(() => setFocus(0), 100);
  });

  onDestroy(() => {
    document.removeEventListener("keydown", handleKeydown);
    clearInterval(bgTimer);
    clearTimeout(inactivityTimer);
  });
</script>

<!-- ════════════════════════════════════════════════════════════ -->
<!-- TEMPLATE – NO OVERLAY, ALL IMAGES SHOW CLEARLY           -->
<!-- ════════════════════════════════════════════════════════════ -->
<div class="profile-form-container">
  <!-- Background slider (no overlay) -->
  <div class="background-container">
    {#each BG_IMAGES as src, i}
      <img {src} alt="Background {i+1}" class="bg-image" class:active={bgIndex === i} />
    {/each}
  </div>

  <!-- Main layout: LEFT panel + keyboard at bottom -->
  <div class="main-layout">
    <div class="form-panel">
      <div class="form-card">
        <h1 class="form-title">{mode === "create" ? "Create Profile" : "Edit Profile"}</h1>

        <!-- Name -->
        <div class="field-group">
          <label class="field-label" for="name-control">Name</label>
          <button
            bind:this={focusRefs[0]}
            id="name-control"
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

        <!-- Age -->
        <div class="field-group">
          <label class="field-label" for="age-control">Age</label>
          <!-- svelte-ignore a11y-no-noninteractive-tabindex -->
          <div
            bind:this={focusRefs[1]}
            id="age-control"
            class="option-group"
            tabindex="0"
            role="group"
            aria-label="Age group selection"
            on:focus={() => setFocus(1)}
          >
            {#each ageGroups as group, i}
              <button
                class="option-item"
                class:selected={selectedAgeGroup === group}
                on:click={() => selectAgeGroup(group)}
                tabindex="-1"
                type="button"
              >
                <span class="dot" class:filled={selectedAgeGroup === group}></span>
                <span class="label">{group.label}</span>
              </button>
            {/each}
          </div>
          <span class="hint">◄/► to select</span>
        </div>

        <!-- Gender -->
        <div class="field-group">
          <label class="field-label" for="gender-control">Gender</label>
          <!-- svelte-ignore a11y-no-noninteractive-tabindex -->
          <div
            bind:this={focusRefs[2]}
            id="gender-control"
            class="option-group"
            tabindex="0"
            role="group"
            aria-label="Gender selection"
            on:focus={() => setFocus(2)}
          >
            <button
              class="option-item"
              class:selected={gender === "Male"}
              on:click={() => gender = "Male"}
              tabindex="-1"
              type="button"
            >
              <span class="dot" class:filled={gender === "Male"}></span>
              <span class="label">Male</span>
            </button>
            <button
              class="option-item"
              class:selected={gender === "Female"}
              on:click={() => gender = "Female"}
              tabindex="-1"
              type="button"
            >
              <span class="dot" class:filled={gender === "Female"}></span>
              <span class="label">Female</span>
            </button>
          </div>
          <span class="hint">◄/► to toggle</span>
        </div>

        <!-- Actions -->
        <div class="actions-row">
          <button bind:this={focusRefs[3]} class="action-btn save-btn" class:focused={currentFocus === 3} on:click={handleSave} on:focus={() => setFocus(3)}>
            {mode === "create" ? "Create" : "Save"}
          </button>
          <button bind:this={focusRefs[4]} class="action-btn cancel-btn" class:focused={currentFocus === 4} on:click={handleCancel} on:focus={() => setFocus(4)}>
            Cancel
          </button>
          {#if showDelete}
            <button
              bind:this={focusRefs[5]}
              class="action-btn delete-btn"
              class:focused={currentFocus === 5}
              on:click={() => { showDeleteConfirm = true; confirmFocus = "cancel"; }}
              on:focus={() => setFocus(5)}
            >
              🗑 Delete
            </button>
          {/if}
        </div>
      </div>
    </div>

    <!-- KEYBOARD PANEL -->
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

<!-- Delete Confirm Overlay -->
{#if showDeleteConfirm}
  <div class="confirm-overlay">
    <div class="confirm-box">
      <h3>Delete Profile?</h3>
      <p>All data will be permanently lost. Are you sure?</p>
      <div class="confirm-actions">
        <button class="confirm-btn" class:focused={confirmFocus === "cancel"} on:click={() => { showDeleteConfirm = false; setFocus(showDelete ? 5 : 4); }} on:focus={() => { confirmFocus = "cancel"; }}>Cancel</button>
        <button class="confirm-btn danger" class:focused={confirmFocus === "confirm"} on:click={handleDeleteConfirm} on:focus={() => { confirmFocus = "confirm"; }}>Delete</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .profile-form-container {
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

  .main-layout {
    position: relative;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    width: 100%;
    height: 100%;
    z-index: 10;
    padding: 5% 5% 2% 5%;
    box-sizing: border-box;
    gap: 20px;
  }

  .form-panel {
    flex: 0 0 auto;
    display: flex;
    justify-content: flex-start;
    align-items: flex-start;
    width: 100%;
  }

  .form-card {
    background: rgba(20, 20, 20, 0.92);
    padding: 30px 36px 36px;
    border-radius: 24px;
    border: 2px solid #333;
    max-width: 420px;
    width: 100%;
    box-shadow: 0 30px 80px rgba(0, 0, 0, 0.9);
    margin-left: 0;
    margin-right: auto;
    backdrop-filter: blur(6px);
  }

  .form-title {
    color: #fff;
    font-size: 26px;
    font-weight: 700;
    margin-bottom: 24px;
    text-align: left;
    letter-spacing: 0.5px;
  }
  .form-title::after {
    content: "";
    display: block;
    width: 50px;
    height: 3px;
    background: #e50914;
    margin: 8px 0 0 0;
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

  .option-group {
    display: flex;
    gap: 20px;
    padding: 6px 12px;
    border-radius: 12px;
    border: 2px solid #333;
    background: #222;
    transition: all 0.2s;
    outline: none;
    flex-wrap: wrap;
  }
  /* Focus border removed from option-group as requested */

  .option-item {
    display: flex;
    align-items: center;
    gap: 8px;
    background: transparent;
    border: none;
    color: #aaa;
    font-size: 15px;
    padding: 6px 12px;
    border-radius: 20px;
    cursor: pointer;
    transition: all 0.2s;
    outline: none;
  }
  .option-item:hover {
    color: #fff;
  }
  .option-item.selected {
    color: #fff;
  }

  .dot {
    display: inline-block;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    border: 2px solid #666;
    background: transparent;
    transition: all 0.2s;
    flex-shrink: 0;
  }
  .dot.filled {
    background: #e50914;
    border-color: #e50914;
    box-shadow: 0 0 10px rgba(229, 9, 20, 0.5);
  }
  .option-item.selected .dot {
    border-color: #e50914;
  }

  .label {
    font-weight: 500;
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
  .cancel-btn { background: #444; }
  .cancel-btn.focused { background: #555; }
  .delete-btn { background: #7a1a1a; }
  .delete-btn.focused { background: #a02020; }

  .keyboard-panel {
    flex: 0 0 auto;
    display: flex;
    justify-content: center;
    align-items: center;
    width: 100%;
    min-height: 80px;
  }

  :global(.keyboard-panel.keyboard-visible > *) {
    width: 100%;
    max-width: 750px;
    background: rgba(0, 0, 0, 0.85);
    border-radius: 16px;
    padding: 10px;
    box-shadow: 0 0 30px rgba(0, 0, 0, 0.8);
  }

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

  @media (max-width: 768px) {
    .main-layout { padding: 10px; gap: 10px; }
    .form-card { padding: 20px 16px 24px; max-width: 100%; }
    :global(.keyboard-panel.keyboard-visible > *) { max-width: 100%; }
    .option-group { gap: 12px; }
    .option-item { font-size: 13px; padding: 4px 8px; }
  }

  @media (max-width: 480px) {
    .form-title { font-size: 20px; }
    .actions-row { flex-direction: column; gap: 8px; }
    .action-btn { padding: 10px 0; font-size: 14px; }
    .option-group { gap: 8px; }
    .option-item { font-size: 12px; padding: 4px 6px; }
    .dot { width: 14px; height: 14px; }
  }
</style>
