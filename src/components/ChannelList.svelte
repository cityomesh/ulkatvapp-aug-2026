<script>
import { filteredChannels, activeSection, focusedIdx, playingChannel } from '../stores/appStore.js';

  // Fallback SVG shown when channel icon fails to load
  function fallbackSrc(title) {
    return `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="160" height="90"><rect width="160" height="90" fill="%23333"/><text x="80" y="45" font-size="13" fill="%23fff" text-anchor="middle" dominant-baseline="middle">${encodeURIComponent(title)}</text></svg>`;
  }
</script>

{#if $filteredChannels.length === 0}
  <div class="error-message">No channels available</div>
{:else}
  {#each $filteredChannels as ch, i (ch.id ?? i)}
    {@const isFocused =
      $activeSection === 'channels'
        ? $focusedIdx === i
        : $playingChannel && $playingChannel.id === ch.id
    }
    <div class="channel-item" class:focused={isFocused}>
      
      <div class="channel-image-container">
        <img
          src={ch.icon_url || fallbackSrc(ch.title)}
          alt={ch.title || 'Channel'}
          class="channel-icon"
          on:error={e => { e.target.src = fallbackSrc(ch.title || 'CH'); }}
        />
      </div>

      {#if isFocused}
        <div class="channel-title">
          {ch.channel_number} - {ch.title}
        </div>
      {/if}

    </div>
  {/each}
{/if}
