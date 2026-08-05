<script>
  import Router, { location } from 'svelte-spa-router';
  import { wrap } from 'svelte-spa-router/wrap';
  import Login from './routes/Login.svelte';
  import ProfileSelect from './routes/ProfileSelect.svelte';
  import CreateProfile from './routes/CreateProfile.svelte';
  import Home from './routes/Home.svelte';
  import PlayerScreen from './routes/PlayerScreen.svelte';
  import ExitScreen from './routes/ExitScreen.svelte';
  import StatusBar from './components/StatusBar.svelte';
  import OtaUpdatePopup from './components/OtaUpdatePopup.svelte';
  import { authToken } from './stores/appStore.js';
  import { push } from 'svelte-spa-router';

  let otaPopup; // bind:this handle — lets any screen call otaPopup.triggerCheck(true)

  // Guard: redirect to /login if not authenticated
  function requireAuth() {
    if (!localStorage.getItem('ulka_token')) {
      push('/login');
      return false;
    }
    return true;
  }

  // Guard: check token at root to go to profile or login
  function checkRootAuth() {
    if (localStorage.getItem('ulka_token')) {
      push('/profile');
      return false;
    }
    push('/login');
    return false;
  }

  // Guard: redirect to /profile if no profile selected this session
  function requireProfile() {
    if (!requireAuth()) return false;
    if (!sessionStorage.getItem('ulka_profile_selected')) {
      push('/profile');
      return false;
    }
    return true;
  }

  // Route map
  // Flow: / (login) → /profile (who's watching) → /home (dashboard)
  // On every refresh: user must pick a profile before reaching /home
  const routes = {
    '/':                wrap({ component: Login, conditions: [checkRootAuth] }),
    '/login':           Login,
    '/profile':         wrap({ component: ProfileSelect, conditions: [requireAuth] }),
    '/create-profile':  wrap({ component: CreateProfile, conditions: [requireAuth] }),
    '/home':            wrap({ component: Home, conditions: [requireProfile] }),
    '/player':          wrap({ component: PlayerScreen, conditions: [requireProfile] }),
    '/exit':            wrap({ component: ExitScreen, conditions: [requireAuth] }),
    '*':                Login,    // fallback → login
  };

  // Pages that should NOT show the StatusBar
  $: hideStatusBar = ['/', '/login', '/profile', '/create-profile', '/player', '/exit'].includes($location);
</script>

{#if !hideStatusBar}
  <StatusBar />
{/if}

<Router {routes} />

<!-- OTA update popup — lives at app root so it appears over any route -->
<OtaUpdatePopup bind:this={otaPopup} />
