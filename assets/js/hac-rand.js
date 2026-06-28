/* ═══════════════════════════════════════════════════════════════════════
   hac-rand.js — PRNG determinista sembrado por cadena.
   ─────────────────────────────────────────────────────────────────────────
   Para que la vida de la finca sea COMPARTIDA: dos clientes que siembran con
   la misma cadena obtienen exactamente la misma secuencia de "azar", así que
   la simulación de mecenas (hac-folk.js) evoluciona idéntica para todos.

   · cyrb128: hash de una cadena → semilla de 32 bits (bien distribuida).
   · mulberry32: generador rápido y determinista a partir de esa semilla.

   API:
     const R = HacRand.make('hacienda-id#epoca');
     R.next()        → real en [0, 1)
     R.int(n)        → entero en [0, n)
     R.range(a, b)   → real en [a, b)
     R.pick(arr)     → un elemento al azar (o undefined si vacío)
     R.chance(p)     → true con probabilidad p
   ═══════════════════════════════════════════════════════════════════════ */
const HacRand = (function () {
  'use strict';

  // Hash de cadena → entero 32-bit (cyrb128, quedándonos con una palabra).
  function hash(str) {
    str = String(str);
    let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
    for (let i = 0, k; i < str.length; i++) {
      k = str.charCodeAt(i);
      h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
      h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
      h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
      h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
    }
    h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
    h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
    h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
    h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
    return (h1 ^ h2 ^ h3 ^ h4) >>> 0;
  }

  // Generador determinista a partir de una semilla de 32 bits.
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function make(seedStr) {
    const next = mulberry32(hash(seedStr));
    return {
      next,
      int: (n) => Math.floor(next() * n),
      range: (a, b) => a + next() * (b - a),
      pick: (arr) => (arr && arr.length) ? arr[Math.floor(next() * arr.length)] : undefined,
      chance: (p) => next() < p,
    };
  }

  return { make, hash };
})();
if (typeof window !== 'undefined') window.HacRand = HacRand;
