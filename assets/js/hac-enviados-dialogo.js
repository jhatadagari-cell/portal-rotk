/* ═══════════════════════════════════════════════════════════════════════
   hac-enviados-dialogo.js — VOZ de los enviados (flavor de la acción «Hablar»).
   ─────────────────────────────────────────────────────────────────────────
   Guion breve por enviado: elogios, personalidad y preocupaciones, para que el
   jugador entienda quién es y por qué ha venido. El chino solo ADORNA; el texto
   accionable va siempre en castellano. Se elige por facción/nombre; si no hay
   set propio, cae a un guion cortés genérico.

   API: HacEnviadoDialogo.lineas({ name, faccion }) → [string, …]
   ═══════════════════════════════════════════════════════════════════════ */
const HacEnviadoDialogo = (function () {
  'use strict';

  // Fei Yi 费祎 (字 文偉), enviado de Shu — cálido, agudo, imperturbable. Trae
  // elogios y la mano tendida de la alianza; le preocupa la paz del labrador.
  const FEI_YI = [
    '抱拳 Fei Yi, de Chengdu, para serviros… pero llamadme Wenwei, os lo ruego; los amigos así lo hacen, y espero contaros pronto entre ellos.',
    'Vuestra hacienda luce mejor de lo que me prometieron… y me prometieron mucho.',
    'Descuidad: no traigo ejércitos ni amenazas veladas. Solo palabras — y algo de vino, si vuestro fundador es de buen beber.',
    'Shu no busca vasallos, sino amigos. Estas tierras son demasiado hermosas para que las incendiemos entre todos por una bandera.',
    'Una cosa me quita el sueño: que hombres de bien se maten mientras el labrador pierde su cosecha. Eso, y quedarme sin té.',
    'Si vuestro señor gusta de conversar, sabré escuchar más de lo que hablo. Rara virtud en un enviado, lo sé.',
    'Aguardaré junto a vuestro portón. La paciencia es la única disciplina que domino del todo.'
  ];

  const GENERICO = [
    '抱拳 Un enviado de tierras amigas os saluda con respeto.',
    'No vengo a exigir nada, solo a estrechar lazos entre casas honorables.',
    'Corren tiempos recios; más vale contar amigos que enemigos.',
    'Aguardaré ante vuestro portón por si vuestro señor desea recibirme.'
  ];

  function lineas(o) {
    o = o || {};
    const name = String(o.name || '');
    const fac = String((o.faccion && (o.faccion.nombre || o.faccion.zh)) || o.faccion || '');
    if (/fei\s*yi|費禕|费祎/i.test(name) || /shu|蜀/i.test(fac)) return FEI_YI.slice();
    return GENERICO.slice();
  }

  return { lineas };
})();

if (typeof window !== 'undefined') window.HacEnviadoDialogo = HacEnviadoDialogo;
