<!-- FullScreenOverlay.svelte -->
<script>
  import { onDestroy } from "svelte";
  import { API_HOST } from "../lib/constants.js";

  export let channel = null;
  export let interactionTick = 0;

  let showEpg = false;
  let showTop = true;
  let epgTimer = null;
  let topTimer = null;
  let prevChannelId = null;
  let prevInteractionTick = -1;
  
  // EPG data storage
  let epgCache = {};
  let currentProgram = null;
  let upcomingPrograms = [];
  let isLoading = false;

  function formatTime(date) {
    if (!date) return "--:--";
    return new Date(date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  }

  function parseDateString(dateString) {
    if (!dateString) return new Date(0);
    return new Date(dateString);
  }

  // Fetch EPG data from API
  async function fetchEPG(channelNumbers) {
    if (!channelNumbers || channelNumbers.length === 0) return false;
    
    try {
      const token = localStorage.getItem('ulka_token');
      if (!token) {
        console.error('No token found');
        return false;
      }
      
      const response = await fetch(`${API_HOST}/apiv2/channels/epg`, {
        method: 'POST',
        headers: {
          'auth': 'auth=' + token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          "number": channelNumbers,
          "device_timezone": 5.5,
          "timeshift": 2
        })
      });
      
      const data = await response.json();
      console.log('EPG Response:', data);
      
      if (data.status_code === 200 && data.response_object) {
        // Store in cache
        channelNumbers.forEach(num => {
          epgCache[num] = [];
        });
        
        data.response_object.forEach(program => {
          const chNum = program.number;
          if (!epgCache[chNum]) {
            epgCache[chNum] = [];
          }
          epgCache[chNum].push(program);
        });
        
        // Sort by start time
        for (let chNum in epgCache) {
          epgCache[chNum].sort((a, b) => {
            return parseDateString(a.programstart) - parseDateString(b.programstart);
          });
        }
        
        console.log('EPG Cache:', epgCache);
        return true;
      }
      return false;
    } catch (error) {
      console.error('EPG API error:', error);
      return false;
    }
  }

  // Get current playing program
  function getCurrentProgram(channelNumber) {
    const programs = epgCache[channelNumber];
    if (!programs || programs.length === 0) return null;
    
    const now = new Date();
    
    for (let program of programs) {
      const startTime = parseDateString(program.programstart);
      const endTime = parseDateString(program.programend);
      
      if (now >= startTime && now <= endTime) {
        return program;
      }
    }
    return null;
  }

  // Get upcoming programs
  function getUpcomingPrograms(channelNumber, limit = 2) {
    const programs = epgCache[channelNumber];
    if (!programs || programs.length === 0) return [];
    
    const now = new Date();
    const upcoming = [];
    
    for (let program of programs) {
      const startTime = parseDateString(program.programstart);
      if (startTime > now && upcoming.length < limit) {
        upcoming.push(program);
      }
    }
    return upcoming;
  }

  // Load EPG for a channel
  async function loadEPGForChannel(channelData) {
    if (!channelData || !channelData.channel_number) {
      console.log('No channel number');
      return;
    }
    
    const channelNumber = parseInt(channelData.channel_number);
    console.log('Loading EPG for channel:', channelNumber);
    
    // If already in cache
    if (epgCache[channelNumber] && epgCache[channelNumber].length > 0) {
      console.log('Using cached EPG data');
      currentProgram = getCurrentProgram(channelNumber);
      upcomingPrograms = getUpcomingPrograms(channelNumber, 2);
      return;
    }
    
    // Fetch new data
    isLoading = true;
    const success = await fetchEPG([channelNumber]);
    isLoading = false;
    
    if (success) {
      currentProgram = getCurrentProgram(channelNumber);
      upcomingPrograms = getUpcomingPrograms(channelNumber, 2);
      console.log('EPG loaded:', { currentProgram, upcomingPrograms });
    } else {
      console.log('No EPG data received');
      currentProgram = null;
      upcomingPrograms = [];
    }
  }

  let epgShowDelayTimer = null;

  // Timer functions
  function resetTopOverlayTimer() {
    showTop = true;
    if (topTimer) clearTimeout(topTimer);
    topTimer = setTimeout(() => {
      showTop = false;
    }, 3000);
  }

  function clearAllEpgTimers() {
    if (epgTimer) { clearTimeout(epgTimer); epgTimer = null; }
    if (epgShowDelayTimer) { clearTimeout(epgShowDelayTimer); epgShowDelayTimer = null; }
  }

  // Show EPG after a delay, then auto-hide after 5s
  function scheduleEpgShow() {
    clearAllEpgTimers();
    showEpg = false;
    epgShowDelayTimer = setTimeout(() => {
      showEpg = true;
      epgTimer = setTimeout(() => {
        showEpg = false;
      }, 5000);
    }, 5000);
  }

  // On user interaction: show immediately, auto-hide after 5s
  function bumpEpgOverlay() {
    clearAllEpgTimers();
    showEpg = true;
    epgTimer = setTimeout(() => {
      showEpg = false;
    }, 5000);
  }

  // Watch for channel changes — hide immediately, show after 5s
  $: {
    const channelId = channel?.id ?? channel?.channel_number ?? null;
    if (channelId !== prevChannelId && channel) {
      prevChannelId = channelId;
      console.log('Channel changed, loading EPG:', channel);
      showEpg = false;
      loadEPGForChannel(channel);
      resetTopOverlayTimer();
      scheduleEpgShow();
    }
  }

  // Watch for user interaction — show EPG immediately
  $: {
    if (interactionTick !== prevInteractionTick) {
      prevInteractionTick = interactionTick;
      if (channel) {
        resetTopOverlayTimer();
        bumpEpgOverlay();
      }
    }
  }

  // Update clock every second
  let now = new Date();
  const clock = setInterval(() => {
    now = new Date();
    // Update current program every second
    if (channel && epgCache[parseInt(channel.channel_number)]) {
      currentProgram = getCurrentProgram(parseInt(channel.channel_number));
    }
  }, 1000);

  onDestroy(() => {
    if (topTimer) clearTimeout(topTimer);
    clearAllEpgTimers();
    clearInterval(clock);
  });
