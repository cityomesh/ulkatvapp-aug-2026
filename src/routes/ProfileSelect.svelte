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

  let username = "Main Profile";
  let profiles = [];
  let focusIndex = 0;
  let bgIndex = 0;
  let bgTimer;
  let showLogoutConfirm = false;
  let confirmFocus = "cancel";

  // ─── Auto‑navigation timer ────────────────────────────
  let autoNavTimer = null;
  const AUTO_NAV_DELAY = 3000; // 3 seconds

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

  function startAutoNavTimer() {
    clearAutoNavTimer();
    autoNavTimer = setTimeout(() => {
      const targetSlot = slots[focusIndex];
      if (targetSlot && !targetSlot.isAdd) {
        selectSlot(targetSlot, true); // autoFullscreen = true
      } else {
        const mainSlot = slots.find(s => s.isMain);
        if (mainSlot) selectSlot(mainSlot, true);
      }
    }, AUTO_NAV_DELAY);
  }

  function clearAutoNavTimer() {
    if (autoNavTimer) {
      clearTimeout(autoNavTimer);
      autoNavTimer = null;
    }
  }

  function handleUserInteraction() {
    clearAutoNavTimer();
  }

  onMount(() => {
    const savedToken = localStorage.getItem("ulka_token");
    if (!savedToken) {
      push("/login");
      return;
    }
    if ($authUsername) {
      localStorage.setItem("ulka_main_profile_name", $authUsername);
    }
    username = localStorage.getItem("ulka_main_profile_name") || "Main Profile";
    loadProfiles();

    document.addEventListener("keydown", handleKeyDown);
    bgTimer = setInterval(() => {
      bgIndex = (bgIndex + 1) % 3;
    }, 8000);

    startAutoNavTimer();
  });

  onDestroy(() => {
    document.removeEventListener("keydown", handleKeyDown);
    clearInterval(bgTimer);
    clearAutoNavTimer();
  });

  function loadProfiles() {
    const stored = localStorage.getItem("ulka_profiles");
    profiles = stored ? JSON.parse(stored) : [];
  }

  function handleKeyDown(e) {
    const nav = [
      "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown",
      "Enter", "Escape", "Backspace"
    ];
    if (!nav.includes(e.key)) return;
    e.preventDefault();
    handleUserInteraction(); // user pressed a key → cancel auto‑timer

    if (showLogoutConfirm) {
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        confirmFocus = confirmFocus === "cancel" ? "confirm" : "cancel";
      } else if (e.key === "Escape" || e.key === "Backspace") {
        showLogoutConfirm = false;
      } else if (e.key === "Enter") {
        if (confirmFocus === "confirm") handleLogout();
        else showLogoutConfirm = false;
      }
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        if (focusIndex === "logout") break;
        if (focusIndex < slots.length - 1) focusIndex++;
        else focusIndex = "logout";
        break;
      case "ArrowUp":
        if (focusIndex === "logout") focusIndex = slots.length - 1;
        else if (focusIndex > 0) focusIndex--;
        break;
      case "Enter":
        if (focusIndex === "logout") {
          showLogoutConfirm = true;
          confirmFocus = "cancel";
        } else {
          selectSlot(slots[focusIndex], false);
        }
        break;
      case "Escape":
      case "Backspace":
        push("/exit");
        break;
    }
  }

  async function handleLogout() {
    await logoutUser();
    clearAuth();
    push("/login");
  }

  function selectSlot(slot, autoFullscreen = false) {
    clearAutoNavTimer();
    if (slot.isAdd) {
      push("/create-profile");
    } else {
      localStorage.setItem("ulka_active_profile", slot.name);
      activeProfile.set(slot.name);
      localStorage.setItem("ulka_is_main", slot.isMain ? "true" : "false");
      sessionStorage.setItem("ulka_profile_selected", "true");
      if (autoFullscreen) {
        // Flag for Home page to enter fullscreen immediately
        sessionStorage.setItem("auto_fullscreen", "true");
      } else {
        sessionStorage.removeItem("auto_fullscreen");
      }
      push("/home");
    }
  }
</script>

<!-- ─── TEMPLATE (unchanged) ─────────────────────────── -->
<div class="profile-screen-container">
  <div class="background-container">
    <img src="/images/appstore/ottapps/channles1.png" alt="Background" class="background-img" style="opacity: {bgIndex === 0 ? 1 : 0}" />
    <img src="/images/appstore/ottapps/wall1.png" alt="Background 2" class="background-img" style="opacity: {bgIndex === 1 ? 1 : 0}" />
    <img src="/images/appstore/ottapps/wall8.png" alt="Background" class="background-img" style="opacity: {bgIndex === 2 ? 1 : 0}" />
    <div class="overlay"></div>
  </div>

  <div class="profile-panel">
    <div class="profile-group">
      <h1 class="profile-title">Who's Watching?</h1>
      <div class="profiles-container">
        {#each slots as slot, idx}
          <div class="profile-item" role="button" tabindex="0"
            on:click={() => { focusIndex = idx; selectSlot(slot, false); }}
            on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); focusIndex = idx; selectSlot(slot, false); } }}
          >
            {#if slot.isAdd}
              <div class="add-profile-btn" class:focused={focusIndex === idx} role="button" tabindex="0"
                on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectSlot(slot, false); } }}
              ><span>+</span></div>
            {:else}
              <div class="profile-btn" class:main-profile={slot.isMain} class:focused={focusIndex === idx} role="button" tabindex="0"
                on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectSlot(slot, false); } }}
              ><img src={slot.image} alt={slot.name} /></div>
            {/if}
            <p class="profile-name">{slot.name}{#if slot.isMain}<span class="main-tag">(Main)</span>{/if}</p>
          </div>
        {/each}
      </div>
    </div>

    <div class="version-badge">
      v{VERSION_NAME}{#if BUILD_TYPE !== 'live'}&nbsp;<span class="build-type build-type--{BUILD_TYPE}">{BUILD_TYPE}</span>{/if}
    </div>

    <div class="logout-btn" class:focused={focusIndex === "logout" && !showLogoutConfirm} role="button" tabindex="0"
      on:click={() => { focusIndex = "logout"; showLogoutConfirm = true; confirmFocus = "cancel"; }}
      on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); focusIndex = "logout"; showLogoutConfirm = true; confirmFocus = "cancel"; } }}
    >Logout</div>
  </div>
