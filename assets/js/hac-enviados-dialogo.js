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
    ]
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
    ]
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

  function esShu(name, fac) {
    return /fei\s*yi|費禕|费祎|wenwei/i.test(String(name || '')) || /shu|蜀/i.test(String(fac || ''));
  }
  function esWei(name, fac) {
    return /chen\s*qun|陳群|陈群|長文|长文|changwen/i.test(String(name || '')) || /\bwei\b|魏/i.test(String(fac || ''));
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
    return generico(facNombre, invitado, esFundador, yaEscuchado);
  }

  return { lineas };
})();

if (typeof window !== 'undefined') window.HacEnviadoDialogo = HacEnviadoDialogo;
