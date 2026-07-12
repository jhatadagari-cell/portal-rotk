/* ═══════════════════════════════════════════════════════════════════════
   hac-stats.js — Stats personales del mecenas: dinero + XP por dominio (Supabase).
   ─────────────────────────────────────────────────────────────────────────
   "Poder personal" del personaje (distinto del cargo/prestigio que aporta a la
   casa, que vive en HacPuntos). Aquí está lo SUYO: el dinero del monedero y la
   experiencia por dominio 武/文/政. El NIVEL de cada dominio se DERIVA del XP.

   Sube al COMPLETAR misiones/expediciones del dominio correspondiente. Patrón
   Auth/caché como HacPuntos/HacEnergia; escritura solo del dueño (RLS). Degrada
   limpio si falta la tabla (todo a 0).

   Clave `miembroId` = id del PERSONAJE (= walker.id). Es PERSONAL, no por hacienda.

   API:
     await HacStats.ready()                 · reload()
     HacStats.dinero(mid)                   → monedas que lleva encima (0 si no hay)
     HacStats.xp(mid, dom)                  → XP del dominio ('militar'|'cultural'|'administrativo')
     HacStats.nivel(mid, dom)               → nivel derivado del XP (1..)
     HacStats.progresoNivel(mid, dom)       → {nivel, falta, pct} hacia el siguiente
     await HacStats.award(mid, {dinero, xp:{dom:n}})  → suma y persiste
     HacStats.recompensaExped(dom, durSeg)  → {dinero, xp, dom} que daría una expedición
   ═══════════════════════════════════════════════════════════════════════ */