</div>

{#if showLogoutConfirm}
<div class="logout-confirm-overlay">
  <div class="logout-confirm-box">
    <h2>Log Out?</h2>
    <p>Are you sure you want to log out of {APP_NAME}?</p>
    <div class="confirm-actions">
      <div class="confirm-btn" class:focused={confirmFocus === "cancel"} role="button" tabindex="0"
        on:click={() => showLogoutConfirm = false}
        on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); showLogoutConfirm = false; } }}
      >Cancel</div>
      <div class="confirm-btn" class:focused={confirmFocus === "confirm"} role="button" tabindex="0"
        on:click={handleLogout}
        on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleLogout(); } }}
      >Log Out</div>
    </div>
  </div>
</div>
{/if}

<style>
  /* (all styles unchanged – keep as before) */
  .profile-screen-container { width:100vw; height:100vh; display:flex; justify-content:flex-start; align-items:center; background-color:#020202; position:relative; overflow:hidden; }
  .background-container { position:absolute; top:0; left:0; width:100%; height:100%; z-index:1; }
  .background-img { position:absolute; width:100%; height:100%; object-fit:cover; transition:opacity 1.5s ease-in-out; }
  .overlay { position:absolute; top:0; left:0; width:100%; height:100%; z-index:2; }
  .profile-panel { display:flex; flex-direction:column; align-items:center; z-index:10; width:27%; height:100vh; padding:30px 16px 40px; background:linear-gradient(to right, rgba(0,0,0,0.92) 50%, rgba(0,0,0,0.7) 80%, transparent 100%); }
  .profile-title { font-size:25px; font-weight:700; color:#fff; margin-bottom:32px; text-align:center; width:100%; }
  .profile-group { display:flex; flex-direction:column; align-items:center; justify-content:center; flex:1; width:100%; }
  .profiles-container { display:flex; flex-direction:column; align-items:center; gap:24px; width:100%; }
  .profile-item { display:flex; flex-direction:column; align-items:center; width:110px; cursor:pointer; }
  .profile-btn { width:72px; height:72px; border-radius:50%; display:flex; justify-content:center; align-items:center; border:3px solid transparent; margin-bottom:8px; transition:all 250ms; outline:none; background-color:#1a1a1a; }
  .profile-btn.main-profile { background-color:#e50914; }
  .profile-btn.focused { border-color:#e1001e; transform:scale(1.1); box-shadow:0 0 20px #e1001e; }
  .profile-btn img { width:100%; height:100%; border-radius:50%; object-fit:cover; }
  .profile-name { color:#fff; font-size:18px; font-weight:500; text-align:center; }
  .main-tag { display:block; font-size:14px; color:#e6dc53; margin-top:4px; }
  .add-profile-btn { width:72px; height:72px; border-radius:50%; background-color:#333; display:flex; justify-content:center; align-items:center; border:3px solid transparent; margin-bottom:8px; transition:all 250ms; outline:none; }
  .add-profile-btn.focused { border-color:#e1001e; transform:scale(1.1); box-shadow:0 0 20px #e1001e; }
  .add-profile-btn span { color:#fff; font-size:42px; font-weight:400; margin-bottom:auto; }
  .version-badge { font-size:12px; color:rgba(255,255,255,0.3); letter-spacing:0.5px; margin-bottom:10px; text-align:center; }
  .build-type { font-size:10px; font-weight:700; letter-spacing:1px; padding:1px 6px; border-radius:10px; vertical-align:middle; }
  .build-type--beta { background:#1a73e8; color:#fff; }
  .build-type--internal { background:#555; color:#fff; }
  .logout-btn { margin-top:auto; padding:10px 30px; border-radius:20px; background-color:rgba(229,9,20,0.8); border:3px solid transparent; color:#fff; font-size:16px; font-weight:bold; cursor:pointer; transition:all 0.2s; outline:none; }
  .logout-btn.focused { border:3px solid #fff; transform:scale(1.05); box-shadow:0 0 15px rgba(229,9,20,0.8); }
  .logout-confirm-overlay { position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(0,0,0,0.85); display:flex; justify-content:center; align-items:center; z-index:9999; }
  .logout-confirm-box { background:#1a1a1a; padding:30px 40px; border-radius:15px; border:2px solid #333; text-align:center; }
  .logout-confirm-box h2 { color:#e50914; margin-bottom:10px; font-size:24px; font-weight:700; }
  .logout-confirm-box p { font-size:18px; margin-bottom:25px; }
  .confirm-actions { display:flex; gap:20px; justify-content:center; }
  .confirm-btn { padding:12px 30px; border-radius:8px; font-size:18px; font-weight:bold; cursor:pointer; background:#333; border:3px solid transparent; transition:all 0.2s; outline:none; }
  .confirm-btn.focused { border-color:#fff; background:#e50914; transform:scale(1.05); }
</style>
