/* ═══════════════════════════════════════════════════════════════════════
   hac-dialog.js — Banco de diálogos de los mecenas (datos de flavor).
   ─────────────────────────────────────────────────────────────────────────
   Separa el CONTENIDO de la lógica (hac-folk). Cada "charla" es una tanda de
   réplicas que se alternan (el iniciador dice las pares; el otro las impares).
   Además de las generales, hay tandas TEMÁTICAS según la aptitud de quien
   inicia la charla, para dar sabor: un guerrero habla de batallas, un erudito
   de versos, etc.   API:  HacDialog.charla(aptitud) · .hail() · .ack()
   Debe cargarse antes que hac-folk.js.
   ═══════════════════════════════════════════════════════════════════════ */
const HacDialog = (function () {
  'use strict';
  const rnd = (HacUtil && HacUtil.rnd) || ((n) => Math.floor(Math.random() * n));
  const pick = (arr) => arr[rnd(arr.length)];

  // Charlas generales (cualquier mecenas) ─────────────────────────────────────
  const GENERAL = [
    ['¿Habéis leído el último edicto de la corte?', 'Lo he leído. Tiempos revueltos se avecinan.', 'El cielo de los Han se oscurece, amigo mío.', 'Mientras quede vino y buena compañía, resistiremos.'],
    ['Vuestra hacienda prospera, lo veo en los campos.', 'El mérito es de quienes la trabajan, no mío.', 'La humildad os honra tanto como el grano.', 'Brindemos por una buena cosecha, pues.'],
    ['¿Qué os parece el nuevo pabellón?', 'Una maravilla. ¿Quién lo diseñó?', 'Un maestro venido de Luoyang, dicen.', 'Se nota la mano del oficio.'],
    ['Os eché de menos en la última reunión.', 'Asuntos de familia me retuvieron.', 'Espero que todo se haya resuelto.', 'El tiempo todo lo resuelve, amigo.'],
    ['Loado sea el juramento del jardín del melocotonero.', 'Tal lealtad es ejemplo para todos nosotros.', 'Ojalá hubiera pactos tan firmes hoy.', 'Brindemos por la hermandad, entonces.'],
    ['El jardín está espléndido esta estación.', 'Las flores no entienden de guerras, por fortuna.', 'Quizá deberíamos imitarlas más.', 'Sabias palabras. Paseemos, pues.'],
    ['¿Habéis visto a los mecenas del norte?', 'Llegaron ayer, con sedas y buenas maneras.', 'Las buenas maneras esconden buenas intenciones… o no.', 'Ja, siempre tan prudente, amigo.'],
  ];

  // Charlas temáticas por aptitud ─────────────────────────────────────────────
  const POR_TEMA = {
    militar: [   // guerrero, caudillo
      ['Dicen que Cao Cao mueve sus ejércitos al sur.', 'Rumores. El Yangtsé no se cruza con rumores.', 'Aun así, conviene afilar las espadas.', 'Y servir más té mientras tanto, digo yo.'],
      ['¿Habéis probado la nueva guardia?', 'Disciplinada como pocas. Buen acero, mejor temple.', 'Un ejército se sostiene en su moral, no en su número.', 'Hablado como un verdadero capitán.'],
      ['Mi alazán cojea desde la última cabalgada.', 'Un buen corcel vale por diez soldados.', 'Y cuesta el doble de alimentar.', '¡Ja! Cierto es, amigo.'],
    ],
    letras: [    // erudito
      ['Compuse unos versos al amanecer.', '¿Y bien? Recitad, no os hagáis de rogar.', '«La grulla parte, el bambú permanece…»', 'Hermoso. Deberíais llevarlos a la corte.'],
      ['¿Conocéis los comentarios al Libro de los Cambios?', 'Los releo cada invierno junto al brasero.', 'Cada lectura revela algo nuevo, ¿verdad?', 'Esa es la marca de un buen texto.'],
      ['La caligrafía del maestro Zhong es sin par.', 'Su trazo respira como un río en calma.', 'Daría una cosecha por una de sus obras.', 'No seríais el primero, amigo.'],
    ],
    estrategia: [  // estratega
      ['Una grulla aislada cae; en bandada, gobierna el cielo.', 'Aplicáis la guerra a las aves, veo.', 'Todo cuanto vuela o repta enseña algo al prudente.', 'Por eso os escucho siempre con atención.'],
      ['El terreno decide la batalla antes que la espada.', 'Y la paciencia, antes que el terreno.', 'Veo que también vos leéis a los antiguos.', 'Quien no aprende del pasado, lo repite.'],
    ],
    gobierno: [  // administrador, canciller
      ['¿Cómo van los tributos este año?', 'Pesados, como las nubes antes de la tormenta.', 'Confiemos en que el otoño sea clemente.', 'Y en que el recaudador llegue tarde.'],
      ['Los graneros del distrito están a rebosar.', 'Buena administración, mejor previsión.', 'Un pueblo que come, no se subleva.', 'Esa es toda la política que hace falta.'],
      ['He revisado los registros de la hacienda.', '¿Y cuadran las cuentas, esta vez?', 'Hasta el último grano de mijo.', 'Sois el orgullo del cuerpo de funcionarios.'],
    ],
  };
  const TEMA_POR_APT = {
    guerrero: 'militar', caudillo: 'militar',
    erudito: 'letras', estratega: 'estrategia',
    administrador: 'gobierno', canciller: 'gobierno',
  };

  // Exclamaciones de llamada a distancia y sus respuestas. {n} = nombre del otro.
  const HAILS = ['¡Eh, {n}! ¡Aguardad!', '¡{n}! ¡Cuánto tiempo!', '¡Vaya, si es {n}!', '¡{n}, amigo mío!', '¡Eh! ¡Por aquí, {n}!', '¡Dichosos los ojos, {n}!'];
  const ACKS = ['¡Oh, {n}!', '¡Vaya sorpresa!', '¡Ya voy, ya voy!', '¡Qué alegría!', '¡{n}, viejo amigo!', '¡Aguardad, que llego!'];

  // Elige una charla; con 60% de probabilidad, temática de la aptitud (si la hay).
  function charla(aptitud) {
    const tema = TEMA_POR_APT[aptitud];
    if (tema && POR_TEMA[tema] && Math.random() < 0.6) return pick(POR_TEMA[tema]);
    return pick(GENERAL);
  }
  const hail = () => pick(HAILS);
  const ack = () => pick(ACKS);

  return { charla, hail, ack };
})();
if (typeof window !== 'undefined') window.HacDialog = HacDialog;
