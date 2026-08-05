<script>
  import { createEventDispatcher } from 'svelte';

  const dispatch = createEventDispatcher();

  // ── Props ──────────────────────────────────────────────────────
  export let visible   = false;   // parent toggles this
  export let active    = false;   // true = d-pad is locked inside keyboard
  export let kbRow     = 1;       // focused row
  export let kbCol     = 0;       // focused col

  // ── Internal state ─────────────────────────────────────────────
  let isCaps  = false;
  let isSymbol = false;

  const KEYBOARD_LAYOUT = [
    ['1','2','3','4','5','6','7','8','9','0'],
    ['q','w','e','r','t','y','u','i','o','p'],
    ['a','s','d','f','g','h','j','k','l'],
    ['CAPS','z','x','c','v','b','n','m','BACK'],
    ['@#$','.','SPACE','ENTER'],
  ];

  const SYMBOL_LAYOUT = [
    ['!','@','#','$','%','^','&','*','(',')'],
    ['-','_','+','=','{','}','[',']'],
    [';',':','"',"'",'<','>','?'],
    ['ABC','BACK'],
    ['SPACE','ENTER'],
  ];

  $: layout = isSymbol ? SYMBOL_LAYOUT : KEYBOARD_LAYOUT;

  // ── Public methods (called by parent via bind:this) ────────────
  /** Handle a d-pad / Enter key while keyboard is active */
  export function handleKey(key) {
    switch (key) {
      case 'ArrowUp':
        if (kbRow > 0) kbRow--;
        break;
      case 'ArrowDown':
        if (kbRow < layout.length - 1) {
          kbRow++;
          kbCol = Math.min(kbCol, layout[kbRow].length - 1);
        }
        break;
      case 'ArrowLeft':
        if (kbCol > 0) kbCol--;
        break;
      case 'ArrowRight':
        if (kbCol < layout[kbRow].length - 1) kbCol++;
        break;
      case 'Enter':
        pressCurrentKey();
        break;
    }
    // force Svelte reactivity
    kbRow = kbRow;
    kbCol = kbCol;
  }

  export function reset() {
    kbRow = 1;
    kbCol = 0;
    isCaps = false;
    isSymbol = false;
  }

  // ── Key press logic ────────────────────────────────────────────
  function pressCurrentKey() {
    const key = layout[kbRow][kbCol];

    if (key === 'CAPS')  { isCaps = !isCaps; return; }
    if (key === '@#$')   { isSymbol = true;  kbRow = 0; kbCol = 0; return; }
    if (key === 'ABC')   { isSymbol = false; kbRow = 0; kbCol = 0; return; }
    if (key === 'BACK')  { dispatch('input', 'backspace'); return; }
    if (key === 'SPACE') { dispatch('input', ' '); return; }
    if (key === 'ENTER') { dispatch('confirm'); return; }

    const char = (isCaps && key.length === 1 && !isSymbol)
      ? key.toUpperCase()
      : (key.length === 1 && !isSymbol) ? key.toLowerCase() : key;
    dispatch('input', char);
  }

  // ── Display helpers ────────────────────────────────────────────
  function keyLabel(key, caps, sym) {
    if (key === 'BACK')  return '⌫';
    if (key === 'SPACE') return 'SPACE';
    if (key.length === 1 && !sym)
      return caps ? key.toUpperCase() : key.toLowerCase();
    return key;
  }
</script>

<div class="keyboard-container" class:visible>
  <div class="custom-keyboard">
    {#each layout as row, rIdx}
      <div class="keyboard-row">
        {#each row as key, cIdx}
          <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
          <div
            class="key {key === 'SPACE'
              ? 'key-space'
              : (key === 'ENTER' || key === 'CAPS' || key === 'ABC')
                ? 'key-wide'
                : 'key-normal'}"
            class:focused={active && rIdx === kbRow && cIdx === kbCol}
            on:click={() => { kbRow = rIdx; kbCol = cIdx; pressCurrentKey(); }}
          >
            {keyLabel(key, isCaps, isSymbol)}
          </div>
        {/each}
      </div>
    {/each}
  </div>
</div>

<style>
  .keyboard-container {
    position: fixed;
    bottom: -600px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 1000;
    transition: bottom 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55);
    display: flex;
    justify-content: center;
    pointer-events: none;
  }

  .keyboard-container.visible {
    bottom: 30px;
    pointer-events: auto;
  }

  .custom-keyboard {
    width: 900px;
    max-width: 90vw;
    padding: 20px;
    background-color: rgba(20, 20, 20, 0.95);
    border-radius: 15px;
    border: 1px solid #333;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
  }

  .keyboard-row {
    display: flex;
    justify-content: center;
    gap: 8px;
    margin-bottom: 10px;
  }

  .key {
    height: 50px;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: #333;
    color: #fff;
    border-radius: 8px;
    font-weight: bold;
    font-size: 18px;
    border: 1px solid transparent;
    transition: all 0.1s;
    cursor: pointer;
    user-select: none;
  }

  .key.focused {
    background-color: #e1001e;
    border: 3px solid #fff;
    transform: scale(1.1);
    box-shadow: 0 0 20px #e1001e;
  }

  .key-space  { flex: 4; }
  .key-wide   { flex: 1.5; }
  .key-normal { flex: 1; }
</style>
