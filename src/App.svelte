<script>
  import Router, { location } from 'svelte-spa-router';
  import { wrap } from 'svelte-spa-router/wrap';
  import Login from './routes/Login.svelte';
  import ProfileSelect from './routes/ProfileSelect.svelte';
  import ProfileForm from './routes/ProfileForm.svelte';   // ← కొత్తది
  import Home from './routes/Home.svelte';
  import PlayerScreen from './routes/PlayerScreen.svelte';
  import ExitScreen from './routes/ExitScreen.svelte';
  import StatusBar from './components/StatusBar.svelte';
  import OtaUpdatePopup from './components/OtaUpdatePopup.svelte';
  import { authToken } from './stores/appStore.js';
  import { push } from 'svelte-spa-router';

  let otaPopup;

  function requireAuth() {
    if (!localStorage.getItem('ulka_token')) {
      push('/login');
      return false;
    }
    return true;
  }

  function checkRootAuth() {
    if (localStorage.getItem('ulka_token')) {
      push('/profile');
      return false;
    }
    push('/login');
    return false;
  }

  function requireProfile() {
    if (!requireAuth()) return false;
    if (!sessionStorage.getItem('ulka_profile_selected')) {
      push('/profile');
      return false;
    }
    return true;
  }

  const routes = {
    '/':                wrap({ component: Login, conditions: [checkRootAuth] }),
    '/login':           Login,
    '/profile':         wrap({ component: ProfileSelect, conditions: [requireAuth] }),
    '/create-profile':  wrap({ component: ProfileForm, conditions: [requireAuth] }),
    '/edit-profile/:id': wrap({ component: ProfileForm, conditions: [requireAuth] }),  // ← id తో
    '/home':            wrap({ component: Home, conditions: [requireProfile] }),
    '/player':          wrap({ component: PlayerScreen, conditions: [requireProfile] }),
    '/exit':            wrap({ component: ExitScreen, conditions: [requireAuth] }),
    '*':                Login,
  };

  // StatusBar దాచడం – edit-profile కూడా
  $: hideStatusBar = ['/', '/login', '/profile', '/create-profile', '/player', '/exit'].some(route => $location === route) ||
                     $location.startsWith('/edit-profile');
</script>

{#if !hideStatusBar}
  <StatusBar />
{/if}

<Router {routes} />

<OtaUpdatePopup bind:this={otaPopup} />
