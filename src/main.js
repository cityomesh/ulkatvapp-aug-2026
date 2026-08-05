import './app.css';   // global styles — must be imported here for Vite to bundle it
import App from './App.svelte';

const app = new App({ target: document.getElementById('app') });

export default app;
