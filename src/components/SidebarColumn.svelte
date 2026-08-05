<script>
  // Title shown in the header strip
  export let title  = '';
  // Optional count badge (pass null to hide)
  export let count  = null;
  // CSS class for width variant: 'categories-column' | 'languages-column' | 'channels-column'
  export let variant = '';
  // Exposed so parent can call scrollTo on it
  export let scrollEl = null;
</script>

<div class="sidebar-column {variant}">
  <div class="header">
    {title}
    {#if count !== null}
      <span>{count}</span>
    {/if}
  </div>

  <div class="scroll-area" bind:this={scrollEl}>
    <slot />
  </div>
</div>
