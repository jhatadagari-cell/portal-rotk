/* ═══════════════════════════════════════════════════════════════════════
   hac-dialog.js — Banco de diálogos de los mecenas (datos de flavor).
   ─────────────────────────────────────────────────────────────────────────
   Separa el CONTENIDO de la lógica (hac-folk). Cada "charla" es una tanda de
   réplicas que se alternan (el iniciador dice las pares; el otro las impares).
   Además de las generales, hay tandas TEMÁTICAS según la aptitud de quien
   inicia la charla, para dar sabor: un guerrero habla de batallas, un erudito
   de versos, etc.
   ─────────────────────────────────────────────────────────────────────────
   ESCENAS DIRECTIVAS (por rango): cuando un mecenas de cargo MUY superior se
   cruza con uno muy inferior, no charlan de igual a igual: el superior LIDERA
   y le da una orden, un consejo o una reprimenda; el inferior responde con
   deferencia. El registro lo pone la APTITUD DEL SUPERIOR (un caudillo riñe
   sobre asedios; un guerrero veterano enseña a bajar el orgullo para seguir
   vivo; un estratega aconseja sobre el terreno…). Mismo formato que `charla`:
   el LÍDER (= el superior) dice las réplicas pares; el inferior, las impares.
     API:  HacDialog.charla(aptitud) · .directiva(aptitudSuperior)
           · .hail() · .ack()
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

  // Escenas DIRECTIVAS por aptitud DEL SUPERIOR ──────────────────────────────
  // El superior LIDERA (réplicas pares); el inferior responde con deferencia
  // (impares). El sabor lo marca la aptitud de quien manda.
  const DIRECTIVAS = {
    guerrero: [   // veterano: baja el orgullo y la temeridad; sobrevivir para servir
      ['No corras a la primera línea buscando gloria, muchacho.', 'Lo tendré presente, señor.', 'Un soldado vivo sirve diez años; un héroe muerto, un día.', 'Aprenderé a medir mi arrojo.'],
      ['Vi cómo blandías la lanza: mucho brío, poca guardia.', 'Erré, lo reconozco.', 'El orgullo abre la coraza más que cualquier flecha.', 'Bajaré la cabeza y alzaré el escudo.'],
      ['¿Sabes por qué sigo vivo tras veinte campañas?', 'Decídmelo, os lo ruego.', 'Porque retrocedí cuando otros cargaron. Recuérdalo.', 'No lo olvidaré, señor.'],
      ['La temeridad mató a más bravos que el enemigo.', 'Domaré mi impaciencia.', 'Guarda el furor para cuando decida la batalla, no antes.', 'Así lo haré.'],
    ],
    caudillo: [   // mando: asedios, defensas, órdenes y reprimendas
      ['Refuerza la empalizada del flanco este antes del ocaso.', 'A vuestras órdenes.', 'Un muro descuidado es una invitación al enemigo.', 'No habrá brecha por mi parte, señor.'],
      ['¿Quién dejó el portón sin guardia anoche?', 'Fue un descuido de la ronda, señor.', 'Un descuido cuesta una ciudad. Que no se repita.', 'Respondo de ello con mi cabeza.'],
      ['En el asedio, el agua y el grano vencen antes que el ariete.', 'Tomo nota, mi señor.', 'Asegura los pozos y los graneros lo primero, siempre.', 'Así se hará.'],
      ['Tus hombres avanzan sin orden ni formación.', 'Los he instruido de prisa, lo admito.', 'Una tropa sin disciplina es una turba que muere junta.', 'La haré marchar como un solo hombre.'],
    ],
    estrategia: [  // estratega: terreno, paciencia, concentración de fuerzas
      ['El terreno decide la batalla antes que la espada, recuérdalo.', 'Lo grabaré en mi memoria, maestro.', 'Estudia el río y la colina antes de mover un estandarte.', 'Así lo haré.'],
      ['Tu plan es audaz, pero le falta una retirada.', 'No la había previsto, lo confieso.', 'Quien no deja puerta de salida entrega la victoria al azar.', 'Sabia advertencia. La corregiré.'],
      ['Una grulla aislada cae; en bandada, gobierna el cielo.', '¿Qué queréis decir, señor?', 'Concentra tus fuerzas; no las disperses por orgullo.', 'Comprendo. Las mantendré unidas.'],
      ['Atacas donde el enemigo es fuerte. Necio.', 'Me cegó la prisa.', 'Golpea el vacío, no el lleno; el flanco, no el frente.', 'Reharé el plan con paciencia.'],
    ],
    gobierno: [  // administrador / canciller: cuentas, graneros, mesura política
      ['Estas cuentas no cuadran por tres fanegas de mijo.', 'Revisaré los registros de inmediato, señor.', 'Un grano perdido hoy es una hambruna mañana. Sé escrupuloso.', 'No volverá a faltar ni un grano.'],
      ['Antes de la campaña, llena los graneros, no las arcas.', 'Lo tendré presente.', 'El oro no se come en un invierno de asedio.', 'Sabio consejo; lo aplicaré.'],
      ['Mides tus palabras en la corte con poca prudencia.', 'Hablé de más, lo reconozco.', 'Una lengua suelta derriba más casas que un ejército.', 'Aprenderé a callar a tiempo.'],
      ['No confundas la firmeza con la terquedad, joven.', '¿En qué he errado, señor?', 'El junco que se dobla con el viento no se quiebra. Cede en lo pequeño.', 'Lo tendré siempre presente.'],
    ],
    letras: [    // erudito: corrección culta, lección con cita clásica
      ['Citaste mal a Confucio en la reunión, joven.', 'Os ruego que me corrijáis.', '«Aprender sin pensar es trabajo perdido.» Medita antes de hablar.', 'Vuestra lección me honra, maestro.'],
      ['Tu caligrafía traiciona la prisa de tu espíritu.', 'Lo sé, maestro; me falta sosiego.', 'El trazo sereno nace de la mente serena. Practica.', 'Lo haré cada amanecer.'],
      ['¿Has leído los comentarios al Libro de los Cambios?', 'Solo en parte, lo confieso.', 'Quien gobierna sin leer a los antiguos tropieza dos veces.', 'Los estudiaré sin demora.'],
    ],
  };
  // Aptitud del superior → banco directivo. Las mixtas heredan el eje dominante.
  const DIR_POR_APT = {
    guerrero: 'guerrero', caudillo: 'caudillo', estratega: 'estrategia',
    administrador: 'gobierno', canciller: 'gobierno', erudito: 'letras',
  };
  // Fallback: superior sin aptitud reconocida → consejo de veteranía genérico.
  const DIR_GENERAL = [
    ['Llevas poco bajo este estandarte; observa y aprende.', 'Así lo haré, señor.', 'El respeto se gana sirviendo, no exigiéndolo.', 'Lo tendré presente.'],
    ['Conduce tus asuntos con mesura y honrarás a la casa.', 'Me esforzaré por ello.', 'El nombre de la hacienda pesa también sobre tus hombros.', 'No lo defraudaré.'],
    ['He visto pasar a muchos como tú; pocos perseveran.', 'Yo perseveraré, os lo juro.', 'No lo jures: demuéstralo con los años.', 'Lo demostraré, señor.'],
  ];

  // Exclamaciones de llamada a distancia y sus respuestas. {n} = nombre del otro.
  const HAILS = ['¡Eh, {n}! ¡Aguardad!', '¡{n}! ¡Cuánto tiempo!', '¡Vaya, si es {n}!', '¡{n}, amigo mío!', '¡Eh! ¡Por aquí, {n}!', '¡Dichosos los ojos, {n}!'];
  const ACKS = ['¡Oh, {n}!', '¡Vaya sorpresa!', '¡Ya voy, ya voy!', '¡Qué alegría!', '¡{n}, viejo amigo!', '¡Aguardad, que llego!'];

  // ── HERMANDAD del jardín de los melocotoneros (Liu Bei · Guan Yu · Zhang Fei) ──
  // Cuando dos de los tres hermanos jurados se cruzan, no charlan como conocidos: se
  // tratan de hermano y evocan su juramento, su lealtad y sus batallas. {n} = término
  // fraterno del OTRO (hermano mayor / segundo hermano / tercer hermano).
  const HERMANDAD = [
    ['{n}, ¿recordáis nuestro juramento en el jardín?', 'Como si fuera hoy: un mismo día habremos de morir.', 'Mientras viváis, no temo a ejército alguno.', 'Ni yo, teniéndoos a mi lado.'],
    ['Vuestra fama crece en todo el reino, {n}.', 'La gloria de uno es la de los tres, hermano.', 'Que jamás nos separe la fortuna.', 'Solo la muerte, y aun esa el mismo día.'],
    ['He afilado la hoja pensando en la próxima campaña.', 'Donde vayáis, {n}, allí iré yo el primero.', 'Juntos no hay muralla que nos detenga.', 'Ni diez mil lanzas enemigas.'],
    ['Bebamos, {n}, que la vida del guerrero es breve.', 'Por la hermandad, entonces, hasta el fondo.', 'Y por el señor a quien servimos.', 'Por él daría la vida sin dudarlo.'],
    ['Os noto inquieto, {n}. ¿Qué os ronda?', 'Pienso en los caídos, y en cuánto nos queda por hacer.', 'Los honraremos con nuevas victorias.', 'Ese es el hermano que conozco.'],
  ];
  // Saludos/respuestas entre hermanos ({n} = término fraterno del otro).
  const HAILS_H = ['¡{n}! ¡Venid a mis brazos!', '¡Hermano! ¡{n}!', '¡{n}! ¡Cuánto os echaba de menos!', '¡Eh, {n}! ¡Por aquí!'];
  const ACKS_H = ['¡{n}! ¡Ya voy!', '¡Hermano!', '¡{n}, dichosos los ojos!', '¡Aquí estoy, {n}!'];

  // Elige una charla; con 60% de probabilidad, temática de la aptitud (si la hay).
  function charla(aptitud) {
    const tema = TEMA_POR_APT[aptitud];
    if (tema && POR_TEMA[tema] && Math.random() < 0.6) return pick(POR_TEMA[tema]);
    return pick(GENERAL);
  }
  const hail = () => pick(HAILS);
  const ack = () => pick(ACKS);
  const hermandad = () => pick(HERMANDAD);
  const hailHermano = () => pick(HAILS_H);
  const ackHermano = () => pick(ACKS_H);

  // Escena directiva del SUPERIOR hacia un inferior, según la aptitud del que
  // manda. Sin aptitud reconocida → consejo de veteranía genérico. El líder
  // (= superior) dice las réplicas pares; el inferior, las impares.
  function directiva(aptitudSuperior) {
    const banco = DIRECTIVAS[DIR_POR_APT[aptitudSuperior]];
    return pick(banco && banco.length ? banco : DIR_GENERAL);
  }

  return { charla, directiva, hail, ack, hermandad, hailHermano, ackHermano };
})();
if (typeof window !== 'undefined') window.HacDialog = HacDialog;
