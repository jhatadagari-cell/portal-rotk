/* ═══════════════════════════════════════════════════════════════════════
   hac-prod.js — HACIENDA PRODUCTIVA (Fase 1, PERSONAL). Datos + cálculo puro.
   ─────────────────────────────────────────────────────────────────────────
   3 oficios atados a dominio (forja 武 · letras 文 · campo 政). El jugador
   TRABAJA un oficio (jornada = empujar la suerte: cada esfuerzo cuesta energía,
   da recursos con CALIDAD y sube la fatiga; una chapuza estropea parte del lote)
   y además una RENTA pasiva pequeña gotea al almacén. Los recursos cumplen
   ENCARGOS diarios (dinero + prestigio) o se venden.

   Estado (personal, en mecenas_stats.produccion vía HacStats):
     { recursos:{ rec:{ "1":n,… } }, oficios:{ of:{nivel,ts} }, encargos:{dia,hechos:[]} }

   Este módulo NO toca red ni estado: solo define catálogo y fórmulas. La
   orquestación (energía/XP/mercado/persistencia) la hace hacienda-page + HacStats.
   ═══════════════════════════════════════════════════════════════════════ */
const HacProd = (function () {
  'use strict';
  const G = { militar: '武', cultural: '文', administrativo: '政' };

  // ── Recursos (materia prima) ─────────────────────────────────────────────
  const RECURSOS = Object.freeze({
    hierro: { nombre: 'Hierro',        zh: '鐵', icon: '⛓️', dom: 'militar',        base: 3 },
    tinta:  { nombre: 'Tinta y papel', zh: '紙墨', icon: '🖋️', dom: 'cultural',       base: 3 },
    grano:  { nombre: 'Grano',         zh: '粟', icon: '🌾', dom: 'administrativo', base: 2 },
  });
  // ── Oficios (un recurso cada uno) ────────────────────────────────────────
  const OFICIOS = Object.freeze({
    forja:  { nombre: 'Forja',   zh: '鍛冶', icon: '🔨', recurso: 'hierro', dom: 'militar',        verbo: 'Forjar',   accion: 'martillas',
      frases: ['Calientas el hierro al rojo', 'Martilleas sobre el yunque', 'Templas el filo en agua', 'Repujas la pieza a golpes', 'Afinas el temple con paciencia'] },
    letras: { nombre: 'Letras',  zh: '翰墨', icon: '🖌️', recurso: 'tinta',  dom: 'cultural',       verbo: 'Escribir', accion: 'trazas',
      frases: ['Mojas el pincel en la tinta', 'Trazas los caracteres con pulso', 'Muelas más barra de tinta', 'Secas el papel al aire', 'Corriges un trazo con esmero'] },
    campo:  { nombre: 'Campos',  zh: '田', icon: '🌱', recurso: 'grano',  dom: 'administrativo', verbo: 'Cosechar', accion: 'siegas',
      frases: ['Siegas las espigas maduras', 'Atas los haces de grano', 'Aventas para separar la paja', 'Cargas los cestos al granero', 'Escoges el mejor grano'] },
  });
  const OFICIO_IDS = Object.keys(OFICIOS);
  const RECURSO_IDS = Object.keys(RECURSOS);
  const NIVEL_MAX = 5;

  // ── Constantes (tuneables) ───────────────────────────────────────────────
  const E_ESF = 8;                 // energía por esfuerzo de jornada
  const XP_UD = 3;                 // XP de dominio por unidad producida (al cerrar lote)
  const CHAPUZA_PERDIDA = 0.40;    // fracción del lote que se estropea en una chapuza
  const RENTA_CAP_POR_NIVEL = 10;  // tope de almacén por renta = 10 × nivel del oficio
  const ENCARGOS_POR_DIA = 3;

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // ── RENTA pasiva ──────────────────────────────────────────────────────────
  // Goteo pequeño (≈20% del total; el grueso es trabajar). Calidad SIEMPRE 1.
  const rentaPorHora = (nivelOficio) => Math.ceil((nivelOficio || 1) / 2);      // 1,1,2,2,3
  const rentaCap = (nivelOficio) => RENTA_CAP_POR_NIVEL * (nivelOficio || 1);

  // ── JORNADA (empujar la suerte) ────────────────────────────────────────────
  // Resultado de UN esfuerzo. rng∈[0,1). Devuelve {rinde, cal, fatiga, chapuza}.
  function esfuerzo(nivDom, nivOficio, fatigaPrev, esfIdx, rng, rng2) {
    const rinde = 2 + Math.floor((nivDom || 1) / 3) + Math.floor((nivOficio || 1) / 2);
    const centro = 1 + Math.floor(((nivDom || 1) + (nivOficio || 1)) / 4);
    // Techo de calidad: nivel 1 ya alcanza cal 3 (para que los encargos cal≥3 NUNCA
    // sean imposibles de raíz); subir el oficio da acceso a cal 4 y 5 y sube la media.
    const calMax = Math.min(NIVEL_MAX, 2 + (nivOficio || 1));
    const cal = clamp(Math.round(centro + ((rng2 == null ? 0.5 : rng2) - 0.5) * 2), 1, calMax);
    const fatiga = fatigaPrev + 0.14 + 0.02 * (esfIdx || 0);
    const pChapuza = Math.pow(clamp(fatiga - 0.30, 0, 1), 2) * (1 - Math.min(0.5, (nivDom || 1) * 0.02));
    const chapuza = (rng == null ? Math.random() : rng) < pChapuza;
    return { rinde, cal, fatiga, chapuza, pChapuza };
  }

  // ── ENCARGOS diarios (deterministas por día + hacienda) ─────────────────────
  function diaStr() { const t = (typeof window !== 'undefined' && window.HacClock && HacClock.now) ? HacClock.now() : Date.now(); const d = new Date(t); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
  function encargosDelDia(haciendaId, tier) {
    const dia = diaStr();
    const rng = (typeof window !== 'undefined' && window.HacRand && HacRand.make) ? HacRand.make('prod-enc-' + (haciendaId || '') + '-' + dia) : { next: () => Math.random() };
    const out = [];
    for (let i = 0; i < ENCARGOS_POR_DIA; i++) {
      const rec = RECURSO_IDS[Math.floor(rng.next() * RECURSO_IDS.length)];
      const calMin = 1 + Math.floor(rng.next() * 3);                                  // 1..3
      const cantidad = Math.round((8 + rng.next() * 10) * (1 + 0.15 * ((tier || 1) - 1)));  // ~8..18, escala con tier
      const dinero = Math.round(cantidad * calMin * 4);
      const prestigio = Math.max(1, Math.round(cantidad * calMin * 0.6));
      out.push({ id: 'enc-' + dia + '-' + i, dia, recurso: rec, calMin, cantidad, dinero, prestigio });
    }
    return out;
  }

  // ── Economía ────────────────────────────────────────────────────────────
  const precioVenta = (rec, cal) => Math.max(1, (RECURSOS[rec] ? RECURSOS[rec].base : 1) * (cal || 1));
  // Coste de subir un oficio de nivel n→n+1: uds del propio recurso (cal≥2) + dinero.
  const costeMejora = (nivelActual) => ({ uds: 20 * (nivelActual || 1), calMin: 2, dinero: 80 * (nivelActual || 1) });

  return {
    RECURSOS, OFICIOS, OFICIO_IDS, RECURSO_IDS, NIVEL_MAX, GLIFOS: G,
    E_ESF, XP_UD, CHAPUZA_PERDIDA, ENCARGOS_POR_DIA,
    rentaPorHora, rentaCap, esfuerzo, encargosDelDia, diaStr, precioVenta, costeMejora,
  };
})();
if (typeof window !== 'undefined') window.HacProd = HacProd;
