
<script>
  import { onMount, onDestroy } from "svelte";
  import { push } from "svelte-spa-router";
  import { logoutUser } from "../lib/api.js";
  import {
    activeProfile,
    authUsername,
    clearAuth,
  } from "../stores/appStore.js";
  import { APP_NAME, VERSION_NAME, BUILD_TYPE } from "../lib/app_manifest.js";

  const AVATAR_DEFAULT = "/images/appstore/profile/Avatar16.png";
  const MAX_PROFILES = 4;

  const BG_IMAGES = [
    "/images/appstore/ottapps/channles1.png",
    "/images/appstore/ottapps/channles2.jpg",
    "/images/appstore/ottapps/channles3.jpg",
  ];

  let username = "User";
  let profiles = [];
  let focusIndex = 0;
  let bgIndex = 0;
  let bgTimer;

  let showLogoutConfirm = false;
  let confirmFocus = "cancel";

  let autoSelectTimer = null;
  let isAutoSelecting = false;
  let userInteracted = false;

  // ─── NEW: Manage mode ──────────────────────────────────────
  let manageMode = false;

  $: slots = buildSlots(username, profiles);

  function buildSlots(user, dummies) {
    const s = [
      {
        id: "main",
        name: user,
        image: AVATAR_DEFAULT,
        isMain: true,
        isAdd: false,
      },
    ];

    dummies.slice(0, MAX_PROFILES - 1).forEach((p, i) => {
      s.push({
        id: `dummy-${i}`,
        name: p.name,
        image: p.image || AVATAR_DEFAULT,
        isMain: false,
        isAdd: false,
      });
    });

    if (dummies.length < MAX_PROFILES - 1) {
      s.push({ id: "add", name: "Add Profile", isMain: false, isAdd: true });
    }

    return s;
  }

  function getMainProfileName() {
    if ($authUsername && $authUsername.trim()) {
      return $authUsername;
    }
    try {
      const raw = localStorage.getItem("ulka_main_profile");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.name) return parsed.name;
      }
    } catch (_) {}
    return localStorage.getItem("ulka_main_profile_name") || "User";
  }

  onMount(() => {
    const savedToken = localStorage.getItem("ulka_token");

    if (!savedToken) {
      push("/login");
      return;
    }

    BG_IMAGES.forEach(src => {
      const img = new Image();
      img.src = src;
    });

    username = getMainProfileName();

    const mainData = {
      name: username,
      age: "",
      gender: "Male",
      image: AVATAR_DEFAULT,
    };
    localStorage.setItem("ulka_main_profile", JSON.stringify(mainData));
    localStorage.setItem("ulka_main_profile_name", username);

    loadProfiles();

    document.addEventListener("keydown", handleKeyDown);

    bgTimer = setInterval(() => {
      bgIndex = (bgIndex + 1) % BG_IMAGES.length;
    }, 8000);

    const alreadySelected = sessionStorage.getItem("ulka_profile_selected");
    const fromLogin = sessionStorage.getItem("from_login") === "true";

    if (!alreadySelected && fromLogin) {
      startAutoSelectTimer();
    } else {
      sessionStorage.removeItem("from_login");
    }
  });

  onDestroy(() => {
    document.removeEventListener("keydown", handleKeyDown);
    clearInterval(bgTimer);
    clearAutoSelectTimer();
  });

  function loadProfiles() {
    const stored = localStorage.getItem("ulka_profiles");
    profiles = stored ? JSON.parse(stored) : [];
  }

  // ─── Auto‑select (unchanged) ──────────────────────────────
  function startAutoSelectTimer() {
    userInteracted = false;
    isAutoSelecting = false;
    clearAutoSelectTimer();

    autoSelectTimer = setTimeout(() => {
      if (!userInteracted && !isAutoSelecting) {
        performAutoSelect();
      }
    }, 3000);
  }

  function clearAutoSelectTimer() {
    if (autoSelectTimer) {
      clearTimeout(autoSelectTimer);
      autoSelectTimer = null;
    }
  }

  function performAutoSelect() {
    if (isAutoSelecting) return;
    if (userInteracted) return;
    if (showLogoutConfirm) return;

    isAutoSelecting = true;
    clearAutoSelectTimer();
    sessionStorage.removeItem("from_login");

    const mainSlot = slots.find(s => s.isMain && !s.isAdd);
    if (mainSlot) {
      sessionStorage.setItem("auto_fullscreen", "true");
      selectSlot(mainSlot);
    } else {
      const firstSlot = slots.find(s => !s.isAdd);
      if (firstSlot) {
        sessionStorage.setItem("auto_fullscreen", "true");
        selectSlot(firstSlot);
      }
    }
  }

  // ─── NEW: Toggle manage mode ──────────────────────────────
  function toggleManageMode() {
    manageMode = !manageMode;
    if (manageMode) {
      // Optionally reset focus to first profile
      focusIndex = 0;
    }
  }

  // ─── Exit manage mode ──────────────────────────────────────
  function exitManageMode() {
    if (manageMode) {
      manageMode = false;
    }
  }

  // ─── Keydown handler (updated) ────────────────────────────
  function handleKeyDown(e) {
    if (e.target.tagName === "INPUT") return;

    const nav = [
      "ArrowLeft",
      "ArrowRight",
      "ArrowUp",
      "ArrowDown",
      "Enter",
      "Escape",
      "Backspace",
    ];
    if (!nav.includes(e.key)) return;
    e.preventDefault();

    if (!userInteracted) {
      userInteracted = true;
      clearAutoSelectTimer();
      sessionStorage.removeItem("from_login");
    }

    if (showLogoutConfirm) {
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        confirmFocus = confirmFocus === "cancel" ? "confirm" : "cancel";
      } else if (e.key === "Escape" || e.key === "Backspace") {
        showLogoutConfirm = false;
      } else if (e.key === "Enter") {
        if (confirmFocus === "confirm") {
          handleLogout();
        } else {
          showLogoutConfirm = false;
        }
      }
      return;
    }

    // ─── NEW: Exit manage mode on Escape/Backspace ──────────
    if (manageMode && (e.key === "Escape" || e.key === "Backspace")) {
      exitManageMode();
      return;
    }

    // ─── Navigation ──────────────────────────────────────────
    switch (e.key) {
      case "ArrowDown":
        if (focusIndex === "logout") break;
        if (focusIndex === "manage") {
          focusIndex = "logout";
        } else if (focusIndex < slots.length - 1) {
          focusIndex++;
        } else {
          focusIndex = "manage";
        }
        break;
      case "ArrowUp":
        if (focusIndex === "manage") {
          focusIndex = slots.length - 1;
        } else if (focusIndex === "logout") {
          focusIndex = "manage";
        } else if (focusIndex > 0) {
          focusIndex--;
        }
        break;
      case "Enter":
        if (focusIndex === "manage") {
          toggleManageMode();
        } else if (focusIndex === "logout") {
          showLogoutConfirm = true;
          confirmFocus = "cancel";
        } else {
          selectSlot(slots[focusIndex]);
        }
        break;
      case "Escape":
      case "Backspace":
        push("/exit");
        break;
    }
  }

  // ─── Logout ────────────────────────────────────────────────
  async function handleLogout() {
    await logoutUser();
    clearAuth();
    sessionStorage.removeItem("auto_fullscreen");
    sessionStorage.removeItem("ulka_profile_selected");
    sessionStorage.removeItem("from_login");
    push("/login");
  }

  // ─── Select / Edit slot ────────────────────────────────────
  function selectSlot(slot) {
    if (slot.isAdd) {
      push("/create-profile");
      return;
    }

    // ─── NEW: If in manage mode, go to edit ─────────────────
    if (manageMode) {
      push(`/edit-profile/${slot.name}`);
      exitManageMode(); // exit after navigating
      return;
    }

    // Normal select (go to home)
    clearAutoSelectTimer();
    userInteracted = true;
    sessionStorage.removeItem("from_login");

    localStorage.setItem("ulka_active_profile", slot.name);
    activeProfile.set(slot.name);
    localStorage.setItem("ulka_is_main", slot.isMain ? "true" : "false");
    sessionStorage.setItem("ulka_profile_selected", "true");
    push("/home");
  }
