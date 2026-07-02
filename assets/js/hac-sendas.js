/* ═══════════════════════════════════════════════════════════════════════
   hac-sendas.js — Sendas de aptitud (talentos legendarios). Capa C.
   ─────────────────────────────────────────────────────────────────────────
   Tres árboles (武/文/政), escalera lineal cada uno. Cada talento pide un mínimo
   del NIVEL de su dominio (req) [+ reqTotal para el capstone] + el talento previo
   + 1 punto de talento (HacStats.puntosLibres). `activo:false` = visible pero su
   efecto llega en fase posterior (no elegible aún). Los efectos los consume
   hacienda-page (riesgo, escaramuza, sucesos, mercado, dinero, montura, jerarquía…).
   API: arboles(), arbol(dom), talento(id), requisitosOk(mid,id), elegible(mid,id).
   ═══════════════════════════════════════════════════════════════════════ */
const HacSendas = (function () {
  'use strict';
  const ARBOLES = {
    militar: {
      dom: 'militar', zh: '武', nombre: 'Senda del guerrero', color: '#b23b2e',
      rungs: [
        { id: 'soldado', zh: '武士', nombre: 'Soldado curtido', req: 10, prev: null, activo: true, efecto: 'Aguante: −6% de riesgo en tus expediciones.' },
        { id: 'oficial', zh: '校尉', nombre: 'Oficial', req: 30, prev: 'soldado', activo: true, efecto: 'Liderazgo: cuando eres el capitán, tu banda tiene +5% de éxito.' },
        { id: 'tigre', zh: '虎將', nombre: 'General Tigre', req: 70, prev: 'oficial', activo: true, efecto: '萬人敵: tu banda ignora la primera herida al fracasar una escaramuza.' },
        { id: 'legendario', zh: '猛將', nombre: 'Guerrero Legendario', req: 150, reqTotal: 200, prev: 'tigre', activo: false, efecto: 'Montas a caballo, lanzas escaramuzas en solitario y ostentas el rango de respeto más alto tras el fundador.' },
      ],
    },
    cultural: {
      dom: 'cultural', zh: '文', nombre: 'Senda del sabio', color: '#3a8a5a',
      rungs: [
        { id: 'estudiante', zh: '書生', nombre: 'Estudiante', req: 10, prev: null, activo: true, efecto: 'Estudio: +8% de XP cultural en misiones.' },
        { id: 'estratega', zh: '謀士', nombre: 'Estratega', req: 30, prev: 'estudiante', activo: true, efecto: 'Planificación: −10% de tiempo de expedición.' },
        { id: 'granestratega', zh: '軍師', nombre: 'Gran estratega', req: 70, prev: 'estratega', activo: true, efecto: 'Genio táctico: la banda usa su mejor stat en los chequeos de sucesos.' },
        { id: 'dragon', zh: '臥龍', nombre: 'Dragón durmiente', req: 150, reqTotal: 200, prev: 'granestratega', activo: false, efecto: 'Previsión: ves y fuerzas el desenlace de un suceso.' },
      ],
    },
    administrativo: {
      dom: 'administrativo', zh: '政', nombre: 'Senda del administrador', color: '#3a6ea5',
      rungs: [
        { id: 'funcionario', zh: '吏', nombre: 'Funcionario', req: 10, prev: null, activo: true, efecto: 'Comercio: −6% en los precios del mercado.' },
        { id: 'gobernador', zh: '太守', nombre: 'Gobernador', req: 30, prev: 'funcionario', activo: true, efecto: 'Fortuna: +10% de dinero en misiones.' },
        { id: 'canciller', zh: '丞相', nombre: 'Canciller', req: 70, prev: 'gobernador', activo: true, efecto: 'Gobierno experto: +30% de prestigio en las tareas internas.' },
        { id: 'heroe', zh: '梟雄', nombre: 'Héroe ambicioso', req: 150, reqTotal: 200, prev: 'canciller', activo: false, efecto: 'Ostentas dos cargos a la vez y te acompaña una escolta.' },
      ],
    },
  };
  const DOMS = ['militar', 'cultural', 'administrativo'];
  const arboles = () => DOMS.map(d => ARBOLES[d]);
  const arbol = (dom) => ARBOLES[dom] || null;
  function talento(id) {
    for (let i = 0; i < DOMS.length; i++) { const t = ARBOLES[DOMS[i]].rungs.find(r => r.id === id); if (t) return Object.assign({ dom: ARBOLES[DOMS[i]].dom }, t); }
    return null;
  }
  // ¿cumple nivel del dominio/total y tiene el talento previo? (no mira puntos ni 'activo')
  function requisitosOk(mid, id) {
    if (!window.HacStats) return { ok: false, lvl: 0, tot: 0 };
    const t = talento(id); if (!t) return { ok: false, lvl: 0, tot: 0 };
    const lvl = HacStats.nivel(mid, t.dom), tot = HacStats.nivelPersonaje(mid);
    const okReq = lvl >= (t.req || 0) && tot >= (t.reqTotal || 0);
    const okPrev = !t.prev || HacStats.tieneTalento(mid, t.prev);
    return { ok: okReq && okPrev, okReq: okReq, okPrev: okPrev, lvl: lvl, tot: tot };
  }
  // ¿elegible AHORA? (activo + req + previo + tiene punto + no lo tiene ya)
  function elegible(mid, id) {
    const t = talento(id); if (!t || !t.activo) return false;
    if (!window.HacStats || HacStats.tieneTalento(mid, id) || HacStats.puntosLibres(mid) < 1) return false;
    return requisitosOk(mid, id).ok;
  }
  return { ARBOLES, arboles, arbol, talento, requisitosOk, elegible, DOMS };
})();
if (typeof window !== 'undefined') window.HacSendas = HacSendas;
