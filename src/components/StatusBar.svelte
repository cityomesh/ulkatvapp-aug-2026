<script>
  import { statusMsg } from '../stores/appStore.js';
</script>

<div id="status" class:error={$statusMsg.isError}>
  {$statusMsg.text}
</div>

<style>
  /* Overrides are in app.css; this keeps component self-contained */
  .error { color: #ff3333 !important; border-color: #ff3333 !important; }
</style>
