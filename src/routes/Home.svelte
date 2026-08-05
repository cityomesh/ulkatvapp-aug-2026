<!-- Home.svelte (Favorites replace EPG in fullscreen - No dropdown) -->
<script>
  import { onMount, onDestroy, tick } from "svelte";
  import { API_HOST } from "../lib/constants.js";
  import { fetchChannels, fetchCategories, fetchLanguages, fetchSubscribedChannels } from "../lib/api.js";
  import { push } from "svelte-spa-router";
  import {
    allChannels,
    categories,
    languages,
    filteredChannels,
    selectedCat,
    selectedLang,
    activeSection,
    focusedIdx,
    playingChannel,
    statusMsg,
    favorites,
  } from "../stores/appStore.js";
  import SidebarColumn from "../components/SidebarColumn.svelte";
  import ChannelList from "../components/ChannelList.svelte";
  import VideoPlayer from "../components/VideoPlayer.svelte";

  let catScrollEl, langScrollEl, chanScrollEl;
  let videoContainerEl;
  let isFullscreen = false;
  let epgVisible = true;
  let epgTimer = null;
  let channelNumberInput = "";
  let showChannelNumberInput = false;
  let channelNumberTimeout = null;
  let isSystemPoweredOn = true;
  let epgCache = {};
  let currentProgram = null;
  let upcomingPrograms = [];
  let isLoadingEpg = false;
  let epgUpdateInterval = null;
  let displayChannelNum = null;

  import { writable } from "svelte/store";
  export const interactionTick = writable(0);
  function incrementInteractionTick() { interactionTick.update(n => n + 1); }

  let overlayFocusedIdx = -1;
  const audioLanguages = ['English', 'Hindi', 'Tamil', 'Telugu', 'Kannada', 'Malayalam'];
  let focusedLangIdx = 0;
  export const audioLanguage = writable('English');

  let isInitialLoad = true;
  let isAutoFullscreen = false;
  let fullscreenLock = false;
  let autoFullscreenRequested = false;

  // ─── FAVORITES MODAL STATE (for viewing) ─────────────────────
  let favoritesModalOpen = false;
  let favoritesModalFocusedIdx = 0;

  const allButtons = [
    { label: 'Fullscreen', iconPath: '/images/appstore/ottapps/fullscreen.png', action: 0 },
    { label: 'Favorite', iconPath: '/images/appstore/ottapps/favariote.png', action: 1 },
    { label: 'Record', iconPath: '/images/appstore/ottapps/recard.png', action: 2 },
    { label: 'Audio', iconPath: '/images/appstore/ottapps/audio.png', action: 3 },
  ];
  $: visibleButtons = isFullscreen ? allButtons.slice(1) : allButtons;

  $: previewChannel = $activeSection === "channels" ? ($filteredChannels[$focusedIdx] ?? null) : null;
  $: epgChannel = isFullscreen ? $playingChannel : (previewChannel || $playingChannel);
  $: updateFocusedEpg(epgChannel);

  let channelsExpanded = true;

  // ─── REACTIVE: is current channel favorited? ──────────────
  $: isFav = $playingChannel && $favorites.some(f => f.id === $playingChannel.id);

  function resetEpgTimer() {
    if (epgTimer) clearTimeout(epgTimer);
    epgTimer = null;
    if (isFullscreen) {
      epgVisible = true;
      epgTimer = setTimeout(() => { epgVisible = false; epgTimer = null; }, 10000);
    } else {
      epgVisible = true;
    }
  }

  $: {
    localStorage.setItem('selected_cat', $selectedCat);
    localStorage.setItem('selected_lang', $selectedLang);
  }

  let autoFullscreenPending = false;
  let autoFullscreenTimer = null;

  $: {
    if (!isInitialLoad && $playingChannel) {
      activeSection.set('channels');
      overlayFocusedIdx = -1;
    }
  }

  onMount(async () => {
    const storedFavs = localStorage.getItem('favorites');
    if (storedFavs) {
      try { favorites.set(JSON.parse(storedFavs)); } catch(e) {}
    }

    const autoFS = sessionStorage.getItem('auto_fullscreen');
    if (autoFS === 'true') {
      sessionStorage.removeItem('auto_fullscreen');
      isAutoFullscreen = true;
      autoFullscreenRequested = false;
      autoFullscreenPending = true;
    }

    statusMsg.set({ text: "Fetching categories & languages...", isError: false });
    try {
      const [cats, langs] = await Promise.all([fetchCategories(), fetchLanguages()]);
      categories.set(cats);
      languages.set(langs);
      const savedCat = localStorage.getItem('selected_cat');
      if (savedCat !== null) {
        const catIdx = parseInt(savedCat);
        if (catIdx >= 0 && catIdx < cats.length) {
          selectedCat.set(catIdx);
          if ($activeSection === 'categories') focusedIdx.set(catIdx);
        }
      }
      const savedLang = localStorage.getItem('selected_lang');
      if (savedLang !== null) {
        const langIdx = parseInt(savedLang);
        if (langIdx >= 0 && langIdx < langs.length) {
          selectedLang.set(langIdx);
          if ($activeSection === 'languages') focusedIdx.set(langIdx);
        }
      }
    } catch (e) {
      console.error(e);
      statusMsg.set({ text: "Error loading categories/languages", isError: true });
    }

    statusMsg.set({ text: "Fetching channels...", isError: false });
    try {
      const [allCh, subscribedCh] = await Promise.all([fetchChannels(), fetchSubscribedChannels()]);
      const subscribedIds = new Set(subscribedCh.map(ch => Number(ch.id || ch.channel_id)));
      const filtered = allCh.filter(ch => subscribedIds.has(Number(ch.id)));
      allChannels.set(filtered);
      statusMsg.set({
        text: filtered.length > 0 ? "Ready — Press OK to play" : "No subscribed channels found",
        isError: filtered.length === 0,
      });
      if (filtered.length > 0) fetchAllChannelsEPG(filtered);

      const savedChannelId = localStorage.getItem('last_channel_id');
      if (savedChannelId && filtered.length > 0) {
        const savedChannel = filtered.find(ch => ch.id === parseInt(savedChannelId) || ch.id === savedChannelId);
        if (savedChannel) {
          playingChannel.set(savedChannel);
          loadEPGForChannel(savedChannel);
          const idx = filtered.findIndex(ch => ch.id === savedChannel.id);
          if (idx !== -1) {
            focusedIdx.set(idx);
            await tick();
            scrollToFocused();
          }
          statusMsg.set({ text: `${savedChannel.channel_number} - ${savedChannel.title}`, isError: false });
        }
      }

      if (autoFullscreenPending && !autoFullscreenRequested) {
        let targetChannel = null;
        if (!$playingChannel && filtered.length > 0) {
          targetChannel = filtered[0];
          playingChannel.set(targetChannel);
        } else if ($playingChannel) {
          targetChannel = $playingChannel;
        }

        if (targetChannel) {
          await loadEPGForChannel(targetChannel);
          updateFocusedEpg(targetChannel);
          await tick();

          epgVisible = true;
          if (epgTimer) clearTimeout(epgTimer);
          epgTimer = null;

          autoFullscreenRequested = true;
          autoFullscreenPending = false;

          isAutoFullscreen = true;
          await tick();
          await new Promise(resolve => setTimeout(resolve, 50));

          if (document.fullscreenElement) {
            activeSection.set('overlay');
            overlayFocusedIdx = 0;
            resetEpgTimer();
          } else {
            if (!fullscreenRequestInProgress) {
              openFullPlayerScreen(true);
            }
          }
        }
      }

    } catch (e) {
      console.error(e);
      statusMsg.set({ text: "Error loading channels", isError: true });
    }

    window.addEventListener("keydown", handleKeyDown);
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    await scrollToFocused();

    epgUpdateInterval = setInterval(() => {
      if (epgChannel?.channel_number) {
        const chNum = parseInt(epgChannel.channel_number);
        if (epgCache[chNum] && epgCache[chNum].length > 0) {
          currentProgram = getCurrentProgram(chNum);
          upcomingPrograms = getUpcomingPrograms(chNum, 3);
        }
      }
    }, 60000);

    resetEpgTimer();

    if (!isAutoFullscreen) {
      await tick();
      activeSection.set('languages');
      const langIdx = $selectedLang !== undefined && $selectedLang !== null ? $selectedLang : 0;
      focusedIdx.set(langIdx);
      await tick();
      scrollToFocused();
    }

    isInitialLoad = false;
  });

  favorites.subscribe(val => {
    localStorage.setItem('favorites', JSON.stringify(val));
  });

  onDestroy(() => {
    window.removeEventListener("keydown", handleKeyDown);
    document.removeEventListener("fullscreenchange", handleFullscreenChange);
    if (channelNumberTimeout) clearTimeout(channelNumberTimeout);
    if (epgUpdateInterval) clearInterval(epgUpdateInterval);
    if (epgTimer) clearTimeout(epgTimer);
    if (autoFullscreenTimer) clearTimeout(autoFullscreenTimer);
  });

  async function handleFullscreenChange() {
    isFullscreen = !!document.fullscreenElement;
    if (isFullscreen) {
      isAutoFullscreen = true;
      const ch = $playingChannel;
      if (ch) {
        const idx = $allChannels.findIndex(c => c.id === ch.id);
        if (idx !== -1) focusedIdx.set(idx);
        else if ($allChannels.length > 0) focusedIdx.set(0);
        updateFocusedEpg(ch);
        activeSection.set('overlay');
        overlayFocusedIdx = 0;
      }
      resetEpgTimer();
    } else {
      isAutoFullscreen = false;
      autoFullscreenRequested = false;
      // Close favorites modal when exiting fullscreen
      favoritesModalOpen = false;
      const ch = $playingChannel;
      if (ch) {
        if (ch.category_id !== undefined && $categories.length > 0) {
          const catIdx = $categories.findIndex(c => c.id === ch.category_id);
          if (catIdx !== -1) selectedCat.set(catIdx);
        }
        if (ch.language_id !== undefined && $languages.length > 0) {
          const langIdx = $languages.findIndex(l => l.id === ch.language_id);
          if (langIdx !== -1) selectedLang.set(langIdx);
        }
        await tick();
        const idx = $filteredChannels.findIndex(c => c.id === ch.id);
        if (idx !== -1) focusedIdx.set(idx);
        else if ($filteredChannels.length > 0) focusedIdx.set(0);
      } else {
        focusedIdx.set(0);
      }
      if (epgTimer) clearTimeout(epgTimer);
      epgTimer = null;
      epgVisible = true;
      activeSection.set("channels");
      overlayFocusedIdx = -1;
      scrollToFocused();
    }
  }

  // ─── EPG Functions ────────────────────────────────────────────
  function parseDateString(dateString) { return dateString ? new Date(dateString) : new Date(0); }
  function formatTime(date) { return date ? new Date(date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true }) : "--:--"; }
  $: progressPercent = (() => {
    if (!currentProgram) return 0;
    const now = new Date();
    const start = parseDateString(currentProgram.programstart);
    const end = parseDateString(currentProgram.programend);
    const total = end - start;
    if (total <= 0) return 0;
    return Math.min(100, Math.max(0, Math.round((now - start) / total * 100)));
  })();

  async function fetchEPG(channelNumbers) {
    if (!channelNumbers || channelNumbers.length === 0) return false;
    try {
      const token = localStorage.getItem('ulka_token');
      if (!token) return false;
      const response = await fetch(`${API_HOST}/apiv2/channels/epg`, {
        method: 'POST',
        headers: { 'auth': 'auth=' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ "number": channelNumbers, "device_timezone": 5.5, "timeshift": 2 })
      });
      const data = await response.json();
      if (data.status_code === 200 && data.response_object) {
        channelNumbers.forEach(num => { epgCache[num] = []; });
        data.response_object.forEach(program => {
          const chNum = program.number;
          if (!epgCache[chNum]) epgCache[chNum] = [];
          epgCache[chNum].push(program);
        });
        for (let chNum in epgCache) {
          epgCache[chNum].sort((a, b) => parseDateString(a.programstart) - parseDateString(b.programstart));
        }
        return true;
      }
      return false;
    } catch (error) {
      console.error('[Home] EPG API error:', error);
      return false;
    }
  }

  function getCurrentProgram(channelNumber) {
    const programs = epgCache[channelNumber];
    if (!programs || programs.length === 0) return null;
    const now = new Date();
    for (let program of programs) {
      const startTime = parseDateString(program.programstart);
      const endTime = parseDateString(program.programend);
      if (now >= startTime && now <= endTime) return program;
    }
    return null;
  }

  function getUpcomingPrograms(channelNumber, limit = 3) {
    const programs = epgCache[channelNumber];
    if (!programs || programs.length === 0) return [];
    const now = new Date();
    const upcoming = [];
    for (let program of programs) {
      const startTime = parseDateString(program.programstart);
      if (startTime > now && upcoming.length < limit) upcoming.push(program);
    }
    return upcoming;
  }

  async function fetchAllChannelsEPG(channels) {
    const batchSize = 50;
    for (let i = 0; i < channels.length; i += batchSize) {
      const batch = channels.slice(i, i + batchSize);
      const numbers = batch.map(ch => parseInt(ch.channel_number));
      await fetchEPG(numbers);
      if (epgChannel?.channel_number) {
        const focused = parseInt(epgChannel.channel_number);
        if (numbers.indexOf(focused) !== -1) updateFocusedEpg(epgChannel);
      }
    }
  }

  function updateFocusedEpg(channel) {
    if (!channel || !channel.channel_number) {
      currentProgram = null;
      upcomingPrograms = [];
      displayChannelNum = null;
      isLoadingEpg = false;
      return;
    }
    const chNum = parseInt(channel.channel_number);
    displayChannelNum = chNum;
    if (epgCache[chNum] && epgCache[chNum].length > 0) {
      currentProgram = getCurrentProgram(chNum);
      upcomingPrograms = getUpcomingPrograms(chNum, 3);
      isLoadingEpg = false;
      return;
    }
    currentProgram = {
      title: 'Loading EPG...',
      programstart: new Date().toISOString(),
      programend: new Date(Date.now() + 30 * 60000).toISOString(),
      description: 'Fetching program guide...'
    };
    upcomingPrograms = [];
    isLoadingEpg = true;
    fetchEPG([chNum]).then(ok => {
      isLoadingEpg = false;
      if (ok && displayChannelNum === chNum) {
        currentProgram = getCurrentProgram(chNum);
        upcomingPrograms = getUpcomingPrograms(chNum, 3);
        if (!currentProgram) {
          currentProgram = {
            title: 'No program data',
            programstart: new Date().toISOString(),
            programend: new Date(Date.now() + 30 * 60000).toISOString(),
            description: 'No EPG information available for this channel'
          };
        }
      } else {
        currentProgram = {
          title: 'EPG unavailable',
          programstart: new Date().toISOString(),
          programend: new Date(Date.now() + 30 * 60000).toISOString(),
          description: 'Failed to load program guide'
        };
      }
    });
  }

  async function loadEPGForChannel(channel) {
    if (!channel || !channel.channel_number) return;
    const channelNumber = parseInt(channel.channel_number);
    if (epgCache[channelNumber] && epgCache[channelNumber].length > 0) return;
    isLoadingEpg = true;
    await fetchEPG([channelNumber]);
    isLoadingEpg = false;
    if (epgChannel && parseInt(epgChannel.channel_number) === channelNumber) {
      updateFocusedEpg(epgChannel);
    }
  }

  function loop(idx, len) { if (len === 0) return 0; return (idx + len) % len; }

  async function scrollToFocused() {
    await tick();
    let container = null;
    if ($activeSection === "categories") container = catScrollEl;
    else if ($activeSection === "languages") container = langScrollEl;
    else if ($activeSection === "channels") container = chanScrollEl;
    if (!container) return;
    const el = container.children[$focusedIdx];
    if (!el) return;
    const scrollTop = el.offsetTop - container.clientHeight / 2 + el.offsetHeight / 2;
    container.scrollTo({ top: scrollTop, behavior: "smooth" });
  }

  // ─── Fullscreen ──────────────────────────────────────────────────
  let fullscreenRequestInProgress = false;

  function openFullPlayerScreen(setOverlayFocus = false) {
    if (fullscreenLock || fullscreenRequestInProgress) {
      console.log("[Home] Fullscreen request already in progress, ignoring.");
      return;
    }
    if (document.fullscreenElement) {
      if (setOverlayFocus) { activeSection.set('overlay'); overlayFocusedIdx = 0; }
      resetEpgTimer();
      return;
    }

    fullscreenLock = true;
    fullscreenRequestInProgress = true;
    console.log("[Home] Fullscreen lock acquired.");

    if (!$playingChannel) {
      const fallbackChannel = $filteredChannels[$focusedIdx] ?? $filteredChannels[0];
      if (fallbackChannel) {
        playingChannel.set(fallbackChannel);
        loadEPGForChannel(fallbackChannel);
      } else {
        statusMsg.set({ text: "No channel selected", isError: true });
        fullscreenLock = false;
        fullscreenRequestInProgress = false;
        return;
      }
    }

    if (videoContainerEl && videoContainerEl.requestFullscreen) {
      videoContainerEl.requestFullscreen()
        .then(() => {
          console.log("[Home] Fullscreen request succeeded.");
          setTimeout(() => {
            fullscreenLock = false;
            fullscreenRequestInProgress = false;
          }, 1500);
        })
        .catch(err => {
          console.warn("[Home] Fullscreen request failed:", err);
          fullscreenLock = false;
          fullscreenRequestInProgress = false;
          push("/player");
        });
      if (setOverlayFocus) {
        activeSection.set('overlay');
        overlayFocusedIdx = 0;
      } else if ($activeSection !== 'overlay') {
        activeSection.set('channels');
        overlayFocusedIdx = -1;
      }
      resetEpgTimer();
    } else {
      fullscreenLock = false;
      fullscreenRequestInProgress = false;
      push("/player");
    }
  }

  // ─── FAVORITES HANDLER ──────────────────────────────────────
  function toggleFavoriteAndShowGrid() {
    if (!$playingChannel) {
      showToastMessage("Select a channel first", true);
      return;
    }

    // Toggle favorite status
    if (isFav) {
      $favorites = $favorites.filter(f => f.id !== $playingChannel.id);
      showToastMessage(`🗑️ Removed ${$playingChannel.title} from favorites`, false);
    } else {
      $favorites = [...$favorites, $playingChannel];
      showToastMessage(`⭐ Added ${$playingChannel.title} to favorites`, false);
    }

    // If in fullscreen, show/hide the favorites grid
    if (isFullscreen) {
      if ($favorites.length > 0) {
        favoritesModalOpen = true;
        favoritesModalFocusedIdx = 0;
        activeSection.set('favorites-modal');
      } else {
        favoritesModalOpen = false;
        activeSection.set('overlay');
        const favIdx = visibleButtons.findIndex(b => b.action === 1);
        overlayFocusedIdx = favIdx >= 0 ? favIdx : 0;
      }
      resetEpgTimer();
    }
  }

  function handleOverlayButton(action) {
    resetEpgTimer();
    switch (action) {
      case 0: openFullPlayerScreen(); break;
      case 1:
        // Direct toggle + show grid (no dropdown)
        toggleFavoriteAndShowGrid();
        break;
      case 2: showToastMessage("⏺️ Recording started...", false); break;
      case 3: activeSection.set('audio'); focusedLangIdx = 0; break;
      default: break;
    }
  }

  // ─── FAVORITES MODAL: select a favorite channel ──────────────
  function selectFavoriteChannel(index) {
    const channel = $favorites[index];
    if (channel) {
      favoritesModalOpen = false;
      activeSection.set('overlay');
      handleChannelActivation(channel);
    }
  }

  function closeFavoritesModal() {
    favoritesModalOpen = false;
    activeSection.set('overlay');
    const favIdx = visibleButtons.findIndex(b => b.action === 1);
    overlayFocusedIdx = favIdx >= 0 ? favIdx : 0;
    resetEpgTimer();
  }

  function selectLanguage(index) {
    const lang = audioLanguages[index];
    audioLanguage.set(lang);
    showToastMessage(`🔊 Audio language: ${lang}`, false);
    activeSection.set('overlay');
    const audioIdx = visibleButtons.findIndex(b => b.action === 3);
    overlayFocusedIdx = audioIdx >= 0 ? audioIdx : 0;
    resetEpgTimer();
  }

  function clearChannelNumberTimeout() {
    if (channelNumberTimeout) { clearTimeout(channelNumberTimeout); channelNumberTimeout = null; }
  }

  function switchToChannelByNumber(channelNumber) {
    const list = isFullscreen ? $allChannels : $filteredChannels;
    const channel = list.find(ch => parseInt(ch.channel_number) === parseInt(channelNumber));
    if (channel) {
      const index = list.findIndex(ch => parseInt(ch.channel_number) === parseInt(channelNumber));
      if (index !== -1) {
        focusedIdx.set(index);
        playingChannel.set(channel);
        localStorage.setItem('last_channel_id', channel.id);
        statusMsg.set({ text: `${channel.channel_number}- ${channel.title}`, isError: false });
        loadEPGForChannel(channel);
        channelNumberInput = "";
        showChannelNumberInput = false;
        clearChannelNumberTimeout();
        resetEpgTimer();
        return true;
      }
    } else {
      statusMsg.set({ text: `Channel ${channelNumber} not found`, isError: true });
      setTimeout(() => {
        if ($statusMsg?.text === `Channel ${channelNumber} not found`) {
          statusMsg.set({ text: "Ready — Press OK to play", isError: false });
        }
      }, 2000);
      channelNumberInput = "";
      showChannelNumberInput = false;
      clearChannelNumberTimeout();
    }
    return false;
  }

  function handleNumberInput(number) {
    clearChannelNumberTimeout();
    showChannelNumberInput = true;
    channelNumberInput += number;
    if (channelNumberInput.length > 3) channelNumberInput = channelNumberInput.slice(0, 3);
    channelNumberTimeout = setTimeout(() => {
      if (channelNumberInput.length > 0) switchToChannelByNumber(channelNumberInput);
    }, 1500);
    resetEpgTimer();
  }

  function showToastMessage(msg, isError = false) {
    statusMsg.set({ text: msg, isError });
    setTimeout(() => {
      if ($statusMsg?.text === msg) {
        statusMsg.set({ text: "Ready — Press OK to play", isError: false });
      }
    }, 2000);
  }

  function channelUp() {
    const list = isFullscreen ? $allChannels : $filteredChannels;
    const len = list.length;
    if (len === 0) return;
    let newIdx = $focusedIdx + 1;
    if (newIdx >= len) { return; }
    focusedIdx.set(newIdx);
    if (!isFullscreen) scrollToFocused();
    const ch = list[newIdx];
    if (ch) {
      showToastMessage(`${ch.channel_number} - ${ch.title}`, false);
      if ($playingChannel) {
        playingChannel.set(ch);
        localStorage.setItem('last_channel_id', ch.id);
        loadEPGForChannel(ch);
        incrementInteractionTick();
      }
    }
    resetEpgTimer();
  }

  function channelDown() {
    const list = isFullscreen ? $allChannels : $filteredChannels;
    const len = list.length;
    if (len === 0) return;
    let newIdx = $focusedIdx - 1;
    if (newIdx < 0) { return; }
    focusedIdx.set(newIdx);
    if (!isFullscreen) scrollToFocused();
    const ch = list[newIdx];
    if (ch) {
      showToastMessage(`${ch.channel_number} - ${ch.title}`, false);
      if ($playingChannel) {
        playingChannel.set(ch);
        localStorage.setItem('last_channel_id', ch.id);
        loadEPGForChannel(ch);
        incrementInteractionTick();
      }
    }
    resetEpgTimer();
  }

  function handlePower() { showToastMessage("📴 Powering OFF...", false); }
  function openApp(url) { if (url) window.open(url, '_blank'); else showToastMessage("App not configured", true); }
  function callNativePowerOff() { /* ... */ }
  function callNativePowerOn() { /* ... */ }

  function handleChannelActivation(channel) {
    if (!channel) return;
    // Close favorites modal if open
    favoritesModalOpen = false;
    if ($playingChannel && $playingChannel.id === channel.id) {
      openFullPlayerScreen();
    } else {
      playingChannel.set(channel);
      localStorage.setItem('last_channel_id', channel.id);
      loadEPGForChannel(channel);
      statusMsg.set({ text: `${channel.channel_number} - ${channel.title}`, isError: false });
      activeSection.set('channels');
      overlayFocusedIdx = -1;
      resetEpgTimer();
      setTimeout(() => {
        if ($statusMsg?.text === `${channel.channel_number}: ${channel.title}`) {
          statusMsg.set({ text: "Ready — Press OK to play", isError: false });
        }
      }, 1500);
    }
  }

  // ─── Keyboard handler ─────────────────────────────────────────
  function handleKeyDown(e) {
    if (autoFullscreenPending) { clearTimeout(autoFullscreenTimer); autoFullscreenPending = false; }
    const keyCode = e.keyCode || e.which;
    const key = e.key;
    incrementInteractionTick();
    resetEpgTimer();

    if (keyCode === 33) { e.preventDefault(); channelUp(); return; }
    if (keyCode === 34) { e.preventDefault(); channelDown(); return; }

    // ─── FAVORITES MODAL NAVIGATION ─────────────────────────────
    if (favoritesModalOpen && $activeSection === 'favorites-modal') {
      const len = $favorites.length;
      if (key === "ArrowRight") {
        e.preventDefault();
        favoritesModalFocusedIdx = (favoritesModalFocusedIdx + 1) % len;
        return;
      }
      if (key === "ArrowLeft") {
        e.preventDefault();
        favoritesModalFocusedIdx = (favoritesModalFocusedIdx - 1 + len) % len;
        return;
      }
      if (key === "ArrowUp" || key === "ArrowDown") {
        e.preventDefault();
        return;
      }
      if (key === "Enter" || keyCode === 13) {
        e.preventDefault();
        selectFavoriteChannel(favoritesModalFocusedIdx);
        return;
      }
      if (key === "Escape" || key === "Backspace" || keyCode === 8 || keyCode === 27) {
        e.preventDefault();
        closeFavoritesModal();
        return;
      }
      e.preventDefault();
      return;
    }

    if (key === "Escape" || key === "Backspace" || keyCode === 8 || keyCode === 27) {
      e.preventDefault();
      if (document.fullscreenElement) {
        // If favorites modal is open in fullscreen, close it first
        if (favoritesModalOpen) {
          closeFavoritesModal();
          return;
        }
        document.exitFullscreen().catch(err => console.warn("Exit fullscreen error", err));
        activeSection.set("channels");
        overlayFocusedIdx = -1;
        scrollToFocused();
        return;
      }
      if (showChannelNumberInput) {
        channelNumberInput = "";
        showChannelNumberInput = false;
        clearChannelNumberTimeout();
        return;
      }
      if ($activeSection === "audio") {
        activeSection.set('overlay');
        const audioIdx = visibleButtons.findIndex(b => b.action === 3);
        overlayFocusedIdx = audioIdx >= 0 ? audioIdx : 0;
        return;
      }
      if ($activeSection === "overlay") {
        activeSection.set("channels");
        overlayFocusedIdx = -1;
        scrollToFocused();
        return;
      }
      else if ($activeSection === "channels") {
        push("/exit");
      }
      else if ($activeSection === "languages") {
        activeSection.set("categories");
        focusedIdx.set($selectedCat);
      } else if ($activeSection === "categories") {
        push("/exit");
      }
      scrollToFocused();
      return;
    }

    if (keyCode === 19) { e.preventDefault(); showToastMessage("📺 EPG Guide", false); return; }

    if (/^[0-9]$/.test(key)) { e.preventDefault(); handleNumberInput(key); return; }
    if (keyCode >= 96 && keyCode <= 105) { e.preventDefault(); const num = String(keyCode - 96); handleNumberInput(num); return; }
    if ((key === "Enter" || keyCode === 13) && showChannelNumberInput && channelNumberInput.length > 0) {
      e.preventDefault();
      clearChannelNumberTimeout();
      switchToChannelByNumber(channelNumberInput);
      return;
    }

    if (keyCode === 152) { e.preventDefault(); if (isSystemPoweredOn) { callNativePowerOff(); isSystemPoweredOn = false; } else { callNativePowerOn(); isSystemPoweredOn = true; } return; }
    if (keyCode === 403) { showToastMessage("🔴 Red button pressed"); return; }
    if (keyCode === 404) { showToastMessage("🟢 Green button pressed"); return; }
    if (keyCode === 405) { showToastMessage("🟡 Yellow button pressed"); return; }
    if (keyCode === 406) { showToastMessage("🔵 Blue button pressed"); return; }
    if (keyCode === 226) { openApp("https://www.netflix.com/tv"); return; }
    if (keyCode === 227) { openApp("https://www.primevideo.com"); return; }
    if (keyCode === 228) { openApp("https://www.hotstar.com"); return; }
    if (keyCode === 20) { showToastMessage("📡 Live TV"); return; }
    if (keyCode === 14) { showToastMessage("⚙️ Setup"); return; }
    if (keyCode === 36) { showToastMessage("☰ Menu"); return; }
    if (keyCode === 16) { showToastMessage("⭐ Favorites"); return; }
    if (keyCode === 15) { window.location.href = "/launcher/index.html"; return; }

    if (keyCode === 35) { showToastMessage("End"); return; }
    if (keyCode === 45) { showToastMessage("Insert"); return; }
    if (keyCode === 46) { showToastMessage("Delete"); return; }
    if (keyCode >= 112 && keyCode <= 123) { showToastMessage(`F${keyCode - 111} pressed`); return; }
    if (keyCode >= 65 && keyCode <= 90) { showToastMessage(key); return; }
    const punctMap = { 186: ";", 187: "=", 188: ",", 189: "-", 190: ".", 191: "/", 192: "`", 219: "[", 220: "\\", 221: "]", 222: "'" };
    if (punctMap[keyCode]) { showToastMessage(punctMap[keyCode]); return; }

    if ($activeSection === "audio") {
      if (key === "ArrowUp") { e.preventDefault(); focusedLangIdx = (focusedLangIdx - 1 + audioLanguages.length) % audioLanguages.length; return; }
      if (key === "ArrowDown") { e.preventDefault(); focusedLangIdx = (focusedLangIdx + 1) % audioLanguages.length; return; }
      if (key === "Enter" || keyCode === 13) { e.preventDefault(); selectLanguage(focusedLangIdx); return; }
      if (key === "ArrowLeft" || key === "ArrowRight") { e.preventDefault(); activeSection.set('overlay'); const audioIdx = visibleButtons.findIndex(b => b.action === 3); overlayFocusedIdx = audioIdx >= 0 ? audioIdx : 0; return; }
    }

    if ($activeSection === "overlay") {
      const visLen = visibleButtons.length;
      if (key === "ArrowUp") { e.preventDefault(); activeSection.set("channels"); overlayFocusedIdx = -1; channelUp(); scrollToFocused(); return; }
      if (key === "ArrowDown") { e.preventDefault(); activeSection.set("channels"); overlayFocusedIdx = -1; channelDown(); scrollToFocused(); return; }
      if (key === "ArrowLeft") { e.preventDefault(); if (overlayFocusedIdx === 0) { activeSection.set("channels"); overlayFocusedIdx = -1; scrollToFocused(); } else { overlayFocusedIdx = (overlayFocusedIdx - 1 + visLen) % visLen; } return; }
      if (key === "ArrowRight") { e.preventDefault(); overlayFocusedIdx = (overlayFocusedIdx + 1) % visLen; return; }
      if (key === "Enter" || keyCode === 13) { e.preventDefault(); const btn = visibleButtons[overlayFocusedIdx]; if (btn) handleOverlayButton(btn.action); return; }
    }

    if (key.startsWith("Arrow")) e.preventDefault();

    const catLen = $categories.length;
    const langLen = $languages.length;
    const chanLen = $filteredChannels.length;

    if ($activeSection === "categories") {
      if (key === "ArrowDown") { focusedIdx.update((i) => loop(i + 1, catLen)); scrollToFocused(); }
      else if (key === "ArrowUp") { focusedIdx.update((i) => loop(i - 1, catLen)); scrollToFocused(); }
      else if (key === "ArrowRight") { activeSection.set("languages"); focusedIdx.set($selectedLang); scrollToFocused(); }
      else if (key === "Enter" || keyCode === 13) { selectedCat.set($focusedIdx); scrollToFocused(); }
    } else if ($activeSection === "languages") {
      if (key === "ArrowDown") { focusedIdx.update((i) => loop(i + 1, langLen)); scrollToFocused(); }
      else if (key === "ArrowUp") { focusedIdx.update((i) => loop(i - 1, langLen)); scrollToFocused(); }
      else if (key === "ArrowLeft") { activeSection.set("categories"); focusedIdx.set($selectedCat); scrollToFocused(); }
      else if (key === "ArrowRight" && chanLen > 0) { activeSection.set("channels"); focusedIdx.set(0); scrollToFocused(); }
      else if (key === "Enter" || keyCode === 13) { selectedLang.set($focusedIdx); scrollToFocused(); }
    } else if ($activeSection === "channels") {
      if (chanLen === 0) return;
      if (key === "ArrowDown") {
        if (isFullscreen) { channelUp(); } else { focusedIdx.update((i) => loop(i + 1, chanLen)); scrollToFocused(); }
        return;
      }
      if (key === "ArrowUp") {
        if (isFullscreen) { channelDown(); } else { focusedIdx.update((i) => loop(i - 1, chanLen)); scrollToFocused(); }
        return;
      }
      if (key === "ArrowLeft") { activeSection.set("languages"); focusedIdx.set($selectedLang); scrollToFocused(); }
      else if (key === "ArrowRight") { if ($playingChannel) { activeSection.set("overlay"); overlayFocusedIdx = 0; } else { showToastMessage("Select a channel first", false); } return; }
      else if (key === "Enter" || keyCode === 13) { const selectedChannel = $filteredChannels[$focusedIdx]; if (selectedChannel) handleChannelActivation(selectedChannel); }
    }

    const remoteKeys = [
      "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Escape", "Backspace", "Enter",
      33, 34, 35, 36, 45, 46, 19, 20, 14, 16,
      112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 122, 123,
      65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90,
      186, 187, 188, 189, 190, 191, 192, 219, 220, 221, 222
    ];
    if (remoteKeys.includes(keyCode) || remoteKeys.includes(key)) { e.preventDefault(); }
  }