const HacStats = (function () {
  'use strict';
  const TABLE = 'mecenas_stats';
  const DOMS = ['militar', 'cultural', 'administrativo'];
  const COL = { militar: 'xp_militar', cultural: 'xp_cultural', administrativo: 'xp_administrativo' };
  let cache = [], readyPromise = null, ok = false;

  async function sb() {
    if (typeof Auth === 'undefined') throw new Error('Auth no está cargado');
    await Auth.ready();
    const client = Auth.client();
    if (!client) throw new Error('Supabase no disponible');
    return client;
  }
  function rowToObj(r) {
    const parseInv = (v) => { try { return Array.isArray(v) ? v : (v ? JSON.parse(v) : []); } catch (e) { return []; } };
    const parseObj = (v) => { try { return (v && typeof v === 'object' && !Array.isArray(v)) ? v : (v ? JSON.parse(v) : {}); } catch (e) { return {}; } };
    return {
      miembroId: r.miembro_id, dinero: Number(r.dinero) || 0,
      militar: Number(r.xp_militar) || 0, cultural: Number(r.xp_cultural) || 0,
      administrativo: Number(r.xp_administrativo) || 0,
      cap: Number(r.cap_inventario) || 8, inv: parseInv(r.inventario), ahorro: Number(r.ahorro) || 0,
      casaPos: r.casa_pos || null, casaInv: parseInv(r.casa_inv), equipado: parseInv(r.equipado),
      heridas: Math.max(0, Math.min(3, Number(r.heridas) || 0)),
      secuelas: parseInv(r.secuelas),
      escaramuzaCd: Number(r.escaramuza_cd) || 0, sendas: parseObj(r.sendas),
      caballo: (r.caballo && typeof r.caballo === 'object') ? r.caballo : (r.caballo ? (function () { try { return JSON.parse(r.caballo); } catch (e) { return null; } })() : null),
    };
  }
  async function load() {
    try {
      const client = await sb();
      const { data, error } = await client.from(TABLE).select('*');
      if (error) throw error;
      cache = (data || []).map(rowToObj); ok = true;
    } catch (e) {
      console.warn('[HacStats] tabla no disponible (¿falta mecenas_stats.sql?):', e && e.message || e);
      cache = []; ok = false;
    }
    return cache;
  }
  function ready() { return readyPromise || (readyPromise = load()); }
  function reload() { readyPromise = load(); return readyPromise; }

  function row(mid) { return cache.find(r => r.miembroId === mid) || null; }
  function ensure(mid) { let r = row(mid); if (!r) { r = { miembroId: mid, dinero: 0, militar: 0, cultural: 0, administrativo: 0, cap: 8, inv: [], ahorro: 0, casaPos: null, casaInv: [], equipado: [], heridas: 0, secuelas: [], sendas: {}, caballo: null }; cache.push(r); } if (!r.sendas) r.sendas = {}; return r; }
  // HERIDAS (0..3). Se infligen al fracasar/arriesgar en expediciones y escaramuzas.
  // PESAN: penalizan la recompensa (dinero+XP) y suben el riesgo; a 3 el mecenas
  // está MALHERIDO y no puede salir de la finca hasta curarse.
  function heridas(mid) { const r = row(mid); return r ? (r.heridas || 0) : 0; }
  // Penalización por heridas (fracción 0..0.45): −15 % por herida sobre lo ganado.
  function penHerida(mid) { return Math.min(0.45, (heridas(mid) || 0) * 0.15); }
  // Malherido: 3/3 → bloquea salir a expediciones y escaramuzas.
  function malherido(mid) { return heridas(mid) >= 3; }
  // SECUELAS permanentes (cosméticas): ids ['manco','tuerto',…] de peregrinajes
  // fallidos. Las escribe la RPC peregrinaje_resolver (server-side); aquí solo se
  // leen (persist NO las incluye en rowData → nunca las pisa el cliente).
  function secuelas(mid) { const r = row(mid); return r ? (r.secuelas || []).slice() : []; }
  function tieneSecuela(mid, t) { return secuelas(mid).indexOf(t) >= 0; }
  function escaramuzaCd(mid) { const r = row(mid); return r ? (r.escaramuzaCd || 0) : 0; }
  function herir(mid, n) { const r = ensure(mid); r.heridas = Math.max(0, Math.min(3, (r.heridas || 0) + (n == null ? 1 : n))); persist(r); return r.heridas; }
  function curar(mid, n) { return herir(mid, -(n == null ? 1 : n)); }
  function dinero(mid) { const r = row(mid); return r ? r.dinero : 0; }
  function ahorro(mid) { const r = row(mid); return r ? r.ahorro : 0; }
  function casaPos(mid) { const r = row(mid); return r ? r.casaPos : null; }
  // Conjunto de posiciones "gx,gy" de casas YA compradas por algún mecenas.
  function casasReclamadas() { const s = new Set(); cache.forEach(r => { if (r.casaPos) s.add(r.casaPos); }); return s; }
  // miembroId (=personajeId) del dueño de una casa en "gx,gy", o null.
  function duenoDeCasa(pos) { const r = cache.find(x => x.casaPos === pos); return r ? r.miembroId : null; }
  function xp(mid, dom) { const r = row(mid); return r ? (r[dom] || 0) : 0; }
  function capInventario(mid) { const r = row(mid); return r ? r.cap : 8; }
  function inventario(mid) { const r = row(mid); return r ? r.inv.slice() : []; }
  function casaInventario(mid) { const r = row(mid); return r ? r.casaInv.slice() : []; }
  function equipados(mid) { const r = row(mid); return r ? r.equipado.slice() : []; }
  function ocupadas(mid) { const r = row(mid); return r ? r.inv.reduce((s, it) => s + (it.n || 1), 0) : 0; }
  const MAX_EQUIP = 3;
  // Bono total de un dominio por los objetos EQUIPADOS (武/文/政), CAPADO a +3 por
  // dominio: el equipo ayuda pero no trivializa (antes apilar 3 libros daba +6/+9 y
  // dejaba un dominio entero al riesgo mínimo). Con el tope, conviene repartir los 3
  // huecos entre dominios en vez de amontonarlos en uno.
  const CAP_EQUIP_DOM = 3;
  function bonus(mid, dom) {
    const r = row(mid); if (!r || !window.HacTienda) return 0;
    let s = 0; r.equipado.forEach(id => { const b = HacTienda.equipBonus(id); if (b && b[dom]) s += b[dom]; });
    return Math.min(CAP_EQUIP_DOM, s);
  }
  // Bono % del equipo: dinero (suma de dineroPct) y ahorro de tiempo de expedición
  // (suma de expedPct, tope 0.6 para no llegar a 0). Fracciones (0.05 = 5%).
  function bonusDinero(mid) { const r = row(mid); if (!r || !window.HacTienda) return 0; let s = 0; r.equipado.forEach(id => { const b = HacTienda.equipBonus(id); if (b && b.dineroPct) s += b.dineroPct; }); return s; }
  function bonusExped(mid) { const r = row(mid); if (!r || !window.HacTienda) return 0; let s = 0; r.equipado.forEach(id => { const b = HacTienda.equipBonus(id); if (b && b.expedPct) s += b.expedPct; }); return Math.min(0.6, s); }
  // Usa un MANUAL de la mochila: +XP fija y se consume. Admite dos formas de efecto:
  //   { dom, xp }              → clásico, un solo dominio.
  //   { xp: { dom: n, … } }    → multi-dominio (libros de conclusiones de combo).
  // Devuelve { ok, ganado:{dom:xp}, dom?, xp? } (dom/xp por compatibilidad si es simple).
  function usarManual(mid, id) {
    const m = window.HacTienda && HacTienda.manualDe ? HacTienda.manualDe(id) : null;
    if (!m) return { ok: false, motivo: 'No es un manual' };
    const r = ensure(mid);
    if (!quita(r.inv, id)) return { ok: false, motivo: 'No lo llevas en la mochila' };
    const ganado = {};
    if (m.xp && typeof m.xp === 'object') {                    // forma multi-dominio
      Object.keys(m.xp).forEach(d => { if (DOMS.indexOf(d) >= 0) { r[d] += (m.xp[d] || 0); ganado[d] = m.xp[d] || 0; } });
    } else if (DOMS.indexOf(m.dom) >= 0) {                     // forma clásica {dom, xp}
      r[m.dom] += (m.xp || 0); ganado[m.dom] = m.xp || 0;
    }
    persist(r);
    const simple = !(m.xp && typeof m.xp === 'object');
    return { ok: true, ganado, dom: simple ? m.dom : null, xp: simple ? (m.xp || 0) : null };
  }
  function nivelTotal(mid, dom) { return nivel(mid, dom) + bonus(mid, dom); }
  // Equipa un objeto de la MOCHILA (máx 3). Devuelve {ok, motivo}.
  function equipar(mid, id) {
    const r = ensure(mid);
    if (!window.HacTienda || !HacTienda.equipBonus(id)) return { ok: false, motivo: 'No es equipable' };
    if (r.equipado.length >= MAX_EQUIP) return { ok: false, motivo: 'Ya llevas 3 objetos equipados' };
    if (!quita(r.inv, id)) return { ok: false, motivo: 'No lo tienes en la mochila' };
    r.equipado.push(id); persist(r); return { ok: true };
  }
  // Desequipa (vuelve a la mochila si hay sitio). Devuelve {ok, motivo}.
  function desequipar(mid, id) {
    const r = ensure(mid);
    const i = r.equipado.indexOf(id); if (i < 0) return { ok: false, motivo: 'No está equipado' };
    if (cuenta(r.inv) >= r.cap) return { ok: false, motivo: 'Mochila llena' };
    r.equipado.splice(i, 1); mete(r.inv, id); persist(r); return { ok: true };
  }
  const cuenta = (arr) => arr.reduce((s, it) => s + (it.n || 1), 0);
  function quita(arr, id) { const e = arr.find(x => x.id === id); if (!e) return false; e.n = (e.n || 1) - 1; if (e.n <= 0) arr.splice(arr.indexOf(e), 1); return true; }
  function mete(arr, id) { const e = arr.find(x => x.id === id); if (e) e.n = (e.n || 1) + 1; else arr.push({ id, n: 1 }); }

  let caballoCol = true;   // false si la columna `caballo` aún no existe (falta caballo.sql)
  async function persist(r) {
    // ── SEGURIDAD ANTI-PISOTÓN ────────────────────────────────────────────
    // persist() hace un UPSERT de la FILA COMPLETA (xp, dinero, inventario…).
    // Si escribiéramos una fila fabricada por ensure() cuando la caché NO
    // refleja la BD, machacaríamos el XP/dinero reales con ceros. Eso pasaba
    // cuando load() fallaba (fallo transitorio de red → ok=false, caché vacía)
    // o iba en curso: una mutación fabricaba {mid, todo a 0} y el upsert lo
    // volcaba, "reseteando" al mecenas a nivel 1. Dos guardas lo impiden:
    //   1) ok===false  → la carga inicial NUNCA tuvo éxito: no escribimos.
    //   2) r fuera de la caché actual → quedó huérfana tras un (re)load: la
    //      caché recargada es la verdad; descartamos la escritura obsoleta.
    // Con ok===true la caché tiene TODAS las filas de la BD, así que ensure()
    // devuelve la fila real (no fabrica), y un mecenas nuevo (fila a 0 legítima)
    // sí está en la caché → se persiste bien.
    await ready();
    if (!ok) { console.warn('[HacStats] persist omitido: datos no cargados (evita resetear stats)'); return; }
    if (cache.indexOf(r) < 0) { console.warn('[HacStats] persist omitido: fila desincronizada tras recarga'); return; }
    try {
      const client = await sb();
      const rowData = {
        miembro_id: r.miembroId, dinero: r.dinero, xp_militar: r.militar, xp_cultural: r.cultural,
        xp_administrativo: r.administrativo, cap_inventario: r.cap, inventario: r.inv, ahorro: r.ahorro,
        casa_pos: r.casaPos, casa_inv: r.casaInv, equipado: r.equipado, heridas: r.heridas || 0, sendas: r.sendas || {}, actualizado: new Date().toISOString(),
      };
      if (caballoCol) rowData.caballo = r.caballo || null;
      let { error } = await client.from(TABLE).upsert(rowData);
      // Si la columna `caballo` no existe todavía, reintenta SIN ella para no perder
      // el resto de stats (el caballo no persistirá hasta ejecutar caballo.sql).
      if (error && caballoCol && /caballo/i.test(String(error.message || ''))) {
        caballoCol = false; delete rowData.caballo;
        ({ error } = await client.from(TABLE).upsert(rowData));
      }
      if (error) throw error;
    } catch (e) { console.error('[HacStats] persist', e); }
  }

  // Guarda A SALVO en casa: mueve dinero del monedero al ahorro (requiere casa).
  // n omitido = guarda TODO lo que lleva encima. Devuelve lo guardado.
  function guardar(mid, n) {
    const r = ensure(mid);
    const cuanto = Math.max(0, Math.min(r.dinero, n == null ? r.dinero : n));
    if (!cuanto) return 0;
    r.dinero -= cuanto; r.ahorro += cuanto; persist(r);
    return cuanto;
  }
  // Compra (reclama) una casa libre de la finca por `precio`. Una sola escritura
  // (descuenta dinero + fija casa_pos). Devuelve {ok, motivo}.
  function comprarCasa(mid, pos, precio) {
    if (!mid || !pos) return { ok: false, motivo: 'Casa inválida' };
    const r = ensure(mid);
    if (r.casaPos) return { ok: false, motivo: 'Ya tienes casa' };
    if (r.dinero < (precio || 0)) return { ok: false, motivo: 'No tienes suficiente dinero' };
    r.dinero -= (precio || 0); r.casaPos = pos; persist(r);
    return { ok: true };
  }
  // Saca del ahorro al monedero. n omitido = saca TODO. Devuelve lo retirado.
  function sacar(mid, n) {
    const r = ensure(mid);
    const cuanto = Math.max(0, Math.min(r.ahorro, n == null ? r.ahorro : n));
    if (!cuanto) return 0;
    r.ahorro -= cuanto; r.dinero += cuanto; persist(r);
    return cuanto;
  }

  // Curva de nivel: cada nivel n→n+1 cuesta 50·n XP (acumulado: 25·n·(n-1)).
  // Curva APLANADA (endgame real): subir es asequible para que niveles altos (hasta
  // ~150 por dominio) sean una meta larga pero alcanzable, no imposible. Coste por
  // nivel ≈ 100 + 3·(n−1) XP → acumulada casi lineal con leve pendiente.
  //   lvl2≈100 · lvl10≈1.008 · lvl50≈8.428 · lvl100≈24.453 · lvl150≈47.978
  const xpAcum = n => Math.round(100 * (n - 1) + 1.5 * (n - 1) * (n - 2));
  function nivel(mid, dom) {
    const x = xp(mid, dom); let n = 1;
    while (n < 999 && xpAcum(n + 1) <= x) n++;
    return n;
  }
  // Nivel TOTAL del personaje = suma de niveles de dominio − 2 (1-1-1 → nivel 1).
  function nivelPersonaje(mid) { return nivel(mid, 'militar') + nivel(mid, 'cultural') + nivel(mid, 'administrativo') - 2; }

  // ── SENDAS (talentos) ────────────────────────────────────────────────────
  // Puntos ganados = 1 por cada 8 niveles de stat subidos (suma de niveles − 3).
  function puntosTalento(mid) { const s = nivel(mid, 'militar') + nivel(mid, 'cultural') + nivel(mid, 'administrativo') - 3; return Math.floor(Math.max(0, s) / 8); }
  function talentos(mid) { const r = row(mid); if (!r || !r.sendas) return []; return Object.keys(r.sendas).reduce((acc, k) => acc.concat(r.sendas[k] || []), []); }
  function puntosGastados(mid) { return talentos(mid).length; }
  function puntosLibres(mid) { return Math.max(0, puntosTalento(mid) - puntosGastados(mid)); }
  function tieneTalento(mid, id) { return talentos(mid).indexOf(id) >= 0; }
  function aprenderTalento(mid, dom, id) { const r = ensure(mid); if (!r.sendas[dom]) r.sendas[dom] = []; if (r.sendas[dom].indexOf(id) < 0) { r.sendas[dom].push(id); persist(r); } return r.sendas; }
  function progresoNivel(mid, dom) {
    const x = xp(mid, dom), n = nivel(mid, dom);
    const base = xpAcum(n), next = xpAcum(n + 1), span = next - base;
    return { nivel: n, xp: x, falta: Math.max(0, next - x), pct: span ? Math.min(1, (x - base) / span) : 0 };
  }

  // Recompensa de una expedición (BAJA, tuneable). XP al dominio + dinero.
  function recompensaExped(dom, durSeg) {
    const mins = (durSeg || 120) / 60;
    return { dom: DOMS.indexOf(dom) >= 0 ? dom : null, xp: Math.max(8, Math.round(mins * 12)), dinero: Math.max(5, Math.round(mins * 9)) };
  }

  async function award(mid, gain) {
    if (!mid || !gain) return;
    const r = ensure(mid);
    if (gain.dinero) r.dinero += gain.dinero;
    if (gain.xp) for (const d of DOMS) if (gain.xp[d]) r[d] += gain.xp[d];
    persist(r);
    return r;
  }

  // ── ADMIN: fija los NIVELES de dominio de un mecenas (NPC) ────────────────
  // Los mecenas NPC no tienen fila en mecenas_stats → salen a nivel 1 en todo
  // (1-1-1). Esto es un problema para retos por stats (p. ej. debatir con Cao
  // Cao). El admin fija el NIVEL de cada dominio y aquí lo traducimos al XP
  // MÍNIMO de ese nivel (xpAcum), de modo que nivel()/nivelTotal() devuelvan
  // exactamente lo pedido y el resto de la mecánica (curva, sendas) siga valiendo.
  // `niveles` = { militar?, cultural?, administrativo? } (1..999). Solo escribe
  // los dominios presentes; el resto de la fila (dinero, inventario…) se preserva.
  function nivelAXp(n) { return xpAcum(Math.max(1, Math.min(999, n | 0))); }
  function setNiveles(mid, niveles) {
    if (!mid || !niveles) return null;
    const r = ensure(mid);
    for (const d of DOMS) if (niveles[d] != null) r[d] = nivelAXp(niveles[d]);
    persist(r);
    return r;
  }

  // Compra de un artículo del mercado: descuenta dinero y aplica el efecto en una
  // sola escritura (XP / ampliación de inventario / objeto guardado). La energía
  // (comida) la añade quien llama vía HacEnergia. Devuelve {ok, motivo}.
  function comprar(mid, item, precioOverride) {
    if (!mid || !item) return { ok: false, motivo: 'Artículo inválido' };
    const r = ensure(mid), ef = item.efecto || {};
    const precio = (precioOverride != null) ? Math.max(0, precioOverride | 0) : item.precio;   // descuento del mercado (政)
    const aInv = ef.guardable || ef.equip || ef.manual;   // objetos, equipables y manuales van a la MOCHILA
    if (r.dinero < precio) return { ok: false, motivo: 'No tienes suficiente dinero' };
    if (aInv && ocupadas(mid) >= r.cap) return { ok: false, motivo: 'Inventario lleno' };
    r.dinero -= precio;
    if (ef.xp) for (const d of DOMS) if (ef.xp[d]) r[d] += ef.xp[d];
    if (ef.capInv) r.cap += ef.capInv;
    if (aInv) mete(r.inv, item.id);
    persist(r);
    return { ok: true };
  }

  // Da un objeto (botín de misión) a la MOCHILA si hay sitio. {ok, motivo}.
  function darItem(mid, id) {
    if (!window.HacTienda || !HacTienda.get(id)) return { ok: false, motivo: 'Objeto inválido' };
    const r = ensure(mid);
    if (ocupadas(mid) >= r.cap) return { ok: false, motivo: 'Mochila llena' };
    mete(r.inv, id); persist(r); return { ok: true };
  }
  // Quita UN objeto de la mochila sin más efecto (p.ej. al DONARLO al fundador). Devuelve {ok}.
  function quitarItem(mid, id) { const r = ensure(mid); if (!quita(r.inv, id)) return { ok: false, motivo: 'No llevas ese objeto' }; persist(r); return { ok: true }; }
  // Mete un objeto de la MOCHILA al almacén de CASA (requiere casa).
  function meterEnCasa(mid, id) {
    const r = ensure(mid);
    if (!r.casaPos) return { ok: false, motivo: 'No tienes casa' };
    if (!quita(r.inv, id)) return { ok: false, motivo: 'No llevas ese objeto' };
    mete(r.casaInv, id); persist(r); return { ok: true };
  }
  // Saca un objeto de CASA a la MOCHILA (respeta la capacidad de la mochila).
  function sacarDeCasa(mid, id) {
    const r = ensure(mid);
    if (cuenta(r.inv) >= r.cap) return { ok: false, motivo: 'Mochila llena' };
    if (!quita(r.casaInv, id)) return { ok: false, motivo: 'No está en casa' };
    mete(r.inv, id); persist(r); return { ok: true };
  }
  // ABANDONO (lo decide el PROPIO jugador): se marcha de la hacienda llevándose
  // su progreso (xp), lo equipado, la mochila (ya limitada por `cap`) y el dinero
  // que le quepa en los BOLSILLOS (`bolsillo`). Deja atrás la casa (propiedad +
  // bóveda `ahorro` + objetos guardados) y las monedas que no le caben encima.
  // Devuelve un resumen {dineroLlevado, dineroPerdido, ahorroPerdido, objetosCasa, casa}.
  function abandonar(mid, bolsillo) {
    const r = ensure(mid);
    const tope = Math.max(0, bolsillo | 0);
    const llevado = Math.min(r.dinero, tope);
    const resumen = {
      dineroLlevado: llevado,
      dineroPerdido: Math.max(0, r.dinero - llevado),
      ahorroPerdido: r.ahorro,
      objetosCasa: cuenta(r.casaInv),
      casa: !!r.casaPos,
    };
    r.dinero = llevado; r.ahorro = 0; r.casaInv = []; r.casaPos = null;
    persist(r);
    return resumen;
  }
  // ADMIN: libera la casa de un mecenas (al expulsarlo). Update PARCIAL (solo
  // casa_pos) para no pisar el dinero/inventario que el jugador haya cambiado.
  async function liberarCasa(mid) {
    const r = row(mid); if (r) r.casaPos = null;        // optimista en caché
    try {
      const client = await sb();
      const { error } = await client.from(TABLE).update({ casa_pos: null }).eq('miembro_id', mid);
      if (error) throw error;
    } catch (e) { console.error('[HacStats] liberarCasa', e); }
  }

  // ── CABALLO (mascota única con nombre; ronda por fuera de la finca) ───────
  function caballo(mid) { const r = row(mid); return (r && r.caballo) ? r.caballo : null; }
  function tieneCaballo(mid) { return !!caballo(mid); }
  // Compra ÚNICA (uno por mecenas, sea la variante que sea): descuenta el precio,
  // guarda QUÉ caballo (variante) y su nombre. Devuelve {ok, motivo}.
  function comprarCaballo(mid, variante, nombre, precio) {
    if (!mid) return { ok: false, motivo: 'Sin mecenas' };
    const r = ensure(mid);
    if (r.caballo) return { ok: false, motivo: 'Ya tienes un caballo' };
    const p = Math.max(0, precio | 0);
    if (r.dinero < p) return { ok: false, motivo: 'No tienes suficiente dinero' };
    const nom = String(nombre || '').trim().slice(0, 24) || 'Corcel';
    r.dinero -= p; r.caballo = { id: variante || 'caballo', nombre: nom, ms: Date.now() };
    persist(r); return { ok: true, caballo: r.caballo };
  }
  // VENDER un objeto de la mochila por `precio` (lo negocia la página con el regateo).
  function venderItem(mid, id, precio) {
    const r = ensure(mid);
    if (!quita(r.inv, id)) return { ok: false, motivo: 'No llevas ese objeto' };
    r.dinero += Math.max(0, precio | 0);
    persist(r); return { ok: true, dinero: r.dinero };
  }

  return { ready, reload, dinero, ahorro, casaPos, casasReclamadas, duenoDeCasa, comprarCasa, liberarCasa, abandonar, heridas, penHerida, malherido, herir, curar, secuelas, tieneSecuela, escaramuzaCd, bonusDinero, bonusExped, usarManual, xp, nivel, progresoNivel, bonus, nivelTotal, nivelPersonaje, setNiveles, puntosTalento, talentos, puntosGastados, puntosLibres, tieneTalento, aprenderTalento, equipados, equipar, desequipar, MAX_EQUIP, award, comprar, guardar, sacar, darItem, quitarItem, meterEnCasa, sacarDeCasa, inventario, casaInventario, capInventario, ocupadas, recompensaExped, caballo, tieneCaballo, comprarCaballo, venderItem, DOMS, dbOk: () => ok, TABLE };
})();
if (typeof window !== 'undefined') window.HacStats = HacStats;