</script>

<div class="profile-screen-container">
  <div class="background-container">
    <img
      src="/images/appstore/ottapps/channles1.png"
      alt="Background"
      class="background-img"
      style="opacity: {bgIndex === 0 ? 1 : 0}"
      loading="eager"
    />
    <img
      src="/images/appstore/ottapps/channles2.jpg"
      alt="Background 2"
      class="background-img"
      style="opacity: {bgIndex === 1 ? 1 : 0}"
      loading="eager"
    />
    <img
      src="/images/appstore/ottapps/channles3.jpg"
      alt="Background"
      class="background-img"
      style="opacity: {bgIndex === 2 ? 1 : 0}"
      loading="eager"
    />
    <div class="overlay"></div>
  </div>

  <div class="profile-panel">
    <div class="profile-group">
      <h1 class="profile-title">
        {#if manageMode}
          Edit Profile
        {:else}
          Who's Watching?
        {/if}
      </h1>

      <div class="profiles-container">
        {#each slots as slot, idx}
          <button
            class="profile-item"
            on:click={() => {
              if (!userInteracted) {
                userInteracted = true;
                clearAutoSelectTimer();
                sessionStorage.removeItem("from_login");
              }
              focusIndex = idx;
              selectSlot(slot);
            }}
          >
            {#if slot.isAdd}
              <div class="add-profile-btn" class:focused={focusIndex === idx}>
                <span>+</span>
              </div>
            {:else}
              <div
                class="profile-btn"
                class:main-profile={slot.isMain}
                class:focused={focusIndex === idx}
                class:manage-mode={manageMode}
              >
                <img src={slot.image} alt={slot.name} />
                <!-- ─── NEW: Edit icon in manage mode ─────── -->
                {#if manageMode}
                  <span class="edit-badge">✎</span>
                {/if}
              </div>
            {/if}
            <p class="profile-name">
              {slot.name}
              {#if manageMode && !slot.isAdd}
                <span class="edit-hint">(edit)</span>
              {/if}
            </p>
          </button>
        {/each}
      </div>

      <!-- ─── Manage button toggles mode ──────────────────── -->
      <button
        class="manage-btn"
        class:focused={focusIndex === "manage" && !showLogoutConfirm}
        on:click={() => {
          if (!userInteracted) {
            userInteracted = true;
            clearAutoSelectTimer();
            sessionStorage.removeItem("from_login");
          }
          focusIndex = "manage";
          toggleManageMode();
        }}
      >
        <span class="edit-icon">✎</span>
        {#if manageMode}
          Done
        {:else}
          Manage Profile
        {/if}
      </button>
    </div>

    <div class="version-badge">
      v{VERSION_NAME}{#if BUILD_TYPE !== 'live'}&nbsp;<span class="build-type build-type--{BUILD_TYPE}">{BUILD_TYPE}</span>{/if}
    </div>

    <button
      class="logout-btn"
      class:focused={focusIndex === "logout" && !showLogoutConfirm}
      on:click={() => {
        if (!userInteracted) {
          userInteracted = true;
          clearAutoSelectTimer();
          sessionStorage.removeItem("from_login");
        }
        focusIndex = "logout";
        showLogoutConfirm = true;
        confirmFocus = "cancel";
      }}
    >
      Logout
    </button>
  </div>
</div>

{#if showLogoutConfirm}
  <div class="logout-confirm-overlay">
    <div class="logout-confirm-box">
      <h2>Log Out?</h2>
      <p>Are you sure you want to log out of {APP_NAME}?</p>
      <div class="confirm-actions">
        <button
          class="confirm-btn"
          class:focused={confirmFocus === "cancel"}
          on:click={() => (showLogoutConfirm = false)}
        >
          Cancel
        </button>
        <button
          class="confirm-btn"
          class:focused={confirmFocus === "confirm"}
          on:click={handleLogout}
        >
          Log Out
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .profile-screen-container {
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
  .background-img {
    position: absolute;
    width: 100%;
    height: 100%;
    object-fit: cover;
    transition: opacity 1.5s ease-in-out;
    will-change: opacity;
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
    background: linear-gradient(
      to right,
      rgba(0, 0, 0, 0.92) 50%,
      rgba(0, 0, 0, 0.7) 80%,
      transparent 100%
    );
  }
  .profile-title {
    font-size: 25px;
    font-weight: 700;
    color: #fff;
    margin-bottom: 32px;
    text-align: center;
    width: 100%;
  }
  .profile-group {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    flex: 1;
    width: 100%;
  }
  .profiles-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 24px;
    width: 100%;
  }
  .profile-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 110px;
    cursor: pointer;
    background: none;
    border: none;
    padding: 0;
    font: inherit;
    color: inherit;
  }
  .profile-btn {
    width: 72px;
    height: 72px;
    border-radius: 50%;
    display: flex;
    justify-content: center;
    align-items: center;
    border: 3px solid transparent;
    margin-bottom: 8px;
    transition: all 250ms;
    outline: none;
    background-color: #1a1a1a;
    position: relative;
  }
  .profile-btn.main-profile {
    background-color: #e50914;
  }
  .profile-btn.focused {
    border-color: #e1001e;
    transform: scale(1.1);
    box-shadow: 0 0 20px #e1001e;
  }
  .profile-btn img {
    width: 100%;
    height: 100%;
    border-radius: 50%;
    object-fit: cover;
  }

  /* ─── NEW: Edit badge in manage mode ───────────────────── */
  .profile-btn.manage-mode .edit-badge {
    position: absolute;
    bottom: -6px;
    right: -6px;
    background: #e50914;
    color: #fff;
    border-radius: 50%;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    font-weight: bold;
    border: 2px solid #000;
  }

  .profile-name {
    color: #fff;
    font-size: 18px;
    font-weight: 500;
    text-align: center;
    margin: 0;
  }
  .edit-hint {
    font-size: 11px;
    color: #e50914;
    font-weight: 400;
    margin-left: 4px;
  }

  .add-profile-btn {
    width: 72px;
    height: 72px;
    border-radius: 50%;
    background-color: #333;
    display: flex;
    justify-content: center;
    align-items: center;
    border: 3px solid transparent;
    margin-bottom: 8px;
    transition: all 250ms;
    outline: none;
  }
  .add-profile-btn.focused {
    border-color: #e1001e;
    transform: scale(1.1);
    box-shadow: 0 0 20px #e1001e;
  }
  .add-profile-btn span {
    color: #fff;
    font-size: 42px;
    font-weight: 400;
    margin-bottom: auto;
  }
  .version-badge {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.3);
    letter-spacing: 0.5px;
    margin-bottom: 10px;
    text-align: center;
  }
  .build-type {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 1px;
    padding: 1px 6px;
    border-radius: 10px;
    vertical-align: middle;
  }
  .build-type--beta     { background: #1a73e8; color: #fff; }
  .build-type--internal { background: #555;    color: #fff; }

  .manage-btn {
    margin-top: 28px;
    padding: 10px 9px;
    border-radius: 20px;
    background-color: rgba(255, 255, 255, 0.08);
    border: 3px solid transparent;
    color: #ccc;
    font-size: 16px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.25s;
    letter-spacing: 0.5px;
    user-select: none;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .manage-btn .edit-icon {
    font-size: 18px;
    line-height: 1;
  }
  .manage-btn.focused {
    border-color: #e1001e;
    background-color: rgba(229, 9, 20, 0.25);
    color: #fff;
    transform: scale(1.05);
    box-shadow: 0 0 20px rgba(229, 9, 20, 0.3);
  }

  .logout-btn {
    margin-top: auto;
    padding: 10px 30px;
    border-radius: 20px;
    background-color: rgba(229, 9, 20, 0.8);
    border: 3px solid transparent;
    color: #fff;
    font-size: 16px;
    font-weight: bold;
    cursor: pointer;
    transition: all 0.2s;
  }
  .logout-btn.focused {
    border: 3px solid #fff;
    transform: scale(1.05);
    box-shadow: 0 0 15px rgba(229, 9, 20, 0.8);
  }

  .logout-confirm-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: rgba(0, 0, 0, 0.85);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 9999;
  }
  .logout-confirm-box {
    background: #1a1a1a;
    padding: 30px 40px;
    border-radius: 15px;
    border: 2px solid #333;
    text-align: center;
    min-width: 320px;
  }
  .logout-confirm-box h2 {
    color: #e50914;
    margin-bottom: 10px;
    font-size: 24px;
    font-weight: 700;
  }
  .logout-confirm-box p {
    color: #ddd;
    font-size: 18px;
    margin-bottom: 25px;
  }
  .confirm-actions {
    display: flex;
    gap: 20px;
    justify-content: center;
  }
  .confirm-btn {
    padding: 12px 30px;
    border-radius: 8px;
    font-size: 18px;
    font-weight: bold;
    cursor: pointer;
    background: #333;
    border: 3px solid transparent;
    transition: all 0.2s;
    color: #fff;
  }
  .confirm-btn.focused {
    border-color: #fff;
    background: #e50914;
    transform: scale(1.05);
  }

  @media (max-width: 768px) {
    .profile-panel { width: 40%; padding: 20px 12px 30px; }
    .profile-title { font-size: 20px; }
    .profile-btn, .add-profile-btn { width: 60px; height: 60px; }
    .profile-name { font-size: 15px; }
    .manage-btn { font-size: 14px; padding: 8px 20px; }
  }
  @media (max-width: 480px) {
    .profile-panel { width: 55%; padding: 16px 10px 20px; }
    .profile-title { font-size: 17px; margin-bottom: 8px; }
    .profile-btn, .add-profile-btn { width: 50px; height: 50px; }
    .profile-name { font-size: 13px; }
    .logout-btn { padding: 8px 20px; font-size: 14px; }
    .version-badge { font-size: 10px; }
    .manage-btn { font-size: 12px; padding: 6px 16px; margin-top: 18px; }
  }
</style>
