<script>
  export let visible = false;
  export let value = "";
</script>

{#if visible}
  <div class="channel-number-overlay">
    <div class="channel-number-container">
      <div class="channel-number-label">ENTER CHANNEL NUMBER</div>
      <div class="channel-number-display">{value || "---"}</div>
      <div class="channel-number-hint">Press OK to confirm or ESC to cancel</div>
    </div>
  </div>
{/if}

<style>
  .channel-number-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.85);
    backdrop-filter: blur(10px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 20000;
    animation: fadeIn 0.2s ease;
  }

  .channel-number-container {
    background: linear-gradient(135deg, #1a1a1a, #0a0a0a);
    border: 3px solid #ffd700;
    border-radius: 20px;
    padding: 40px 60px;
    text-align: center;
    box-shadow: 0 0 50px rgba(255, 215, 0, 0.3);
    animation: scaleIn 0.3s ease;
  }

  .channel-number-label {
    font-size: 18px;
    color: #ffd700;
    text-transform: uppercase;
    letter-spacing: 2px;
    margin-bottom: 20px;
  }

  .channel-number-display {
    font-size: 72px;
    font-weight: bold;
    color: #fff;
    background: #000;
    padding: 20px 40px;
    border-radius: 15px;
    margin: 20px 0;
    font-family: monospace;
    letter-spacing: 5px;
    border: 2px solid #333;
  }

  .channel-number-hint {
    font-size: 14px;
    color: #888;
    margin-top: 20px;
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes scaleIn {
    from { transform: scale(0.9); opacity: 0; }
    to { transform: scale(1); opacity: 1; }
  }
</style>