</script>

<!-- ─── TEMPLATE ────────────────────────────────────────────────── -->
<div class="screen-wrapper">
  <div class="container" class:auto-fullscreen={isAutoFullscreen}>
    {#if !isAutoFullscreen}
      <div class="left-panel">
        <SidebarColumn title="LANGUAGES" variant="categories-column" bind:scrollEl={catScrollEl}>
          {#each $categories as cat, i}
            <div class="sidebar-item" class:focused={$activeSection === "categories" && $focusedIdx === i} class:selected={$selectedCat === i}>{cat.name}</div>
          {/each}
        </SidebarColumn>
        <SidebarColumn title="CATEGORIES" variant="languages-column" bind:scrollEl={langScrollEl}>
          {#each $languages as lang, i}
            <div class="sidebar-item" class:focused={$activeSection === "languages" && $focusedIdx === i} class:selected={$selectedLang === i}>{lang.name}</div>
          {/each}
        </SidebarColumn>
        <SidebarColumn title="CHANNELS" count={$filteredChannels.length} variant="channels-column" bind:scrollEl={chanScrollEl}>
          <svelte:fragment slot="header-extra">
            <button class="expand-toggle" on:click={() => channelsExpanded = !channelsExpanded}>{channelsExpanded ? '▲' : '▼'}</button>
          </svelte:fragment>
          {#if channelsExpanded}<ChannelList onChannelClick={handleChannelActivation} />{/if}
        </SidebarColumn>
      </div>
    {/if}

    <div class="right-panel" class:fullscreen-mode={isAutoFullscreen || isFullscreen}>
      {#if !isAutoFullscreen}
        <div class="animated-header">
          <div class="scrolling-text">PREMIUM LIVE TV • USE ARROWS TO NAVIGATE • PRESS OK TO PLAY • ENJOY THE SHOW ✦ PREMIUM LIVE TV • USE ARROWS TO NAVIGATE • PRESS OK TO PLAY • ENJOY THE SHOW ✦</div>
        </div>
      {/if}

      <div class="player-wrapper" class:auto-fullscreen={isAutoFullscreen} class:focused={$activeSection === "player"}>
        <div class="video-container" bind:this={videoContainerEl} class:auto-fullscreen={isAutoFullscreen}>
          <VideoPlayer channel={$playingChannel} interactionTick={interactionTick} audioLanguage={$audioLanguage} />

          {#if !$playingChannel}
            <div class="placeholder-content">
              {#if previewChannel?.icon_url}<img src={previewChannel.icon_url} alt="" class="placeholder-icon" />{:else}<div style="font-size:48px;color:#00D1FF">📺</div>{/if}
              <div class="placeholder-title">PRESS OK ▶</div>
            </div>
          {/if}

          {#if $playingChannel && epgChannel && epgVisible}
            <!-- ═══ EPG OVERLAY (shown only when favorites modal is NOT open) ═══ -->
            {#if !favoritesModalOpen}
              <div class="epg-overlay" class:fullscreen={isFullscreen}>
                <div class="epg-content">
                  <div class="epg-info">
                    <div class="epg-channel-badge">
                      <span class="epg-channel-number">{epgChannel.channel_number}</span>
                      <span class="epg-channel-name">{epgChannel.title}</span>
                    </div>
                    {#if isLoadingEpg}
                      <div class="epg-loading">⏳ Loading EPG…</div>
                    {:else if currentProgram}
                      <div class="epg-program-row"><span class="epg-now-label">NOW</span><span class="epg-program-title">{currentProgram.title || 'Untitled'}</span></div>
                      <div class="epg-progress-row">
                        <span class="epg-time-start">{formatTime(currentProgram.programstart)}</span>
                        <div class="epg-progress-track"><div class="epg-progress-fill" style="width:{progressPercent}%"></div></div>
                        <span class="epg-time-end">{formatTime(currentProgram.programend)}</span>
                        <span class="epg-pct">{progressPercent}%</span>
                      </div>
                      {#if currentProgram.description}<div class="epg-description">{currentProgram.description}</div>{/if}
                    {:else}
                      <div class="epg-no-data">📡 No program information available</div>
                    {/if}
                  </div>
                  <hr class="epg-separator" />

                  <div class="epg-buttons">
                    {#each visibleButtons as btn, idx}
                      <div class="epg-button" class:focused={$activeSection === 'overlay' && overlayFocusedIdx === idx} on:click={() => handleOverlayButton(btn.action)} on:keydown={(e) => (e.key === 'Enter' || e.key === ' ') && handleOverlayButton(btn.action)} tabindex="0" role="button">
                        <img src={btn.iconPath} alt={btn.label} class="epg-button-icon-img" class:fullscreen-img={btn.action === 0} />
                        <span class="epg-button-label">{btn.label}</span>
                        {#if btn.action === 1 && isFav}
                          <span class="fav-star">★</span>
                        {/if}
                      </div>
                    {/each}
                  </div>

                  {#if isFullscreen}
                    <div class="epg-upcoming">
                      {#if isLoadingEpg}
                        <div class="epg-upcoming-item no-upcoming">Loading upcoming…</div>
                      {:else if upcomingPrograms.length > 0}
                        {#each upcomingPrograms.slice(0, 3) as prog, idx}
                          <div class="epg-upcoming-item">
                            <span class="epg-upcoming-time">{formatTime(prog.programstart)}</span>
                            <span class="epg-upcoming-title">{prog.title || 'Untitled'}</span>
                          </div>
                        {/each}
                      {:else}
                        <div class="epg-upcoming-item no-upcoming">No upcoming programs</div>
                      {/if}
                    </div>
                  {/if}
                </div>
              </div>
            {/if}

            <!-- ═══ FAVORITES GRID – REPLACES EPG IN FULLSCREEN ═══ -->
            {#if favoritesModalOpen && isFullscreen && $favorites.length > 0}
              <div class="epg-overlay fullscreen favorites-grid-replacement">
                <div class="epg-content">
                  <div class="favorites-grid-header-fullscreen">
                    ⭐ YOUR FAVORITES <span class="fav-count">({$favorites.length})</span>
                  </div>
                  <div class="favorites-grid-scroll-fullscreen">
                    {#each $favorites as channel, i}
                      <div
                        class="fav-grid-item-fullscreen"
                        class:focused={favoritesModalFocusedIdx === i}
                        on:click={() => selectFavoriteChannel(i)}
                        on:keydown={(e) => (e.key === 'Enter' || e.key === ' ') && selectFavoriteChannel(i)}
                        tabindex="0"
                        role="button"
                      >
                        {#if channel.icon_url}
                          <img src={channel.icon_url} alt={channel.title} class="fav-grid-icon-fullscreen" loading="lazy" />
                        {:else}
                          <div class="fav-grid-placeholder-fullscreen">{channel.channel_number}</div>
                        {/if}
                        <span class="fav-grid-number-fullscreen">{channel.channel_number}</span>
                      </div>
                    {/each}
                  </div>
                  <div class="epg-buttons" style="margin-top:4px;">
                    <div class="epg-button" style="border-color:rgba(255,215,0,0.3); background:transparent; color:#aaa; font-size:12px; padding:4px 12px; pointer-events:none;">
                      ◄ ► navigate • OK play • BACK close
                    </div>
                  </div>
                </div>
              </div>
            {/if}
          {/if}

          {#if $activeSection === 'audio' && $playingChannel}
            <div class="language-overlay">
              <div class="language-box">
                <div class="language-title">SELECT AUDIO LANGUAGE</div>
                <div class="language-list">
                  {#each audioLanguages as lang, i}
                    <div class="language-item" class:focused={focusedLangIdx === i} on:click={() => selectLanguage(i)} on:keydown={(e) => (e.key === 'Enter' || e.key === ' ') && selectLanguage(i)} tabindex="0" role="button">{lang}</div>
                  {/each}
                </div>
                <div class="language-hint">▲▼ navigate • OK select • BACK cancel</div>
              </div>
            </div>
          {/if}

          {#if showChannelNumberInput}
            <div class="channel-number-overlay">
              <div class="channel-number-box">
                <span class="channel-prefix">CH</span>
                <span class="channel-digits">{channelNumberInput || "---"}</span>
              </div>
            </div>
          {/if}
        </div>
      </div>

      {#if !isAutoFullscreen && !isFullscreen}
        <div class="epg-grid">
          {#each [0,1,2] as idx}
            <div class="epg-column">
              <div class="program-card upcoming">
                <div class="card-label-up">UPCOMING</div>
                <div class="card-uptime">{#if isLoadingEpg}Loading…{:else if upcomingPrograms[idx]}{formatTime(upcomingPrograms[idx].programstart)} – {formatTime(upcomingPrograms[idx].programend)}{:else}--:-- – --:--{/if}</div>
                <div class="card-title">{#if isLoadingEpg}⏳{:else if upcomingPrograms[idx]}{upcomingPrograms[idx].title || 'Untitled'}{:else}No upcoming info{/if}</div>
                {#if !isLoadingEpg && upcomingPrograms[idx]?.description}<div class="card-desc full-desc">{upcomingPrograms[idx].description}</div>{/if}
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  /* ─── All existing styles ─────────────────────────────────────── */
  .screen-wrapper { width: 100vw; height: 100vh; overflow: hidden; background: #0b0d0e; }
  .container { display: flex; height: 100vh; gap: 12px; padding: 12px; box-sizing: border-box; background: #0b0d0e; }
  .container.auto-fullscreen { gap: 0; padding: 0; background: #000; }
  .left-panel { flex: 0 0 320px; display: flex; gap: 8px; min-height: 0; }
  .right-panel { flex: 1; display: flex; flex-direction: column; min-width: 0; }
  .right-panel.fullscreen-mode { flex: 1 1 100%; width: 100%; max-width: 100%; }
  .player-wrapper { flex: none; width: 100%; position: relative; display: flex; flex-direction: column; background: #0b0d0e; border-radius: 12px; overflow: hidden; border: 1px solid #222; margin-bottom: 8px; }
  .player-wrapper.auto-fullscreen { border: none; border-radius: 0; margin: 0; flex: 1; background: #000; }
  .player-wrapper.auto-fullscreen .video-container { padding-bottom: 0; height: 100%; }
  .video-container { position: relative; width: 100%; padding-bottom: 56.26%; background: #0b0d0e; overflow: hidden; }
  .video-container.auto-fullscreen { padding-bottom: 0; height: 100%; }
  .video-container :global(.video-player) { position: absolute; top: 0; left: 0; width: 100%; height: 100%; }
  .placeholder-content { position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; background: radial-gradient(circle at center, #14181c, #0a0c0e); }
  .placeholder-icon { border-radius: 10px; margin-bottom: 10px; box-shadow: 0 0 30px rgba(0, 209, 255, 0.15); }
  .placeholder-title { font-size: 18px; font-weight: 700; color: #eee; letter-spacing: 3px; text-shadow: 0 0 20px rgba(0, 209, 255, 0.3); }

  /* ─── EPG Overlay ────────────────────────────────────────────── */
  .epg-overlay { position: absolute; bottom: 0; left: 0; right: 0; padding: 20px 20px 14px 20px; background: linear-gradient(to top, rgba(0, 0, 0, 0.92) 0%, rgba(0, 0, 0, 0.6) 50%, transparent 100%); pointer-events: none; transition: background 0.3s, border 0.3s, border-radius 0.3s; z-index: 100; }
  .epg-overlay.fullscreen { background: rgba(0, 0, 0, 0.88) !important; border: 2px solid #ffd700; border-radius: 14px; margin: 0 10px 10px 10px; padding: 16px 18px 12px 18px; backdrop-filter: blur(8px); box-shadow: 0 0 30px rgba(0, 0, 0, 0.8); z-index: 101; }
  .epg-content { display: flex; flex-direction: column; gap: 6px; pointer-events: auto; position: relative; }
  .epg-info { display: flex; flex-direction: column; gap: 3px; }
  .epg-buttons { display: flex; flex-direction: row; gap: 8px; flex-wrap: wrap; align-items: center; }
  .epg-button { display: flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 8px; background: rgba(0, 0, 0, 0.4); border: 2px solid transparent; color: #ccc; font-size: 14px; font-weight: 600; cursor: pointer; transition: all 0.2s ease; backdrop-filter: blur(4px); outline: none; pointer-events: auto; justify-content: center; white-space: nowrap; position: relative; }
  .epg-button.focused { border-color: #ffd700; background: rgba(255, 215, 0, 0.2); color: #fff; box-shadow: 0 0 20px rgba(255, 215, 0, 0.3); transform: scale(1.02); }
  .epg-button-icon-img { width: 24px; height: 24px; object-fit: contain; }
  .epg-button-icon-img.fullscreen-img { border-radius: 4px; box-shadow: 0 0 12px rgba(240, 239, 233, 0.6); }
  .epg-button-label { font-size: 13px; letter-spacing: 0.5px; }
  .fav-star { color: #ffd700; font-size: 16px; margin-left: 2px; text-shadow: 0 0 8px rgba(255, 215, 0, 0.6); }
  .epg-separator { border: none; border-top: 1px solid rgba(255, 215, 0, 0.3); margin: 4px 0 2px 0; pointer-events: none; }
  .epg-channel-badge { display: flex; align-items: center; gap: 10px; margin-bottom: 2px; }
  .epg-channel-number { font-size: 22px; font-weight: 900; color: #ffd700; background: rgba(0, 0, 0, 0.5); padding: 0 10px; border-radius: 6px; letter-spacing: 0.5px; border: 1px solid rgba(255, 215, 0, 0.3); font-family: monospace; line-height: 1.4; }
  .epg-channel-name { font-size: 18px; font-weight: 700; color: #fff; text-shadow: 0 2px 8px rgba(0, 0, 0, 0.8); letter-spacing: 0.5px; }
  .epg-program-row { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
  .epg-now-label { font-size: 11px; font-weight: 800; text-transform: uppercase; color: #ff5555; background: rgba(255, 85, 85, 0.15); padding: 1px 10px; border-radius: 12px; border: 1px solid rgba(255, 85, 85, 0.25); letter-spacing: 0.8px; flex-shrink: 0; }
  .epg-program-title { font-size: 16px; font-weight: 600; color: #f0f0f0; text-shadow: 0 2px 8px rgba(0, 0, 0, 0.8); line-height: 1.3; }
  .epg-progress-row { display: flex; align-items: center; gap: 10px; margin-top: 2px; }
  .epg-time-start, .epg-time-end { font-size: 12px; font-weight: 500; color: #bbb; font-family: monospace; flex-shrink: 0; text-shadow: 0 1px 4px rgba(0, 0, 0, 0.6); }
  .epg-progress-track { flex: 1; height: 4px; background: rgba(255, 255, 255, 0.2); border-radius: 4px; overflow: hidden; min-width: 40px; }
  .epg-progress-fill { height: 100%; background: linear-gradient(90deg, #e83535, #ff6b6b); border-radius: 4px; transition: width 0.5s ease; }
  .epg-pct { font-size: 12px; font-weight: 700; color: #ff6b6b; flex-shrink: 0; min-width: 36px; text-align: right; text-shadow: 0 1px 4px rgba(0, 0, 0, 0.6); }
  .epg-description { font-size: 13px; font-weight: 400; color: #ccc; text-shadow: 0 2px 6px rgba(0, 0, 0, 0.9); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 1px; max-width: 90%; }
  .epg-loading, .epg-no-data { color: #ffd700; font-size: 14px; font-weight: 500; padding: 4px 0; text-shadow: 0 2px 6px rgba(0, 0, 0, 0.9); }
  .epg-upcoming { display: flex; flex-direction: row; gap: 10px; margin-top: 2px; flex-wrap: wrap; pointer-events: auto; }
  .epg-upcoming-item { display: flex; align-items: center; gap: 8px; padding: 6px 12px; background: rgba(0, 0, 0, 0.5); border: 1px solid #555; border-radius: 8px; font-size: 13px; color: #ccc; white-space: nowrap; flex: 1 1 auto; min-width: 120px; transition: border-color 0.2s; }
  .epg-upcoming-item:hover { border-color: #ffd700; }
  .epg-upcoming-time { font-weight: 600; color: #ffd700; font-family: monospace; }
  .epg-upcoming-title { color: #eee; font-weight: 500; }
  .epg-upcoming-item.no-upcoming { color: #888; font-style: italic; justify-content: center; border-color: #444; flex: 1; }

  /* ─── Language Overlay ────────────────────────────────────────── */
  .language-overlay { position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0, 0, 0, 0.7); backdrop-filter: blur(8px); display: flex; align-items: center; justify-content: center; pointer-events: auto; z-index: 10; }
  .language-box { background: #1a1e22; border: 2px solid #ffd700; border-radius: 16px; padding: 30px 40px; min-width: 280px; max-width: 400px; box-shadow: 0 0 40px rgba(0, 0, 0, 0.8); }
  .language-title { font-size: 18px; font-weight: 700; color: #ffd700; text-align: center; letter-spacing: 2px; margin-bottom: 20px; border-bottom: 1px solid #333; padding-bottom: 12px; }
  .language-list { display: flex; flex-direction: column; gap: 6px; margin-bottom: 16px; max-height: 300px; overflow-y: auto; }
  .language-item { padding: 10px 16px; border-radius: 8px; background: #252a2e; color: #ccc; font-size: 16px; font-weight: 500; cursor: pointer; transition: all 0.15s ease; border: 2px solid transparent; text-align: center; }
  .language-item.focused { border-color: #ffd700; background: rgba(255, 215, 0, 0.15); color: #fff; box-shadow: 0 0 20px rgba(255, 215, 0, 0.2); transform: scale(1.02); }
  .language-hint { font-size: 11px; color: #888; text-align: center; letter-spacing: 0.5px; margin-top: 8px; border-top: 1px solid #333; padding-top: 12px; }

  /* ─── FAVORITES GRID (replaces EPG in fullscreen) ────────────── */
  .favorites-grid-replacement {
    background: rgba(0, 0, 0, 0.88) !important;
    border: 2px solid #ffd700 !important;
    border-radius: 14px !important;
    backdrop-filter: blur(8px) !important;
    box-shadow: 0 0 30px rgba(0, 0, 0, 0.8) !important;
  }
  .favorites-grid-header-fullscreen {
    font-size: 16px;
    font-weight: 700;
    color: #ffd700;
    text-align: center;
    letter-spacing: 1px;
    padding-bottom: 6px;
    border-bottom: 1px solid rgba(255, 215, 0, 0.25);
    margin-bottom: 6px;
  }
  .fav-count {
    font-size: 13px;
    color: #aaa;
    font-weight: 400;
  }
  .favorites-grid-scroll-fullscreen {
    display: flex;
    gap: 6px;
    overflow-x: auto;
    padding: 4px 4px 8px 4px;
    scrollbar-width: thin;
    scrollbar-color: rgba(255, 215, 0, 0.3) transparent;
    align-items: center;
  }
  .favorites-grid-scroll-fullscreen::-webkit-scrollbar {
    height: 4px;
  }
  .favorites-grid-scroll-fullscreen::-webkit-scrollbar-track {
    background: transparent;
  }
  .favorites-grid-scroll-fullscreen::-webkit-scrollbar-thumb {
    background: rgba(255, 215, 0, 0.3);
    border-radius: 4px;
  }
  .fav-grid-item-fullscreen {
    flex-direction: column;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 80px;
    cursor: pointer;
    border-radius: 10px;
    padding: 4px 2px;
    background: transparent;
    transition: all 0.2s ease;
    gap: 2px;
  }
  .fav-grid-item-fullscreen.focused {
  }
  .fav-grid-item-fullscreen.focused .fav-grid-icon-fullscreen {
    transform: scale(1.18);
    transition: transform 0.2s ease;
  }
  .fav-grid-item-fullscreen.focused .fav-grid-placeholder-fullscreen {
    transform: scale(1.18);
    transition: transform 0.2s ease;
  }
  .fav-grid-icon-fullscreen {
    width: 100px;
    height: 60px;
    object-fit: contain;
    border-radius: 6px;
    background: transparent;
    filter: drop-shadow(0 2px 8px rgba(0,0,0,0.6));
    transition: transform 0.2s ease;
  }
  .fav-grid-placeholder-fullscreen {
    width: 56px;
    height: 56px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 22px;
    font-weight: 900;
    color: #ffd700;
    background: transparent;
    border: 1px solid rgba(255,215,0,0.3);
    border-radius: 6px;
    text-shadow: 0 2px 8px rgba(0,0,0,0.8);
    transition: transform 0.2s ease;
  }
  .fav-grid-number-fullscreen {
    font-size: 11px;
    color: #eee;
    font-weight: 600;
    letter-spacing: 0.5px;
    text-shadow: 0 2px 6px rgba(0,0,0,0.9);
    margin-top: 2px;
  }

  /* ─── Animated Header ────────────────────────────────────────── */
  .animated-header { background: linear-gradient(135deg, #FFFAE0, #f5e6b8); height: 34px; display: flex; align-items: center; justify-content: center; border-radius: 8px; flex-shrink: 0; border: 2px solid #ffd700; overflow: hidden; margin-bottom: 10px; }
  .scrolling-text { white-space: nowrap; color: #1a1a1a; font-size: 12px; font-weight: 900; letter-spacing: 1px; text-transform: uppercase; animation: scrollText 20s linear infinite; display: inline-block; padding-right: 50px; }
  @keyframes scrollText { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }

  /* ─── EPG Grid (non-fullscreen) ─────────────────────────────── */
  .epg-grid { flex: 1; min-height: 0; display: flex; align-items: stretch; margin-top: 4px; gap: 10px; }
  .epg-column { flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; }
  .program-card { display: flex; flex-direction: column; border-radius: 10px; padding: 10px 12px 10px; overflow: hidden; background: #141618; border: 1px solid #252a2e; height: 100%; box-sizing: border-box; transition: border-color 0.2s; }
  .program-card.upcoming { background: #141618; border-color: #252a2e; }
  .program-card.upcoming:hover { border-color: #00C4EE; }
  .card-label-up { font-size: 10px; font-weight: 900; letter-spacing: 1.5px; text-transform: uppercase; color: #00C4EE; margin-bottom: 3px; flex-shrink: 0; }
  .card-uptime { font-size: 12px; color: #999; font-family: monospace; margin-bottom: 4px; flex-shrink: 0; }
  .card-title { font-size: 12px; font-weight: 600; color: #eee; line-height: 1.3; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; margin-bottom: 4px; flex-shrink: 0; }
  .card-desc.full-desc { font-size: 11px; color: #aaa; line-height: 1.5; margin-top: 2px; overflow: visible; word-wrap: break-word; flex: 1; max-height: none; overflow-y: auto; max-height: 100%; }
  .card-desc.full-desc::-webkit-scrollbar { width: 4px; }
  .card-desc.full-desc::-webkit-scrollbar-track { background: transparent; }
  .card-desc.full-desc::-webkit-scrollbar-thumb { background: #555; border-radius: 4px; }

  /* ─── Channel Number Input ───────────────────────────────────── */
  .channel-number-overlay { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: 20000; animation: fadeInScale 0.2s ease-out; pointer-events: none; }
  .channel-number-box { background: linear-gradient(135deg, rgba(0, 0, 0, 0.95), rgba(0, 0, 0, 0.85)); backdrop-filter: blur(20px); border: 3px solid #ffd700; border-radius: 20px; padding: 25px 50px; text-align: center; box-shadow: 0 0 50px rgba(255, 215, 0, 0.5); min-width: 300px; }
  .channel-prefix { font-size: 48px; font-weight: bold; color: #ffd700; margin-right: 20px; text-shadow: 0 0 10px rgba(255, 215, 0, 0.5); }
  .channel-digits { font-size: 72px; font-weight: 900; color: #ffffff; letter-spacing: 8px; text-shadow: 0 0 20px rgba(255, 255, 255, 0.5); font-family: monospace; }
  @keyframes fadeInScale { from { opacity: 0; transform: translate(-50%, -50%) scale(0.8); } to { opacity: 1; transform: translate(-50%, -50%) scale(1); } }
  .expand-toggle { background: transparent; border: none; color: #1a1a1a; font-size: 18px; font-weight: bold; cursor: pointer; padding: 0 8px; margin-left: auto; line-height: 1; transition: transform 0.2s; }
  .expand-toggle:hover { transform: scale(1.2); }

  /* ─── Responsive ─────────────────────────────────────────────── */
  @media (max-width: 768px) {
    .left-panel { flex: 0 0 240px; }
    .channel-number-box { padding: 15px 30px; min-width: 200px; }
    .channel-prefix { font-size: 32px; margin-right: 10px; }
    .channel-digits { font-size: 48px; letter-spacing: 4px; }
    .scrolling-text { font-size: 12px; animation: scrollText 15s linear infinite; }
    .epg-grid { gap: 6px; flex-wrap: wrap; }
    .epg-column { flex: 1 1 30%; min-width: 80px; }
    .program-card { padding: 8px 10px; }
    .video-container { padding-bottom: 45%; }
    .card-desc.full-desc { font-size: 10px; line-height: 1.4; }
    .card-title { font-size: 11px; }
    .epg-buttons { flex-wrap: wrap; justify-content: center; }
    .epg-button { min-width: 60px; padding: 4px 10px; font-size: 12px; }
    .epg-button-icon-img { width: 20px; height: 20px; }
    .epg-channel-number { font-size: 18px; }
    .epg-channel-name { font-size: 15px; }
    .epg-program-title { font-size: 14px; }
    .epg-description { font-size: 11px; }
    .epg-time-start, .epg-time-end, .epg-pct { font-size: 10px; }
    .language-box { padding: 20px 24px; min-width: 200px; }
    .language-title { font-size: 16px; }
    .language-item { font-size: 14px; padding: 8px 12px; }
    .epg-upcoming { gap: 8px; }
    .epg-upcoming-item { font-size: 12px; padding: 4px 10px; min-width: 100px; }
    .fav-grid-item-fullscreen { width: 66px; }
    .fav-grid-icon-fullscreen, .fav-grid-placeholder-fullscreen { width: 44px; height: 44px; }
    .favorites-grid-header-fullscreen { font-size: 14px; }
    .fav-grid-number-fullscreen { font-size: 10px; }
  }
  @media (max-width: 480px) {
    .left-panel { flex: 0 0 200px; flex-wrap: wrap; }
    .epg-column { flex: 1 1 100%; }
    .video-container { padding-bottom: 50%; }
    .card-desc.full-desc { font-size: 10px; }
    .card-title { font-size: 10px; }
    .epg-button { min-width: 50px; padding: 4px 8px; font-size: 11px; }
    .epg-button-icon-img { width: 18px; height: 18px; }
    .epg-channel-number { font-size: 16px; }
    .epg-channel-name { font-size: 13px; }
    .epg-program-title { font-size: 13px; }
    .epg-description { font-size: 10px; }
    .epg-now-label { font-size: 9px; padding: 0 8px; }
    .epg-progress-track { height: 3px; }
    .language-box { padding: 16px 20px; min-width: 160px; }
    .language-title { font-size: 14px; }
    .language-item { font-size: 13px; padding: 6px 10px; }
    .epg-upcoming { gap: 6px; flex-direction: column; }
    .epg-upcoming-item { font-size: 11px; padding: 4px 8px; min-width: auto; }
    .fav-grid-item-fullscreen { width: 58px; }
    .fav-grid-icon-fullscreen, .fav-grid-placeholder-fullscreen { width: 38px; height: 38px; }
    .favorites-grid-header-fullscreen { font-size: 13px; }
    .fav-grid-number-fullscreen { font-size: 9px; }
  }
</style>
