/* ═══════════════════════════════════════════════════════════════════════
   hac-visita-dialogo.js — VOZ de los NPC cuando los VISITAS en su hacienda.
   ─────────────────────────────────────────────────────────────────────────
   Distinto del enviado (que viene a reclutarte): aquí TÚ vas a su casa y charlas.
   No hay oferta ni «aceptar»: es conocer al personaje por su MIRADA de las cosas.
   Estilo: frases CONCISAS y cargadas — que diga mucho sin soltar discursos. Las
   preguntas abren respuestas con matiz e insight. El chino solo adorna.

   Registro por personaje (hoy solo Guo Jia). Añadir otro = otra entrada en NPCS
   con su matcher de nombre + su charla.

   API: HacVisitaDialogo.tiene(name) → bool
        HacVisitaDialogo.charla(name) → { lineas:[str…], preguntas:[{id,label,lineas:[str…]}] } | null
   ═══════════════════════════════════════════════════════════════════════ */
const HacVisitaDialogo = (function () {
  'use strict';

  // ── Guo Jia 郭嘉 (字 奉孝 Fengxiao) · estratega de Wei · señor: Cao Cao ────────
  // Perspicaz hasta lo incómodo, poco amigo del protocolo, salud frágil y vida a
  // toda prisa. Lee el miedo de la gente y predice por el carácter. Lúcido sobre
  // Cao Cao sin idealizarlo. Presiente su propia muerte temprana y no le importa.
  const GUO_JIA = {
    // Saludo: breve, ya te ha «leído». Nada de reverencias.
    lineas: [
      '抱拳 Guo Jia. Fengxiao, si tenéis prisa; y todos, tarde o temprano, tenéis prisa.',
      'Habéis cruzado medio mundo para mirar Luoyang. Curiosidad, no reverencia. Mejor así: la reverencia miente.',
      'Preguntad sin rodeos. Respondo mejor de lo que la gente se atreve a preguntar.'
    ],
    preguntas: [
      { id: 'leer', label: '¿Cómo leéis así a la gente?', lineas: [
        'No leo hombres. Leo lo que temen perder.',
        'Quitadle a alguien lo que guarda y sabréis de qué es capaz. Todo lo demás es disfraz.',
        'A vos, por ejemplo, no os asusta perder. Os asusta llegar tarde. Interesante.'
      ] },
      { id: 'caocao', label: 'Habladme de Cao Cao.', lineas: [
        'Cruel cuando conviene, espléndido cuando conviene. La virtud le estorba; el resultado, jamás.',
        'Le sirvo porque no me exige fingir. Rara franqueza, en un hombre que podría matarme por un gesto.',
        'Lo llaman tirano. Lo es. También es el único que construye algo que le sobrevivirá.'
      ] },
      { id: 'wei', label: '¿Por qué Wei, y no Shu ni Wu?', lineas: [
        'Shu os vende un sueño; Wu, un río. Wei vende lo único que se hereda: orden.',
        'Los sueños se pudren. Los ríos se cruzan — preguntad en Chibi… bueno, aún no. Ya lo haréis.',
        'El orden es aburrido. Por eso dura.'
      ] },
      { id: 'vos', label: '¿Y vos? ¿Qué queréis?', lineas: [
        'Ver el final de la partida antes que nadie. Y vivir deprisa mientras llega.',
        'No me pidáis mesura. La mesura es para quien cree que le sobra tiempo.',
        'A mí no me sobra. Lo sé desde hace años. No me quita el sueño; me lo llena.'
      ] },
      { id: 'futuro', label: '¿Cómo acabará todo esto?', lineas: [
        'Con Cao Cao en lo alto y muchos hombres buenos debajo, enterrados por elegir tarde.',
        'No os diré de qué lado poneros. Solo esto: el que duda, paga.',
        'Y vos habéis venido a mirar antes de decidir. Eso ya dice de qué madera sois.'
      ] }
    ]
  };

  const esGuoJia = (n) => /guo\s*jia|郭嘉|奉孝|fengxiao/i.test(String(n || ''));

  const NPCS = [{ match: esGuoJia, set: GUO_JIA }];

  function buscar(name) { const e = NPCS.find(x => x.match(name)); return e ? e.set : null; }
  function tiene(name) { return !!buscar(name); }
  function charla(name) {
    const s = buscar(name);
    if (!s) return null;
    return {
      lineas: s.lineas.slice(),
      preguntas: (s.preguntas || []).map(p => ({ id: p.id, label: p.label, lineas: p.lineas.slice() }))
    };
  }

  return { tiene, charla };
})();
if (typeof window !== 'undefined') window.HacVisitaDialogo = HacVisitaDialogo;
