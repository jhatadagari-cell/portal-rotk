/* ═══════════════════════════════════════════════════════════════════════
   hac-sendas.js — Sendas de aptitud (talentos legendarios). Capa C.
   ─────────────────────────────────────────────────────────────────────────
   Árboles de talentos por dominio. C1: solo 武 (escalera lineal). Cada talento
   pide un mínimo de stats (reqMil / reqTotal) + el talento previo (escalera) +
   1 punto de talento (HacStats.puntosLibres). `activo:false` = visible pero su
   efecto llega en una fase posterior (aún no elegible). Los efectos concretos los
   consume hacienda-page (riesgo, escaramuza, montura, jerarquía…).
   API: arboles(), arbol(dom), talento(id), requisitosOk(mid,id), elegible(mid,id).
   ═══════════════════════════════════════════════════════════════════════ */
const HacSendas = (function () {
  'use strict';
  const ARBOLES = {
    militar: {
      dom: 'militar', zh: '武', nombre: 'Senda del guerrero',
      rungs: [
        { id: 'soldado', zh: '武士', nombre: 'Soldado curtido', reqMil: 10, reqTotal: 0, prev: null, activo: true,
          efecto: 'Aguante: −6% de riesgo en tus expediciones.' },
        { id: 'oficial', zh: '校尉', nombre: 'Oficial', reqMil: 30, reqTotal: 0, prev: 'soldado', activo: true,
          efecto: 'Liderazgo: cuando eres el capitán, tu banda tiene +5% de éxito.' },
        { id: 'tigre', zh: '虎將', nombre: 'General Tigre', reqMil: 70, reqTotal: 0, prev: 'oficial', activo: false,
          efecto: '萬人敵: la banda ignora la primera herida al fracasar. (Próximamente)' },
        { id: 'legendario', zh: '猛將', nombre: 'Guerrero Legendario', reqMil: 150, reqTotal: 200, prev: 'tigre', activo: false,
          efecto: 'Montas a caballo, lanzas escaramuzas en solitario y ostentas el rango de respeto más alto tras el fundador. (Próximamente)' },
      ],
    },
  };
  const arboles = () => Object.keys(ARBOLES).map(k => ARBOLES[k]);
  const arbol = (dom) => ARBOLES[dom] || null;
  function talento(id) {
    const ks = Object.keys(ARBOLES);
    for (let i = 0; i < ks.length; i++) { const t = ARBOLES[ks[i]].rungs.find(r => r.id === id); if (t) return Object.assign({ dom: ARBOLES[ks[i]].dom }, t); }
    return null;
  }
  // ¿cumple stats/total y tiene el talento previo? (no mira puntos ni 'activo')
  function requisitosOk(mid, id) {
    if (!window.HacStats) return { ok: false, mil: 0, tot: 0 };
    const t = talento(id); if (!t) return { ok: false, mil: 0, tot: 0 };
    const mil = HacStats.nivel(mid, 'militar'), tot = HacStats.nivelPersonaje(mid);
    const okReq = mil >= (t.reqMil || 0) && tot >= (t.reqTotal || 0);
    const okPrev = !t.prev || HacStats.tieneTalento(mid, t.prev);
    return { ok: okReq && okPrev, okReq: okReq, okPrev: okPrev, mil: mil, tot: tot };
  }
  // ¿elegible AHORA? (activo + req + previo + tiene punto + no lo tiene ya)
  function elegible(mid, id) {
    const t = talento(id); if (!t || !t.activo) return false;
    if (!window.HacStats || HacStats.tieneTalento(mid, id) || HacStats.puntosLibres(mid) < 1) return false;
    return requisitosOk(mid, id).ok;
  }
  return { ARBOLES, arboles, arbol, talento, requisitosOk, elegible };
})();
if (typeof window !== 'undefined') window.HacSendas = HacSendas;