</script>

{#if channel}
  <!-- Top channel number overlay -->
  <div class="top-channel-overlay" class:hidden={!showTop}>
    <div class="top-channel-number">{channel.channel_number || "--"}</div>
  </div>

  <!-- Enlarged EPG Overlay -->
  <div class="epg-overlay" class:hidden={!showEpg}>
    <div class="epg-channel-header">
      <div class="epg-channel-number">{channel.channel_number || "--"}</div>
      <div class="epg-channel-name">{channel.title || "Unknown"}</div>
      <div class="epg-clock">{formatTime(now)}</div>
    </div>

    <!-- Current Program -->
    <div class="current-program-compact">
      <div class="current-program-info">
        {#if isLoading}
          <div class="program-title-compact">Loading EPG data...</div>
        {:else if currentProgram}
          <div class="program-title-compact">{currentProgram.title || "Program Title"}</div>
          <div class="program-time-compact">
            {formatTime(currentProgram.programstart)} - {formatTime(currentProgram.programend)}
          </div>
          <div class="program-description-compact">
            {currentProgram.description || "No description available"}
          </div>
        {:else}
          <div class="program-title-compact">No EPG data available</div>
          <div class="program-description-compact">Program information not available</div>
        {/if}
      </div>
    </div>

    <!-- Upcoming Programs -->
    <div class="upcoming-compact">
      <div class="upcoming-title-compact">⏰ UP NEXT</div>
      <div class="upcoming-scroll">
        {#if upcomingPrograms.length > 0}
          {#each upcomingPrograms as program, idx}
            <div class="upcoming-card-compact" key={idx}>
              <div class="upcoming-title-compact-item">{program.title || "Program"}</div>
              <div class="upcoming-time-compact">
                {formatTime(program.programstart)} - {formatTime(program.programend)}
              </div>
            </div>
          {/each}
        {:else}
          <div class="upcoming-card-compact">
            <div class="upcoming-title-compact-item">No upcoming programs</div>
            <div class="upcoming-time-compact">--:-- - --:--</div>
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  /* Top channel overlay remains as before */
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

  /* ENLARGED EPG OVERLAY: taller, wider fonts, 16px base size */
  .epg-overlay {
    position: absolute;
    bottom: 30px;
    left: 30px;
    right: 30px;
    background: linear-gradient(135deg, rgba(0, 0, 0, 0.95) 0%, rgba(10, 10, 10, 0.95) 100%);
    backdrop-filter: blur(16px);
    border-radius: 20px;
    border: 1px solid rgba(255, 215, 0, 0.5);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
    padding: 16px 24px;
    animation: slideInUp 0.3s ease-out;
    z-index: 10000;
    transition: opacity 0.3s ease;
    max-height: 380px;
    overflow-y: auto;
    font-size: 16px; /* base font size */
  }

  .epg-overlay.hidden {
    opacity: 0;
    visibility: hidden;
    animation: none;
  }

  .epg-channel-header {
    display: flex;
    align-items: baseline;
    justify-content: flex-start;
    padding: 8px 0;
    margin-bottom: 12px;
    border-bottom: 2px solid rgba(255, 215, 0, 0.4);
    gap: 16px;
  }

  .epg-channel-number {
    font-size: 28px;
    font-weight: 900;
    color: #ffd700;
    background: rgba(255, 215, 0, 0.15);
    padding: 4px 16px;
    border-radius: 12px;
  }

  .epg-channel-name {
    font-size: 20px;
    font-weight: bold;
    color: #ffffff;
    flex: 1;
  }

  .epg-clock {
    font-size: 18px;
    color: #00d1ff;
    font-weight: 600;
    letter-spacing: 0.5px;
  }

  .current-program-compact {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.15);
    margin-bottom: 8px;
  }

  .current-program-info {
    flex: 1;
  }

  .program-title-compact {
    font-size: 20px;
    font-weight: bold;
    color: #ffd700;
    margin-bottom: 6px;
  }

  .program-time-compact {
    font-size: 15px;
    color: #00d1ff;
    margin-top: 4px;
    font-weight: 500;
  }

  .program-description-compact {
    font-size: 15px;
    color: #ddd;
    margin-top: 6px;
    line-height: 1.4;
    white-space: normal;
    overflow: visible;
  }

  .upcoming-compact {
    margin-top: 12px;
  }

  .upcoming-title-compact {
    font-size: 16px;
    font-weight: bold;
    color: #00d1ff;
    margin-bottom: 12px;
    letter-spacing: 1.5px;
  }

  .upcoming-scroll {
    display: flex;
    gap: 16px;
    overflow-x: auto;
    padding-bottom: 10px;
  }

  .upcoming-card-compact {
    background: rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    padding: 12px 18px;
    min-width: 200px;
    border-left: 3px solid #ffd700;
    flex-shrink: 0;
    transition: transform 0.2s;
  }

  .upcoming-card-compact:hover {
    transform: scale(1.02);
    background: rgba(255, 255, 255, 0.15);
  }

  .upcoming-title-compact-item {
    font-size: 16px;
    font-weight: 600;
    color: #fff;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-bottom: 6px;
  }

  .upcoming-time-compact {
    font-size: 14px;
    color: #00d1ff;
    font-weight: 500;
  }

  /* Custom scrollbars for larger UI */
  .epg-overlay::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }

  .epg-overlay::-webkit-scrollbar-track {
    background: rgba(255, 255, 255, 0.1);
    border-radius: 6px;
  }

  .epg-overlay::-webkit-scrollbar-thumb {
    background: #ffd700;
    border-radius: 6px;
  }

  .upcoming-scroll::-webkit-scrollbar {
    height: 5px;
  }

  .upcoming-scroll::-webkit-scrollbar-track {
    background: rgba(255, 255, 255, 0.1);
    border-radius: 5px;
  }

  .upcoming-scroll::-webkit-scrollbar-thumb {
    background: #ffd700;
    border-radius: 5px;
  }

  @keyframes slideInUp {
    from {
      transform: translateY(100%);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
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

  /* Responsive adjustments for mobile */
  @media (max-width: 768px) {
    .epg-overlay {
      bottom: 16px;
      left: 16px;
      right: 16px;
      padding: 12px 16px;
      max-height: 320px;
    }

    .top-channel-overlay {
      top: 20px;
      left: 20px;
      padding: 10px 25px;
    }

    .top-channel-number {
      font-size: 48px;
    }

    .epg-channel-number {
      font-size: 22px;
      padding: 2px 12px;
    }

    .epg-channel-name {
      font-size: 18px;
    }

    .epg-clock {
      font-size: 16px;
    }

    .program-title-compact {
      font-size: 18px;
    }

    .program-time-compact,
    .program-description-compact {
      font-size: 14px;
    }

    .upcoming-title-compact {
      font-size: 15px;
    }

    .upcoming-card-compact {
      min-width: 160px;
      padding: 10px 14px;
    }

    .upcoming-title-compact-item {
      font-size: 15px;
    }

    .upcoming-time-compact {
      font-size: 13px;
    }
  }
</style>
