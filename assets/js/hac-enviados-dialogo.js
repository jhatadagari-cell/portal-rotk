/* ═══════════════════════════════════════════════════════════════════════
   hac-enviados-dialogo.js — VOZ de los enviados (guion de la acción «Hablar»).
   ─────────────────────────────────────────────────────────────────────────
   El guion cambia según el CONTEXTO:
     · quién habla: el FUNDADOR (a quien va dirigida la oferta) u otro mecenas.
     · el estado del enviado: aún ESPERANDO ante el portón, o ya INVITADO dentro.
     · si el fundador YA escuchó la propuesta (revisita → «¿habéis meditado…?»).
   Cuando el enviado ya está dentro y habla con el fundador, va DIRECTO a lo que
   quiere: que la hacienda se una a su señor. Intenta encandilar (sin decir
   «vasallo»: habla de hermandad e igualdad). El chino solo ADORNA; el texto
   accionable va siempre en castellano.

   API: HacEnviadoDialogo.lineas({ name, faccion, esFundador, invitado, yaEscuchado })
        → [string, …]
   (Las opciones «aceptar / lo consideraré» las pinta la ventana, no este guion.)
   ═══════════════════════════════════════════════════════════════════════ */
const HacEnviadoDialogo = (function () {
  'use strict';

  // ── Fei Yi 费祎 (字 文偉), enviado de Shu · señor: Liu Bei 劉備 ────────────────
  const FEI_YI = {
    // Aún fuera, hablando con el FUNDADOR: cortés, insinúa la oferta, pide pasar.
    esperaFundador: [
      '抱拳 Fei Yi, de Chengdu, para serviros… mas llamadme Wenwei; así me nombran los amigos, y por amigo os tengo ya.',
      'No traigo ejércitos ni exigencias veladas, buen señor: traigo una propuesta. Y las propuestas de peso saben mejor al calor de un salón que a las puertas del camino.',
      'Si tenéis a bien recibirme dentro, os hablaré con el corazón en la mano de lo que Shu puede ofrecer a una casa como la vuestra.'
    ],
    // Aún fuera, hablando con OTRO mecenas: el asunto es cosa del señor.
    esperaOtro: [
      '抱拳 Un placer. Soy Fei Yi, enviado de Chengdu, en tierras de Shu.',
      'Aguardo a que vuestro señor tenga a bien recibirme; el asunto que traigo es cosa que he de tratar con él.',
      'Entretanto, admiro vuestra hermosa hacienda. Prósperos vuestros campos.'
    ],
    // Ya DENTRO, con el FUNDADOR, PRIMERA vez: la propuesta, directa y con flavor.
    ofertaFundador: [
      '抱拳 Os lo agradezco de veras. Ahora que hablamos al abrigo de miradas, seré claro con vos.',
      'Vengo en nombre de Liu Bei, señor de Shu: un hombre que llora por el labrador antes que por sus batallas, y que jamás ha vuelto la espalda a quien le tendió la mano.',
      'No os pido que dobléis la rodilla. Liu Bei no colecciona siervos — reúne hermanos. A quien abraza su causa lo sienta a su mesa y lo trata como a un igual.',
      'Uníos a nosotros y vuestra casa florecerá bajo un estandarte justo: nuestros graneros serán los vuestros en la escasez, nuestras espadas en el peligro, y nuestra gloria, compartida en la victoria.',
      'El mundo se quiebra en tres, buen señor. Más vale partirlo del lado de la virtud… y del lado que trata a los suyos como a su propia sangre.',
      '¿Qué decís? ¿Abrazará vuestra hacienda la causa de Shu?'
    ],
    // Ya DENTRO, con el FUNDADOR, REVISITA: recuerda la oferta, más breve.
    revisitaFundador: [
      '抱拳 De nuevo os tengo a mi lado, y me alegro. ¿Y bien? ¿Habéis meditado nuestra oferta?',
      'Liu Bei aguarda vuestra respuesta con la paciencia de quien confía en la razón. La puerta de Shu sigue abierta de par en par para vos.'
    ],
    // Ya DENTRO, con OTRO mecenas: cordial, remite la decisión al señor.
    ofertaOtro: [
      '抱拳 Agradezco la hospitalidad de vuestra casa; sois afortunados de servir a un señor tan próspero.',
      'El motivo de mi visita, sin embargo, he de tratarlo con vuestro señor: a él corresponde una decisión de tal peso.'
    ],
    q: {
      valores: [
        'Shu se alza sobre una sola palabra: rectitud. Restaurar la casa Han, socorrer al débil y honrar siempre la palabra dada.',
        'No medimos a un hombre por su cuna ni por su fuerza, sino por su corazón. Aquí la lealtad se paga con lealtad.'
      ],
      senor: [
        'Liu Bei desciende de emperadores y, sin embargo, tejió esteras para comer. Conoce el hambre del pueblo porque la padeció.',
        'Lloró por aldeanos que ni siquiera conocía y cruzó ríos cargando con ellos antes que abandonarlos a su suerte.',
        'Es de esos hombres a los que uno sigue no por miedo, sino porque querría parecérsele un poco.'
      ],
      tierra: [
        'Nuestra tierra es Yi, la del oeste: un vergel amurallado por montañas. Se entra por desfiladeros que un puñado de valientes guarda contra un ejército entero.',
        'La llanura de Chengdu es fértil como pocas; sus canales riegan el arroz el año entero, y rara vez falta el cuenco lleno.',
        'Sus gentes son cálidas y tozudas, hechas al recogimiento de las montañas: cuesta llegar hasta ellas, y cuesta aún más arrancarlas de su hogar.'
      ]
    }
  };

  // ── Chen Qun 陳群 (字 長文), enviado de Wei · señor: Cao Cao 曹操 ──────────────
  // Contrapunto de Fei Yi: nada de hermandad ni sentimiento. Frío, digno,
  // institucional. Persuade con ORDEN y MÉRITO (él ideó los nueve rangos): en Wei
  // el talento asciende sin importar la cuna, y cada casa halla su rango y su ley.
  const CHEN_QUN = {
    esperaFundador: [
      '抱拳 Chen Qun, de la corte de Wei, a vuestro servicio; Changwen, si preferís el trato llano.',
      'No vengo con ruegos ni con espadas, sino con una propuesta de orden. Y el orden, buen señor, se trata con la debida formalidad — no a las puertas de un camino.',
      'Si tenéis a bien recibirme, os expondré qué lugar, y qué rango, hallaría vuestra casa bajo el estandarte del norte.'
    ],
    esperaOtro: [
      '抱拳 Chen Qun, de la corte de Wei. Un placer correcto.',
      'Aguardo audiencia con vuestro señor: lo que traigo es asunto de Estado, y a él corresponde.',
      'Entretanto, observo vuestra hacienda con interés. Una casa bien ordenada se reconoce a la primera mirada.'
    ],
    ofertaFundador: [
      '抱拳 Os lo agradezco. Prescindamos de los adornos: soy hombre de asuntos claros, y claro seré con vos.',
      'Wei no es el reino de las canciones, sino el del ORDEN. Donde otros os prometen hermandad, nosotros ofrecemos algo más duradero: una estructura en la que cada casa conoce su rango, y cada mérito, su justa recompensa.',
      'Yo mismo dispuse el sistema de los nueve rangos. En Wei el talento asciende aunque nazca en la choza, y la incompetencia cae aunque vista seda. Vuestra hacienda sería medida con rigor… y premiada en consecuencia.',
      'No os pediré que améis a mi señor. Os pido algo más sensato: que reconozcáis de qué lado se levanta el edificio del futuro. Cao Cao no colecciona amigos — forja un Estado, y en él hay un sitio labrado para los capaces.',
      'La virtud alimenta el alma, buen señor; el orden alimenta al reino. Bajo Wei, vuestra casa tendrá ley que la ampare, rango que la eleve y un lugar firme cuando el caos se lleve a los tibios.',
      '¿Qué decís? ¿Ocupará vuestra hacienda el lugar que le corresponde bajo Wei?'
    ],
    revisitaFundador: [
      '抱拳 De nuevo ante vos. El orden es paciente, buen señor: ¿habéis sopesado ya la propuesta de Wei?',
      'El lugar reservado a vuestra casa sigue vacante. Mas los buenos rangos, como los buenos momentos, no aguardan para siempre.'
    ],
    ofertaOtro: [
      '抱拳 Agradezco la hospitalidad de esta casa; se advierte la mano de un señor competente.',
      'El asunto que me trae, sin embargo, corresponde a vuestro señor: son decisiones que exceden a un solo hombre.'
    ],
    q: {
      valores: [
        'Wei se sostiene sobre el orden y el mérito: donde hubo caos, ley; donde reinó el capricho, rango.',
        'Cada hombre halla su nivel por lo que vale, no por quién fue su padre. Es el sistema que yo mismo dispuse: los nueve rangos.'
      ],
      senor: [
        'Cao Cao ve talento donde otros solo ven a un don nadie, y lo eleva sin reparar en su origen.',
        'Es implacable con la traición y generoso con la capacidad. No os pide que lo améis: os pide que rindáis, y recompensa con creces.',
        'Bajo su mano, un reino roto recobró leyes, graneros y caminos seguros. El orden es su obra maestra.'
      ],
      tierra: [
        'Wei domina las Llanuras Centrales, el corazón del mundo civilizado: la vieja capital, los campos de mijo y las rutas por donde late el comercio.',
        'Es la tierra más poblada y más rica en hombres: de cada aldea salen escribas, herreros y soldados a millares.',
        'Sus gentes son disciplinadas y prácticas, curtidas por inviernos duros. Saben que sin orden no hay cosecha que dure.'
      ]
    }
  };

  // ── Zhao Zi 趙咨 (字 Dedu), enviado de Wu · señor: Sun Quan 孫權 ───────────────
  // Tercer registro (ni corazón como Fei Yi, ni orden frío como Chen Qun): ORGULLO
  // e INGENIO. Wu es fuerte y no mendiga aliados — los elige. Defiende la dignidad
  // de su reino con un puntito de chulería; te vende autonomía, temple y un nombre.
  const ZHAO_ZI = {
    esperaFundador: [
      '抱拳 Zhao Zi, enviado de Wu; Dedu, si gustáis. No os robaré mucho tiempo… aún.',
      'No vengo a suplicar nada, buen señor: vengo a traeros una oportunidad que pocos reciben. Y las oportunidades no se despachan en la puerta, como a un buhonero.',
      'Concededme audiencia dentro y sabréis por qué a Wu se le sirve con orgullo, no con resignación.'
    ],
    esperaOtro: [
      '抱拳 Zhao Zi, de Wu. Un gusto — para vos, quiero decir.',
      'Aguardo a vuestro señor; lo que traigo no es asunto para intermediarios.',
      'Bonita hacienda. Se ve que aquí alguien sabe mandar.'
    ],
    ofertaFundador: [
      '抱拳 Al fin. Seré breve y sin rodeos, que el tiempo de Wu vale caro.',
      '¿Que por qué habríais de escuchar a Wu? Contad: cien mil lanzas, el gran río por muralla y hombres de talento a espuertas. No somos el reino que mendiga, buen señor: somos el que elige.',
      'Y hoy os hemos elegido a vos. No es poca cosa — a Wu no se entra por lástima ni por limosna: se entra por mérito y con la frente alta.',
      'Con nosotros conservaréis lo vuestro y ganaréis un nombre que Wei jamás os dará y que Shu jamás recordará. Sun Quan premia al audaz y no olvida a quien lo acompaña.',
      'El norte os quiere de peón; el oeste, de mártir. Wu os quiere de igual, y os brinda el orgullo de pertenecer al único bando que a nadie teme.',
      '¿Y bien? ¿Tendrá vuestra hacienda el temple de alzar el estandarte de Wu?'
    ],
    revisitaFundador: [
      '抱拳 De vuelta. No acostumbro a repetir una oferta, así que consideraos afortunado: ¿os sumáis a Wu, o dejáis pasar el honor?',
      'La paciencia de Wu es larga, buen señor, mas no infinita. El río sigue su curso con vos o sin vos.'
    ],
    ofertaOtro: [
      '抱拳 Disfruto de vuestra hospitalidad; buena casa servís.',
      'Pero mi recado es para vuestro señor: son palabras mayores, no para cualquier oído.'
    ],
    q: {
      valores: [
        '¿Los valores de Wu? La independencia, para empezar: no inclinamos la cabeza ante el norte ni corremos tras los sueños del oeste.',
        'Honramos el talento y la audacia, y pagamos la lealtad con lealtad. Quien sirve a Wu con valor, con Wu prospera.'
      ],
      senor: [
        'Sun Quan heredó joven un reino y lo hizo más grande — que no es hazaña de cualquiera.',
        'No es el guerrero más fiero ni el santo más puro, pero es el señor más listo de los tres: sabe cuándo luchar, cuándo pactar y cuándo aguardar.',
        'Trata a sus generales como a iguales y confía en ellos hasta el final. Por eso Wu resiste donde otros ya habrían caído.'
      ],
      tierra: [
        'Wu es el sur del gran río: mil lagos, arrozales sin fin y puertos que nunca duermen. El agua es a la vez nuestra muralla y nuestro camino.',
        'Ni un ejército del norte ha sabido cruzar nuestras aguas y vivir para contarlo. Preguntad, si no, por Chibi.',
        'Sus gentes son marinos, mercaderes y pescadores: astutos, prósperos y difíciles de asustar. Quien vive del río aprende a no temer la corriente.'
      ]
    }
  };

  // ── Fallback genérico (enviado de una facción sin guion propio) ──────────────
  function generico(facNombre, invitado, esFundador, yaEscuchado) {
    const fac = facNombre || 'tierras amigas';
    if (!invitado) {
      return esFundador
        ? ['抱拳 Un enviado de ' + fac + ' os saluda con respeto, buen señor.',
           'Traigo una propuesta para vuestra casa; con gusto os la expondré si me hacéis pasar.']
        : ['抱拳 Un enviado de ' + fac + ' os saluda.',
           'Aguardo a que vuestro señor tenga a bien recibirme.'];
    }
    if (!esFundador) {
      return ['抱拳 Gracias por vuestra hospitalidad.',
              'El asunto que me trae he de tratarlo con vuestro señor.'];
    }
    if (yaEscuchado) {
      return ['抱拳 ¿Habéis considerado nuestra oferta, buen señor?',
              'Mi señor de ' + fac + ' recibiría con honor a vuestra casa entre las suyas.'];
    }
    return ['抱拳 Ahora que estamos a solas, seré claro, buen señor.',
            'Mi señor de ' + fac + ' no busca siervos, sino aliados a los que tratar como a hermanos.',
            'Uníos a su causa y vuestra casa compartirá su fortuna y su amparo.',
            '¿Qué decís? ¿Uniréis vuestra hacienda a ' + fac + '?'];
  }

  // ── Las 3 PREGUNTAS que el jugador puede hacer (mismas etiquetas para todos; la
  // respuesta cambia por enviado). El texto de la respuesta vive en `set.q`. ──────
  const PREG_LABELS = [
    { id: 'valores', label: '¿Qué defiende vuestro reino?' },
    { id: 'senor',   label: 'Habladme de vuestro señor.' },
    { id: 'tierra',  label: '¿Cómo es vuestra tierra y sus gentes?' }
  ];
  function genericoQ(facNombre) {
    const fac = facNombre || 'nuestro reino';
    return {
      valores: ['Los valores de ' + fac + ' son el honor y la lealtad hacia nuestro señor.'],
      senor: ['Mi señor es hombre justo y ambicioso, digno de que una buena casa lo sirva.'],
      tierra: ['Nuestras tierras son prósperas y nuestras gentes, leales. Bajo ' + fac + ' vuestra casa hallaría amparo.']
    };
  }

  function esShu(name, fac) {
    return /fei\s*yi|費禕|费祎|wenwei/i.test(String(name || '')) || /shu|蜀/i.test(String(fac || ''));
  }
  function esWei(name, fac) {
    return /chen\s*qun|陳群|陈群|長文|长文|changwen/i.test(String(name || '')) || /\bwei\b|魏/i.test(String(fac || ''));
  }
  function esWu(name, fac) {
    return /zhao\s*zi|趙咨|赵咨|德度|dedu/i.test(String(name || '')) || /\bwu\b|吳|吴/i.test(String(fac || ''));
  }

  // Elige el guion según el CONJUNTO de un enviado (Fei Yi, Chen Qun…) y el contexto.
  function guion(set, invitado, esFundador, yaEscuchado) {
    if (!invitado) return (esFundador ? set.esperaFundador : set.esperaOtro).slice();
    if (!esFundador) return set.ofertaOtro.slice();
    return (yaEscuchado ? set.revisitaFundador : set.ofertaFundador).slice();
  }

  function lineas(o) {
    o = o || {};
    const name = String(o.name || '');
    const facObj = o.faccion || null;
    const facNombre = (facObj && (facObj.nombre || facObj.zh)) || (typeof facObj === 'string' ? facObj : '');
    const invitado = !!o.invitado, esFundador = !!o.esFundador, yaEscuchado = !!o.yaEscuchado;

    if (esShu(name, facNombre)) return guion(FEI_YI, invitado, esFundador, yaEscuchado);
    if (esWei(name, facNombre)) return guion(CHEN_QUN, invitado, esFundador, yaEscuchado);
    if (esWu(name, facNombre)) return guion(ZHAO_ZI, invitado, esFundador, yaEscuchado);
    return generico(facNombre, invitado, esFundador, yaEscuchado);
  }

  // Las 3 preguntas + su respuesta (en la voz del enviado) para el contexto dado.
  // → [{ id, label, lineas:[…] }]
  function preguntas(o) {
    o = o || {};
    const name = String(o.name || '');
    const facObj = o.faccion || null;
    const facNombre = (facObj && (facObj.nombre || facObj.zh)) || (typeof facObj === 'string' ? facObj : '');
    let q;
    if (esShu(name, facNombre)) q = FEI_YI.q;
    else if (esWei(name, facNombre)) q = CHEN_QUN.q;
    else if (esWu(name, facNombre)) q = ZHAO_ZI.q;
    else q = genericoQ(facNombre);
    return PREG_LABELS.map(p => ({ id: p.id, label: p.label, lineas: ((q && q[p.id]) || ['…']).slice() }));
  }

  return { lineas, preguntas };
})();

if (typeof window !== 'undefined') window.HacEnviadoDialogo = HacEnviadoDialogo;
