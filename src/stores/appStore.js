// src/stores/appStore.js
import { writable, derived, get } from 'svelte/store';

// ── Auth ───────────────────────────────────────────────────
// Initialise from localStorage so a page refresh keeps the user logged in.
export const authToken   = writable(localStorage.getItem('ulka_token')   || null);
export const authUsername = writable('');
export const activeProfile = writable(localStorage.getItem('ulka_active_profile') || '');

/** Call after a successful login to sync the store with localStorage. */
export function setAuth(token, username) {
  authToken.set(token);
  authUsername.set(username);
}

export function clearAuth() {
  localStorage.removeItem('ulka_token');
  localStorage.removeItem('ulka_active_profile');
  localStorage.removeItem('ulka_is_main');
  localStorage.removeItem('ulka_profiles'); // Clear created profile data
  authToken.set(null);
  authUsername.set('');
  activeProfile.set('');
}

// ── Categories & Languages fetched from API ─────────────────
export const categories = writable([]);
export const languages = writable([]);

// ── Raw channel data from API ──────────────────────────────
export const allChannels = writable([]);

// ── Selected indices into CATEGORIES / LANGUAGES arrays ───
export const selectedCat  = writable(0);
export const selectedLang = writable(0);

// ── UI navigation state ────────────────────────────────────
// Sections: 'categories' | 'languages' | 'channels' | 'player'
export const activeSection = writable('categories');
export const focusedIdx    = writable(0);
export const isFullScreen  = writable(false);

// ── Currently playing channel (null = nothing playing) ─────
export const playingChannel = writable(null);

// ── ⭐ Favorites store (persists in localStorage) ──────────
export const favorites = writable([]);

// ── Status bar ─────────────────────────────────────────────
export const statusMsg = writable({ text: 'Initializing...', isError: false });

// ── Derived: auto-filtered channel list ───────────────────
// Recomputes automatically whenever allChannels / selectedCat / selectedLang changes.
// Uses Number() conversion to handle API returning IDs as strings or numbers.
export const filteredChannels = derived(
  [allChannels, selectedCat, selectedLang, categories, languages],
  ([$all, $cat, $lang, $categories, $languages]) => {
    if ($categories.length === 0 || $languages.length === 0) return [];

    const catEntry = $categories[$cat];
    const langEntry = $languages[$lang];
    if (!catEntry || !langEntry) return [];

    const cId = catEntry.id;
    const lId = langEntry.id;

    const result = $all.filter(ch =>
      Number(ch.genre_id)    === cId &&
      Number(ch.subgenre_id) === lId
    );

    console.log(`[Store] Filter — category: ${catEntry.name}(${cId}), language: ${langEntry.name}(${lId}) → ${result.length} channels`);

    // Debug when empty: log unique IDs so mappings can be verified
    if (result.length === 0 && $all.length > 0) {
      const byCat  = $all.filter(ch => Number(ch.genre_id)    === cId).length;
      const byLang = $all.filter(ch => Number(ch.subgenre_id) === lId).length;
      console.warn(`[Store] 0 results — genre_id=${cId} alone: ${byCat}, subgenre_id=${lId} alone: ${byLang}`);
      console.warn('[Store] Unique genre_id values:', [...new Set($all.map(c => c.genre_id))].sort());
      console.warn('[Store] Unique subgenre_id values:', [...new Set($all.map(c => c.subgenre_id))].sort());
    }

    return result;
  }
);
