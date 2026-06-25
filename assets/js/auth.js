/* ═══════════════════════════════════════════════════════════════════════
   auth.js — Autenticación del portal (Supabase: Google OAuth + email).
   ─────────────────────────────────────────────────────────────────────────
   Capa AISLADA: el resto del portal usa solo la API de aquí abajo, así que
   se puede cambiar el proveedor sin tocar la UI.

   ⚠️  IMPORTANTE — Supabase es ASÍNCRONO:
   La sesión se carga al arrancar de forma asíncrona. Antes de leer la sesión
   con current()/isAdmin(), espera a que termine la carga inicial:

       await Auth.ready();          // resuelve cuando la sesión está cargada
       if (Auth.isAdmin()) { ... }

   API:
     Auth.ready()                 → Promise; resuelve con el usuario actual (o null)
     Auth.current()               → {id, nombre, email, role} | null   (SÍNCRONO, tras ready)
     Auth.isAdmin()               → boolean                              (SÍNCRONO, tras ready)
     Auth.onChange(cb)            → suscribe a cambios de sesión; devuelve fn para desuscribir
     Auth.loginWithGoogle(url?)   → inicia el flujo OAuth de Google (redirige)
     await Auth.login({email, password})            → inicia sesión (email)
     await Auth.register({nombre, email, password}) → crea cuenta (email) → {user, needsConfirm}
     await Auth.logout()          → cierra sesión

   El administrador se decide por el correo: quien entre con ADMIN_EMAIL es
   admin; cualquier otro, usuario normal.
   ═══════════════════════════════════════════════════════════════════════ */
const Auth = (function () {
  'use strict';

  /* ── CONFIGURACIÓN ───────────────────────────────────────────────────────
     Datos del proyecto Supabase. La clave publishable/anon es PÚBLICA por
     diseño (va en el frontend). Al cambiar de hosting, añade la URL pública
     en Supabase → Authentication → URL Configuration y en el cliente OAuth
     de Google Cloud.                                                          */
  const SUPABASE_URL = 'https://wjrglsvshnhzebrzkqof.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_RatHSfue7VCTMMXPt1mZ9Q_sAsYiPd6';
  const ADMIN_EMAIL  = 'jhatadagari@gmail.com';

  const SDK_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';

  let client     = null;   // cliente Supabase
  let cachedUser = null;   // instantánea síncrona del usuario (tras ready)
  const listeners = new Set();

  const norm    = (e) => String(e == null ? '' : e).trim().toLowerCase();
  const roleFor = (email) => norm(email) === norm(ADMIN_EMAIL) ? 'admin' : 'normal';

  // Convierte la sesión de Supabase en el objeto de usuario que usa el portal.
  function toUser(session) {
    const su = session && session.user;
    if (!su) return null;
    const email = su.email || '';
    const meta  = su.user_metadata || {};
    const nombre = meta.full_name || meta.name || (email ? email.split('@')[0] : 'Usuario');
    return { id: su.id, nombre, email, role: roleFor(email) };
  }

  // Traduce los errores de Supabase (en inglés) a mensajes claros.
  function traducir(error) {
    const m = (error && error.message) || 'Algo ha ido mal.';
    if (/invalid login credentials/i.test(m)) return 'Correo o contraseña incorrectos.';
    if (/user already registered/i.test(m))   return 'Ya existe una cuenta con ese correo.';
    if (/password should be at least/i.test(m)) return 'La contraseña necesita al menos 6 caracteres.';
    if (/unable to validate email|invalid format/i.test(m)) return 'Ese correo no es válido.';
    if (/email not confirmed/i.test(m)) return 'Confirma tu correo antes de entrar (revisa tu bandeja).';
    return m;
  }

  // Carga el SDK de Supabase bajo demanda (una sola vez).
  function loadSDK() {
    if (window.supabase && window.supabase.createClient) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = SDK_URL;
      s.onload = resolve;
      s.onerror = () => reject(new Error('No se pudo cargar el SDK de Supabase (¿sin conexión?).'));
      document.head.appendChild(s);
    });
  }

  // Arranque: carga SDK, crea cliente y espera al primer evento de sesión.
  // Race entre onAuthStateChange (procesa hash OAuth) y getSession (recupera localStorage).
  async function init() {
    await loadSDK();
    client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    let resolved = false;
    await new Promise((resolve) => {
      // Via onAuthStateChange (fiable para OAuth callback desde hash)
      client.auth.onAuthStateChange((_event, session) => {
        cachedUser = toUser(session);
        listeners.forEach(cb => { try { cb(cachedUser); } catch (e) { /* noop */ } });
        if (!resolved) { resolved = true; resolve(); }
      });
      // Fallback: getSession recupera sesión de localStorage directamente
      client.auth.getSession().then(({ data }) => {
        if (!resolved) {
          resolved = true;
          cachedUser = toUser(data.session);
          resolve();
        }
      });
    });
    return cachedUser;
  }
  const initPromise = init().catch((e) => { console.error('[Auth]', e); return null; });

  function ready()   { return initPromise; }
  function current() { return cachedUser; }
  function isAdmin() { return !!cachedUser && cachedUser.role === 'admin'; }
  function onChange(cb) { listeners.add(cb); return () => listeners.delete(cb); }
  // Cliente Supabase compartido (p.ej. HacStore lo usa para leer/escribir
  // haciendas). Disponible tras ready(). Así no se crean clientes duplicados.
  function getClient() { return client; }

  // ── Google OAuth ──
  async function loginWithGoogle(redirectTo) {
    await ready();
    const { error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: redirectTo || location.href }
    });
    if (error) throw new Error(traducir(error));
    // El navegador se redirige a Google; al volver, onAuthStateChange actualiza.
  }

  // ── Email + contraseña ──
  async function login({ email, password } = {}) {
    await ready();
    const { data, error } = await client.auth.signInWithPassword({ email: norm(email), password: String(password || '') });
    if (error) throw new Error(traducir(error));
    cachedUser = toUser(data.session);
    return cachedUser;
  }

  async function register({ nombre, email, password } = {}) {
    await ready();
    nombre = String(nombre || '').trim();
    if (!nombre) throw new Error('Escribe tu nombre.');
    const { data, error } = await client.auth.signUp({
      email: norm(email),
      password: String(password || ''),
      options: { data: { full_name: nombre } }
    });
    if (error) throw new Error(traducir(error));
    cachedUser = toUser(data.session);
    // Si el proyecto exige confirmar el correo, no hay sesión todavía.
    return { user: cachedUser, needsConfirm: !data.session };
  }

  async function logout() {
    await ready();
    if (client) await client.auth.signOut();
    cachedUser = null;
  }

  return {
    ready, current, isAdmin, onChange, client: getClient,
    loginWithGoogle, login, register, logout,
    ADMIN_EMAIL
  };
})();

if (typeof window !== 'undefined') window.Auth = Auth;
