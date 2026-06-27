/* ═══════════════════════════════════════════════════════════════════════
   hac-perfiles.js — Perfiles de usuario (Supabase, tabla `perfiles`).
   ─────────────────────────────────────────────────────────────────────────
   Espejo público de auth.users con su ROL (normal | admin). NO contiene
   credenciales (esas viven hasheadas en auth.users). Lectura/gestión: solo el
   admin (RLS via es_admin), salvo el propio perfil. Ver supabase/perfiles.sql.

   Modelo cliente: { id, email, nombre, rol, creado }
   ═══════════════════════════════════════════════════════════════════════ */
const HacPerfiles = (function () {
  'use strict';
  const TABLE = 'perfiles';

  async function sb() {
    if (typeof Auth === 'undefined') throw new Error('Auth no está cargado');
    await Auth.ready();
    const c = Auth.client();
    if (!c) throw new Error('Supabase no disponible');
    return c;
  }
  function rowToObj(r) {
    return { id: r.id, email: r.email || '', nombre: r.nombre || '', rol: r.rol || 'normal', creado: r.creado };
  }

  // Todos los perfiles (solo el admin los ve; RLS).
  async function all() {
    const c = await sb();
    const { data, error } = await c.from(TABLE).select('*').order('creado', { ascending: true });
    if (error) throw error;
    return (data || []).map(rowToObj);
  }

  // Cambia el rol de un usuario (solo admin; RLS).
  async function setRol(id, rol) {
    const c = await sb();
    const { error } = await c.from(TABLE).update({ rol }).eq('id', id);
    if (error) throw error;
  }

  return { all, setRol, TABLE };
})();

if (typeof window !== 'undefined') window.HacPerfiles = HacPerfiles;
