<script>
  export let code = "N/A";
  export let shortMessage = "Playback failed";
  export let visible = false;
  export let retryInSeconds = 0;
  export let retryAttempt = 0;
  export let maxRetries = 0;
</script>

{#if visible}
  <div class="error-overlay">
    <div class="error-chip">
      <div class="error-code">Error - {code}</div>
      <div class="error-message">{shortMessage}</div>
      <div class="retry-meta">
        Retry {retryAttempt}/{maxRetries} • {retryInSeconds}s
      </div>
    </div>
  </div>
{/if}

<style>
  .error-overlay {
    position: absolute;
    top: 40px;
    right: 40px;
    z-index: 10020;
    pointer-events: none;
  }

  .error-chip {
    min-width: 260px;
    max-width: 420px;
    background: linear-gradient(135deg, rgba(0, 0, 0, 0.88), rgba(20, 20, 20, 0.9));
    backdrop-filter: blur(14px);
    border: 2px solid #ff5a5a;
    border-radius: 16px;
    box-shadow: 0 0 24px rgba(255, 0, 0, 0.35);
    padding: 10px 14px;
  }

  .error-code {
    font-size: 22px;
    font-weight: 800;
    color: #ff5a5a;
    line-height: 1.1;
    letter-spacing: 0.8px;
  }

  .error-message {
    color: #fff;
    font-size: 13px;
    margin-top: 4px;
    word-break: break-word;
  }

  .retry-meta {
    color: #ffd37b;
    font-size: 11px;
    margin-top: 6px;
    font-weight: 600;
  }
</style>
