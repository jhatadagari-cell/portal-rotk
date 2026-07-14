/* ═══════════════════════════════════════════════════════════════════════
   hac-tienda.js — Catálogo del MERCADO (市): artículos a la venta por tier.
   ─────────────────────────────────────────────────────────────────────────
   Datos puros (sin red). El mercado "mejora por tiers": a mayor NIVEL de la
   finca, más artículos disponibles (item.tier = nivel mínimo de la hacienda).
   La compra (gastar dinero + aplicar efecto) la orquesta hacienda-page con
   HacStats (dinero/XP/inventario) y HacEnergia (comida → energía).

   efecto: { energia?, xp?:{militar,cultural,administrativo}, capInv?, guardable? }
     · energia   → restaura energía AHORA (consumible)
     · xp        → experiencia al/los dominio(s) (sube el "poder personal")
     · capInv    → amplía el tamaño del inventario (permanente)
     · guardable → ocupa una ranura del inventario (mascotas / objetos)

   API:
     HacTienda.CATALOGO            → [item…]
     HacTienda.get(id)             → item | null
     HacTienda.disponibles(tier)   → items con tier ≤ nivel de la finca
     HacTienda.bloqueados(tier)    → items aún por desbloquear (tier > nivel)
     HacTienda.efectoTexto(item)   → descripción corta del efecto
   ═══════════════════════════════════════════════════════════════════════ */
const HacTienda = (function () {
  'use strict';
  const G = { militar: '武', cultural: '文', administrativo: '政' };

  // ── Libros "Conclusiones del debate" (feature Debates): 6 temas × 3 calidades.
  //    NO se compran ni caen como botín (oculto:true → fuera de disponibles/rotación);
  //    solo se GANAN debatiendo, y se pueden consumir (XP), vender o donar al fundador.
  //    Datos de tema/calidad centralizados en HacDebates (cargar hac-debates.js ANTES). ──
  const _conclusiones = (function () {
    const D = (typeof window !== 'undefined' && window.HacDebates) || null;
    if (!D || !D.TEMAS || !D.CALIDADES) return [];
    const out = [];
    D.TEMAS.forEach(t => {
      const combo = t.doms.length > 1, domTxt = t.doms.map(d => G[d] || d).join('');
      Object.keys(D.CALIDADES).forEach(cal => {
        const c = D.CALIDADES[cal], per = combo ? Math.round(c.xp * 0.6) : c.xp, xp = {};
        t.doms.forEach(d => { xp[d] = per; });
        const desc = cal === 'reveladoras'
          ? `Conclusiones REVELADORAS de un debate de ${t.nombre} (${domTxt}). Gran experiencia al estudiarlas; preséntalas al fundador para un gran bono de XP a toda la casa.`
          : cal === 'muy-buenas'
            ? `Conclusiones muy buenas de un debate de ${t.nombre} (${domTxt}). Estúdialas por experiencia, véndelas, o preséntalas al fundador (bono de XP a la casa).`
            : `Notas de un debate de ${t.nombre} (${domTxt}). Conclusiones útiles: estúdialas por algo de experiencia o véndelas en el mercado.`;
        out.push({ id: D.bookId(t.id, cal), nombre: 'Conclusiones · ' + c.nombre, zh: '論議錄', icon: c.icon,
          tier: 99, oculto: true, tipo: 'manual', calidad: cal, tema: t.id, donable: c.donable,
          efecto: { manual: { xp } }, precio: c.precio, desc });
      });
    });
    return out;
  })();

  // tipo: 'comida' | 'tomo' | 'inventario' | 'mascota'
  const CATALOGO = Object.freeze([
    // ── Recompensa del señor (NO se compra ni cae como botín): la entrega el fundador
    //    al cumplir los retos semanales. Al abrirla, +10% de XP en las tres aptitudes.
    { id: 'recompensa-semanal', nombre: 'Recompensa semanal', zh: '恩賞', icon: '🎁', tier: 99, oculto: true, tipo: 'recompensa', donable: false, efecto: { guardable: true, recompensaSemanal: true }, desc: 'Un presente de tu señor por cumplir los retos de la semana. Ábrelo para +10% de XP en tus tres aptitudes, o guárdalo.' },
    // ── Tier 1 ── vituallas básicas
    { id: 'raciones', nombre: 'Raciones', zh: '干糧', icon: '🍚', tier: 1, precio: 8,  tipo: 'comida', efecto: { energia: 25 }, desc: 'Provisiones de marcha para reponer fuerzas.' },
    { id: 'te',       nombre: 'Té verde', zh: '清茶', icon: '🍵', tier: 1, precio: 14, tipo: 'comida', efecto: { energia: 45 }, desc: 'Una infusión que despeja y reconforta.' },
    // ── Tier 2 ── tratados EQUIPABLES (otorgan +stat MIENTRAS están equipados)
    { id: 'tratado-mil', nombre: 'Tratado de armas', zh: '兵書', icon: '📕', tier: 2, precio: 28, tipo: 'equipo', efecto: { equip: { militar: 2 } },        desc: 'Tácticas y manejo de armas. Equípalo para +2 武.' },
    { id: 'clasicos',    nombre: 'Clásicos',          zh: '經卷', icon: '📗', tier: 2, precio: 28, tipo: 'equipo', efecto: { equip: { cultural: 2 } },        desc: 'Los grandes maestros del saber. Equípalo para +2 文.' },
    { id: 'codigo',      nombre: 'Código legal',      zh: '律令', icon: '📘', tier: 2, precio: 28, tipo: 'equipo', efecto: { equip: { administrativo: 2 } },  desc: 'Estatutos y precedentes. Equípalo para +2 政.' },
    // ── Tier 3 ── vianda fuerte, alforja, tratados combinados EQUIPABLES (+1/+1)
    { id: 'vianda',  nombre: 'Vino y carne', zh: '酒肉', icon: '🍖', tier: 3, precio: 30, tipo: 'comida',      efecto: { energia: 80 }, desc: 'Un buen ágape que devuelve el vigor.' },
    { id: 'alforja', nombre: 'Alforja',      zh: '行囊', icon: '🎒', tier: 3, precio: 55, tipo: 'inventario', efecto: { capInv: 2 },  desc: 'Amplía en 2 las ranuras de tu inventario.' },
    { id: 'combo-wenwu',  nombre: 'Estrategia',  zh: '韜略', icon: '📜', tier: 3, precio: 50, tipo: 'equipo', efecto: { equip: { militar: 1, cultural: 1 } },        desc: 'Saber militar y letras. Equípalo para +1 武 +1 文.' },
    { id: 'combo-wenzheng',nombre: 'Memoriales', zh: '策論', icon: '📜', tier: 3, precio: 50, tipo: 'equipo', efecto: { equip: { cultural: 1, administrativo: 1 } },  desc: 'Letras y gobierno. Equípalo para +1 文 +1 政.' },
    { id: 'combo-zhengwu', nombre: 'Logística',  zh: '屯策', icon: '📜', tier: 3, precio: 50, tipo: 'equipo', efecto: { equip: { administrativo: 1, militar: 1 } },  desc: 'Intendencia y mando. Equípalo para +1 政 +1 武.' },
    // ── Tier 4 ── tratados mayores EQUIPABLES (+3), mascota, alforja grande
    { id: 'tratado-mayor', nombre: 'Arte de la guerra', zh: '太公兵法', icon: '📕', tier: 4, precio: 80, tipo: 'equipo', efecto: { equip: { militar: 3 } },        desc: 'La obra cumbre de la estrategia. Equípalo para +3 武.' },
    { id: 'clasicos-mayor',nombre: 'Cinco Clásicos',    zh: '五經',     icon: '📗', tier: 4, precio: 80, tipo: 'equipo', efecto: { equip: { cultural: 3 } },        desc: 'El canon completo del letrado. Equípalo para +3 文.' },
    { id: 'codigo-mayor',  nombre: 'Leyes Han',         zh: '漢律',     icon: '📘', tier: 4, precio: 80, tipo: 'equipo', efecto: { equip: { administrativo: 3 } },  desc: 'El cuerpo legal del imperio. Equípalo para +3 政.' },
    { id: 'gato',     nombre: 'Gato',     zh: '貍奴', icon: '🐈', tier: 4, precio: 90,  tipo: 'mascota',     efecto: { guardable: true }, desc: 'Un gato que ronronea por los patios.' },
    { id: 'alforja-grande', nombre: 'Gran alforja', zh: '大囊', icon: '🎒', tier: 4, precio: 110, tipo: 'inventario', efecto: { capInv: 3 }, desc: 'Amplía en 3 las ranuras de tu inventario.' },
    // ── Tier 5 ── mascotas nobles
    { id: 'grulla', nombre: 'Grulla',     zh: '仙鶴', icon: '🦢', tier: 5, precio: 140, tipo: 'mascota', efecto: { guardable: true }, desc: 'Grulla de buen augurio y larga vida.' },
    { id: 'perro',  nombre: 'Perro guardián', zh: '看門犬', icon: '🐕', tier: 5, precio: 130, tipo: 'mascota', efecto: { guardable: true }, desc: 'Leal can que vigila la finca.' },
    // ── Tier 6 ── piezas de prestigio
    { id: 'caballo', nombre: 'Caballo de raza', zh: '寶馬', icon: '🐎', tier: 2, precio: 260, tipo: 'caballo', req: { militar: 5 }, efecto: { caballo: true }, desc: 'Un corcel digno de un general. Lo bautizas y ronda libre por los campos de la finca. Requiere 武 5 · uno por mecenas.' },
    { id: 'jade',    nombre: 'Colgante de jade', zh: '玉佩', icon: '💠', tier: 6, precio: 300, tipo: 'mascota', efecto: { guardable: true }, desc: 'Pieza de jade tallado, símbolo de rango.' },

    // ── SELLOS DE COMERCIO (equipables): +% al dinero de misiones/expediciones ──
    { id: 'sello-com',   nombre: 'Sello de comercio', zh: '商印', icon: '🪙', tier: 2, precio: 40,  tipo: 'equipo', efecto: { equip: { dineroPct: 0.03 } }, desc: 'Un sello mercantil. Equípalo para +3% de dinero.' },
    { id: 'sello-plata', nombre: 'Sello de plata',    zh: '銀印', icon: '🪙', tier: 4, precio: 100, tipo: 'equipo', efecto: { equip: { dineroPct: 0.05 } }, desc: 'Sello de plata de una casa próspera. +5% de dinero.' },
    { id: 'sello-oro',   nombre: 'Sello imperial',    zh: '金印', icon: '🪙', tier: 6, precio: 210, tipo: 'equipo', efecto: { equip: { dineroPct: 0.08 } }, desc: 'Sello dorado de gran mérito. +8% de dinero.' },
    // ── ENSERES DE MARCHA (equipables): −% al tiempo de las expediciones ──
    { id: 'botas',       nombre: 'Botas de marcha',   zh: '行靴', icon: '🥾', tier: 2, precio: 40,  tipo: 'equipo', efecto: { equip: { expedPct: 0.08 } }, desc: 'Buen calzado de camino. Equípalo: −8% de tiempo de expedición.' },
    { id: 'montura-lig', nombre: 'Montura ligera',    zh: '輕騎', icon: '🐴', tier: 4, precio: 100, tipo: 'equipo', efecto: { equip: { expedPct: 0.12 } }, desc: 'Cabalgadura veloz. −12% de tiempo de expedición.' },
    { id: 'vanguardia',  nombre: 'Enseña de vanguardia', zh: '先鋒旗', icon: '🚩', tier: 6, precio: 210, tipo: 'equipo', efecto: { equip: { expedPct: 0.18 } }, desc: 'Guía la marcha al frente. −18% de tiempo de expedición.' },
    // ── MANUALES DE EXPERIENCIA (consumibles): +XP FIJA a un stat, se gastan al usar ──
    { id: 'man-mil',  nombre: 'Manual de instrucción', zh: '操典', icon: '📕', tier: 1, precio: 22, tipo: 'manual', efecto: { manual: { dom: 'militar', xp: 35 } },        desc: 'Ejercicios de armas. Úsalo para +35 XP Militar.' },
    { id: 'man-cul',  nombre: 'Manual de estudio',     zh: '學典', icon: '📗', tier: 1, precio: 22, tipo: 'manual', efecto: { manual: { dom: 'cultural', xp: 35 } },       desc: 'Lecciones de los clásicos. Úsalo para +35 XP Cultural.' },
    { id: 'man-adm',  nombre: 'Manual de gobierno',    zh: '政典', icon: '📘', tier: 1, precio: 22, tipo: 'manual', efecto: { manual: { dom: 'administrativo', xp: 35 } }, desc: 'Práctica de registros. Úsalo para +35 XP Administrativo.' },
    { id: 'comp-mil', nombre: 'Compendio militar',       zh: '武經', icon: '📕', tier: 4, precio: 80, tipo: 'manual', efecto: { manual: { dom: 'militar', xp: 130 } },        desc: 'Gran obra de estrategia. Úsalo para +130 XP Militar.' },
    { id: 'comp-cul', nombre: 'Compendio cultural',      zh: '文淵', icon: '📗', tier: 4, precio: 80, tipo: 'manual', efecto: { manual: { dom: 'cultural', xp: 130 } },       desc: 'Suma del saber letrado. Úsalo para +130 XP Cultural.' },
    { id: 'comp-adm', nombre: 'Compendio administrativo', zh: '政要', icon: '📘', tier: 4, precio: 80, tipo: 'manual', efecto: { manual: { dom: 'administrativo', xp: 130 } }, desc: 'Tratado de gobierno. Úsalo para +130 XP Administrativo.' },
    // ── RELIQUIAS RARAS (rareza superior): NO se compran (oculto) → se ENCUENTRAN en
    //    misiones (baja probabilidad) o las regala tu señor. Contorno azul de "raro".
    //    Dan +3 a un stat, o +1/+1/+1 a los tres. tier alto = salen poco como botín.
    { id: 'raro-mil', nombre: 'Alabarda del general',   zh: '名將戟', icon: '🗡️', tier: 3, tipo: 'equipo', raro: true, oculto: true, precio: 140, efecto: { equip: { militar: 3 } },                          desc: 'Reliquia de un gran general. Equípala para +3 武. (Raro)' },
    { id: 'raro-cul', nombre: 'Tratado perdido',        zh: '秘典',   icon: '📜', tier: 3, tipo: 'equipo', raro: true, oculto: true, precio: 140, efecto: { equip: { cultural: 3 } },                         desc: 'Un saber casi olvidado. Equípalo para +3 文. (Raro)' },
    { id: 'raro-adm', nombre: 'Sello imperial',         zh: '玉璽',   icon: '🔶', tier: 3, tipo: 'equipo', raro: true, oculto: true, precio: 140, efecto: { equip: { administrativo: 3 } },                   desc: 'Autoridad de la corte. Equípalo para +3 政. (Raro)' },
    { id: 'raro-tri', nombre: 'Estandarte del dragón',  zh: '臥龍',   icon: '🐉', tier: 4, tipo: 'equipo', raro: true, oculto: true, precio: 180, efecto: { equip: { militar: 1, cultural: 1, administrativo: 1 } }, desc: 'La marca de un genio integral. Equípalo para +1 武 +1 文 +1 政. (Raro)' },

    // ── ROPAS DE TORSO (指袍 · slot dedicado 'torso') ────────────────────────────
    //   Indumentaria que se lleva en su PROPIA ranura (aparte de los 3 objetos).
    //   Dan un +% al nivel de un dominio (o +5%/+5% combinado) — no un +N plano.
    //   Rareza COMÚN, pero NO se compran (oculto): caen como botín MEDIANAMENTE
    //   RARO en misiones (ROPA_LOOT_CHANCE). `viste` = receta visual que HacChar
    //   aplica al torso (kind robe + colores + ribete), conservando cabeza/piel/pelo.
    { id: 'ropa-mil', nombre: 'Casaca del Guerrero',       zh: '戰袍', icon: '👘', tier: 2, tipo: 'equipo', slot: 'torso', oculto: true, precio: 60,
      efecto: { equip: { pct: { militar: 0.10 } } },                          viste: { kind: 'robe', torsoLujo: true, robe: '#8f3128', accent: '#c3c8d0' }, desc: 'Recia casaca de campaña ribeteada en acero. Equípala para +10% Militar 武.' },
    { id: 'ropa-cul', nombre: 'Túnica del Erudito',         zh: '儒袍', icon: '👘', tier: 2, tipo: 'equipo', slot: 'torso', oculto: true, precio: 60,
      efecto: { equip: { pct: { cultural: 0.10 } } },                         viste: { kind: 'robe', torsoLujo: true, robe: '#2f5a6e', accent: '#bfe0d8' }, desc: 'Túnica de letrado de mangas amplias y cuello de jade. Equípala para +10% Cultural 文.' },
    { id: 'ropa-adm', nombre: 'Toga del Oficial',           zh: '官袍', icon: '👘', tier: 2, tipo: 'equipo', slot: 'torso', oculto: true, precio: 60,
      efecto: { equip: { pct: { administrativo: 0.10 } } },                   viste: { kind: 'robe', torsoLujo: true, robe: '#264f39', accent: '#d8b65a' }, desc: 'Toga de corte con ribete dorado. Equípala para +10% Administrativo 政.' },
    { id: 'ropa-mc',  nombre: 'Manto del Estratega',        zh: '韜袍', icon: '👘', tier: 3, tipo: 'equipo', slot: 'torso', oculto: true, precio: 80,
      efecto: { equip: { pct: { militar: 0.05, cultural: 0.05 } } },          viste: { kind: 'robe', torsoLujo: true, robe: '#4b4f70', accent: '#e7e0cc' }, desc: 'Manto sobrio de quien domina armas y letras. Equípalo para +5% Militar 武 y +5% Cultural 文.' },
    { id: 'ropa-ca',  nombre: 'Vestidura Ministerial',      zh: '卿袍', icon: '👘', tier: 3, tipo: 'equipo', slot: 'torso', oculto: true, precio: 80,
      efecto: { equip: { pct: { cultural: 0.05, administrativo: 0.05 } } },   viste: { kind: 'robe', torsoLujo: true, robe: '#5b2c83', accent: '#e6c66a' }, desc: 'Vestidura de alto funcionario letrado. Equípala para +5% Cultural 文 y +5% Administrativo 政.' },
    { id: 'ropa-am',  nombre: 'Sobreveste de Intendencia',  zh: '屯袍', icon: '👘', tier: 3, tipo: 'equipo', slot: 'torso', oculto: true, precio: 80,
      efecto: { equip: { pct: { administrativo: 0.05, militar: 0.05 } } },    viste: { kind: 'robe', torsoLujo: true, robe: '#6a5a2c', accent: '#a83a2e' }, desc: 'Sobreveste de campaña y avituallamiento. Equípala para +5% Administrativo 政 y +5% Militar 武.' },

    // ── ROPAS DE TORSO RARAS (contorno azul de "raro") ───────────────────────────
    //   Versión superior de cada común: MISMO % + 5% de prestigio + 20% antirrobo
    //   (pierdes menos dinero en encuentros/misiones fallidos). raro:true → contorno
    //   azul; viste con `torsoGala` → dorados y medallón (se ven más ricas). Caen como
    //   botín RARO (ROPA_RARA_LOOT_CHANCE ~5%); no se compran.
    { id: 'ropa-mil-r', nombre: 'Casaca del General',        zh: '名將袍', icon: '👘', tier: 4, tipo: 'equipo', slot: 'torso', raro: true, oculto: true, precio: 180,
      efecto: { equip: { pct: { militar: 0.10 }, prestigioPct: 0.05, antirroboPct: 0.20 } }, viste: { kind: 'robe', torsoLujo: true, torsoGala: true, robe: '#7a2620', accent: '#d8b65a' }, desc: 'Casaca de gala de un gran general, ribeteada en oro. +10% Militar 武, +5% prestigio y 20% antirrobo. (Rara)' },
    { id: 'ropa-cul-r', nombre: 'Túnica del Gran Erudito',   zh: '鴻儒袍', icon: '👘', tier: 4, tipo: 'equipo', slot: 'torso', raro: true, oculto: true, precio: 180,
      efecto: { equip: { pct: { cultural: 0.10 }, prestigioPct: 0.05, antirroboPct: 0.20 } }, viste: { kind: 'robe', torsoLujo: true, torsoGala: true, robe: '#24506a', accent: '#d8b65a' }, desc: 'Túnica ceremonial de un sabio insigne. +10% Cultural 文, +5% prestigio y 20% antirrobo. (Rara)' },
    { id: 'ropa-adm-r', nombre: 'Toga del Ministro',         zh: '相國袍', icon: '👘', tier: 4, tipo: 'equipo', slot: 'torso', raro: true, oculto: true, precio: 180,
      efecto: { equip: { pct: { administrativo: 0.10 }, prestigioPct: 0.05, antirroboPct: 0.20 } }, viste: { kind: 'robe', torsoLujo: true, torsoGala: true, robe: '#1f4433', accent: '#d8b65a' }, desc: 'Toga de un ministro de la corte, brocada en oro. +10% Administrativo 政, +5% prestigio y 20% antirrobo. (Rara)' },
    { id: 'ropa-mc-r',  nombre: 'Manto del Gran Estratega',  zh: '臥龍袍', icon: '👘', tier: 5, tipo: 'equipo', slot: 'torso', raro: true, oculto: true, precio: 220,
      efecto: { equip: { pct: { militar: 0.05, cultural: 0.05 }, prestigioPct: 0.05, antirroboPct: 0.20 } }, viste: { kind: 'robe', torsoLujo: true, torsoGala: true, robe: '#3f4468', accent: '#e7e0cc' }, desc: 'Manto del genio que domina armas y letras. +5% Militar 武, +5% Cultural 文, +5% prestigio y 20% antirrobo. (Rara)' },
    { id: 'ropa-ca-r',  nombre: 'Vestidura del Preceptor',   zh: '太傅袍', icon: '👘', tier: 5, tipo: 'equipo', slot: 'torso', raro: true, oculto: true, precio: 220,
      efecto: { equip: { pct: { cultural: 0.05, administrativo: 0.05 }, prestigioPct: 0.05, antirroboPct: 0.20 } }, viste: { kind: 'robe', torsoLujo: true, torsoGala: true, robe: '#4a2170', accent: '#e6c66a' }, desc: 'Vestidura del preceptor imperial. +5% Cultural 文, +5% Administrativo 政, +5% prestigio y 20% antirrobo. (Rara)' },
    { id: 'ropa-am-r',  nombre: 'Sobreveste del Gran Intendente', zh: '大司農袍', icon: '👘', tier: 5, tipo: 'equipo', slot: 'torso', raro: true, oculto: true, precio: 220,
      efecto: { equip: { pct: { administrativo: 0.05, militar: 0.05 }, prestigioPct: 0.05, antirroboPct: 0.20 } }, viste: { kind: 'robe', torsoLujo: true, torsoGala: true, robe: '#5a4a22', accent: '#a83a2e' }, desc: 'Sobreveste del intendente mayor del ejército. +5% Administrativo 政, +5% Militar 武, +5% prestigio y 20% antirrobo. (Rara)' },

    // ── ARMAS (兵 · slot dedicado 'arma') ────────────────────────────────────────
    //   3 por dominio. Por AHORA su efecto es +10% de su dominio (como las túnicas,
    //   vía equip.pct); en el futuro tendrán además efectos en el combate por turnos.
    //   Requieren nivel del dominio (`req`) para empuñarlas. Se COMPRAN en fincas de
    //   nivel alto y CAEN (raras) como botín. `viste.arma` = cómo se pinta en la mano
    //   del mecenas (HacChar la dibuja sustituyendo al prop de la aptitud).
    { id: 'arma-mil-1', nombre: 'Espada recta',     zh: '劍',   icon: '🗡️', tier: 5, tipo: 'arma', slot: 'arma', req: { militar: 3 },        precio: 190, efecto: { equip: { pct: { militar: 0.10 } } },        viste: { arma: 'jian' }, desc: 'Hoja recta de doble filo. Equípala para +10% Militar 武. Requiere 武 3.' },
    { id: 'arma-mil-2', nombre: 'Sable curvo',      zh: '刀',   icon: '⚔️', tier: 5, tipo: 'arma', slot: 'arma', req: { militar: 4 },        precio: 230, efecto: { equip: { pct: { militar: 0.10 } } },        viste: { arma: 'dao' },  desc: 'Sable de un solo filo, temible al galope. +10% Militar 武. Requiere 武 4.' },
    { id: 'arma-mil-3', nombre: 'Alabarda',         zh: '戟',   icon: '🔱', tier: 6, tipo: 'arma', slot: 'arma', req: { militar: 5 },        precio: 290, efecto: { equip: { pct: { militar: 0.10 } } },        viste: { arma: 'ji' },   desc: 'Asta con media luna, arma de campeones. +10% Militar 武. Requiere 武 5.' },
    { id: 'arma-cul-1', nombre: 'Abanico de plumas', zh: '羽扇', icon: '🪭', tier: 5, tipo: 'arma', slot: 'arma', req: { cultural: 3 },       precio: 190, efecto: { equip: { pct: { cultural: 0.10 } } },       viste: { arma: 'fan2' }, desc: 'El abanico del estratega sereno. +10% Cultural 文. Requiere 文 3.' },
    { id: 'arma-cul-2', nombre: 'Flauta de jade',   zh: '玉笛', icon: '🪈', tier: 5, tipo: 'arma', slot: 'arma', req: { cultural: 4 },       precio: 230, efecto: { equip: { pct: { cultural: 0.10 } } },       viste: { arma: 'dizi' }, desc: 'Flauta de jade que templa el ánimo. +10% Cultural 文. Requiere 文 4.' },
    { id: 'arma-cul-3', nombre: 'Pincel del juez',  zh: '判官筆', icon: '🖌️', tier: 6, tipo: 'arma', slot: 'arma', req: { cultural: 5 },      precio: 290, efecto: { equip: { pct: { cultural: 0.10 } } },       viste: { arma: 'bi' },   desc: 'Pincel de mango recio, sentencia y arma. +10% Cultural 文. Requiere 文 5.' },
    { id: 'arma-adm-1', nombre: 'Tabla de audiencia', zh: '笏', icon: '🪧', tier: 5, tipo: 'arma', slot: 'arma', req: { administrativo: 3 }, precio: 190, efecto: { equip: { pct: { administrativo: 0.10 } } }, viste: { arma: 'hu2' },  desc: 'Placa de corte, símbolo de mando. +10% Administrativo 政. Requiere 政 3.' },
    { id: 'arma-adm-2', nombre: 'Vara de mando',    zh: '節',   icon: '🪄', tier: 5, tipo: 'arma', slot: 'arma', req: { administrativo: 4 }, precio: 230, efecto: { equip: { pct: { administrativo: 0.10 } } }, viste: { arma: 'jie' },  desc: 'Bastón con borlas, insignia de autoridad. +10% Administrativo 政. Requiere 政 4.' },
    { id: 'arma-adm-3', nombre: 'Fusta de oficial', zh: '鞭',   icon: '🪢', tier: 6, tipo: 'arma', slot: 'arma', req: { administrativo: 5 }, precio: 290, efecto: { equip: { pct: { administrativo: 0.10 } } }, viste: { arma: 'bian' }, desc: 'Fusta trenzada de mando y castigo. +10% Administrativo 政. Requiere 政 5.' },
    // Arma INICIAL del guerrero: se entrega al crear un personaje de aptitud 'guerrero'
    // (HacStats.otorgarArmaInicial). oculto + tier 99 → NO sale en el mercado ni como
    // botín: no se consigue de ninguna otra forma.
    { id: 'lanza-quebradiza', nombre: 'Lanza quebradiza', zh: '折矛', icon: '🔱', tier: 99, tipo: 'arma', slot: 'arma', oculto: true, precio: 12, efecto: { equip: { pct: { militar: 0.05 } } }, viste: { arma: 'lanza' }, desc: 'El arma con la que empiezan los guerreros: recia pero ya astillada. Equípala para +5% Militar 武. No se consigue de ninguna otra forma.' },
  ].concat(_conclusiones));

  const byId = {}; CATALOGO.forEach(i => { byId[i.id] = i; });
  const get = (id) => byId[id] || null;
  // `oculto` (libros de conclusiones) → nunca en el mercado ni como botín.
  const disponibles = (tier) => CATALOGO.filter(i => !i.oculto && i.tier <= (tier || 1));
  const bloqueados = (tier) => CATALOGO.filter(i => !i.oculto && i.tier > (tier || 1));

  // Nombre LEGIBLE de cada dominio (el glifo 武/文/政 solo, sin traducir, no se entendía).
  const NOM = { militar: 'Militar', cultural: 'Cultural', administrativo: 'Administrativo' };
  function efectoTexto(item) {
    const e = item.efecto || {};
    if (e.energia) return `Comestible · +${e.energia} de energía ⚡`;
    if (e.equip) {
      const parts = [];
      Object.keys(e.equip).forEach(d => {
        if (d === 'pct') { Object.keys(e.equip.pct).forEach(dd => parts.push(`+${Math.round(e.equip.pct[dd] * 100)}% ${NOM[dd] || dd}`)); return; }
        const v = e.equip[d];
        if (d === 'dineroPct') { parts.push(`+${Math.round(v * 100)}% dinero`); return; }
        if (d === 'expedPct') { parts.push(`−${Math.round(v * 100)}% tiempo de expedición`); return; }
        if (d === 'prestigioPct') { parts.push(`+${Math.round(v * 100)}% prestigio`); return; }
        if (d === 'antirroboPct') { parts.push(`${Math.round(v * 100)}% antirrobo`); return; }
        parts.push(`+${v} ${NOM[d] || d}`);
      });
      return 'Equipable · ' + parts.join(' · ');
    }
    if (e.manual) {
      const mx = e.manual.xp;
      if (mx && typeof mx === 'object') return 'Consumible · ' + Object.keys(mx).map(d => `+${mx[d]} XP ${NOM[d] || d}`).join(' · ');
      return `Consumible · +${e.manual.xp} XP ${NOM[e.manual.dom] || e.manual.dom}`;
    }
    if (e.xp) return Object.keys(e.xp).map(d => `+${e.xp[d]} XP ${NOM[d] || d}`).join(' · ');
    if (e.capInv) return `+${e.capInv} ranuras de mochila 🎒`;
    if (e.guardable) return 'Objeto decorativo · ocupa 1 ranura';
    return '';
  }
  // Bonos de equipo de un item (o null si no es equipable).
  function equipBonus(id) { const it = byId[id]; return (it && it.efecto && it.efecto.equip) || null; }
  const manualDe = (id) => { const it = byId[id]; return (it && it.efecto && it.efecto.manual) || null; };

  // ── Mercader con ROTACIÓN DIARIA ───────────────────────────────────────────
  // Muestra COUNT_BY_TIER[tier] objetos de entre los disponibles (≤ tier), elegidos
  // de forma determinista por DÍA + hacienda (igual para todos). Hasta 12 en el máx.
  const COUNT_BY_TIER = [4, 6, 7, 9, 10, 12];
  function diaStr() { const t = (typeof window !== 'undefined' && window.HacClock && HacClock.now) ? HacClock.now() : Date.now(); const d = new Date(t); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
  function stockDelDia(tier, seedKey) {
    const all = disponibles(tier);
    const fijos = all.filter(i => i.tipo === 'caballo');   // permanentes (compra única): SIEMPRE a la venta, no rotan
    const pool = all.filter(i => i.tipo !== 'caballo');
    const n = Math.min(pool.length, COUNT_BY_TIER[Math.max(1, Math.min(6, tier || 1)) - 1] || 4);
    const rng = (typeof window !== 'undefined' && window.HacRand && HacRand.make) ? HacRand.make('mkt-' + (seedKey || '') + '-' + diaStr()) : null;
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor((rng ? rng.next() : Math.random()) * (i + 1)); const t = pool[i]; pool[i] = pool[j]; pool[j] = t; }
    return fijos.concat(pool.slice(0, n)).sort((a, b) => a.tier - b.tier);
  }
  // Reliquias RARAS (contorno azul). No se compran; se encuentran/regalan.
  const RARE_LOOT_CHANCE = 0.05;   // 5 % del botín de misión es una reliquia rara
  const ROPA_LOOT_CHANCE = 0.14;       // ~14 % del botín es una ROPA DE TORSO COMÚN (medianamente raro)
  const ROPA_RARA_LOOT_CHANCE = 0.05;  // ~5 % es una ROPA DE TORSO RARA (efectos superiores, contorno azul)
  const ropasTorso = () => CATALOGO.filter(i => i.slot === 'torso' && !i.raro);        // comunes
  const ropasTorsoRaras = () => CATALOGO.filter(i => i.slot === 'torso' && i.raro);    // raras
  const esRaro = (id) => !!(byId[id] && byId[id].raro);
  const raros = () => CATALOGO.filter(i => i.raro);
  function raroAleatorio(rng) {                       // una reliquia rara al azar (regalo del fundador, etc.)
    const pool = raros(); if (!pool.length) return null;
    return pool[Math.floor((rng ? rng.next() : Math.random()) * pool.length)].id;
  }
  // Botín aleatorio PONDERADO por tier (los de mayor tier salen menos), de ≤ tier.
  // Con baja probabilidad, en su lugar cae una RELIQUIA RARA (de tier cercano).
  function botinAleatorio(tier) {
    // RELIQUIAS raras (NO las ropas raras, que tienen su propio canal).
    const raroPool = raros().filter(i => i.slot !== 'torso' && (i.tier || 1) <= (tier || 1) + 1);
    if (raroPool.length && Math.random() < RARE_LOOT_CHANCE) return raroPool[Math.floor(Math.random() * raroPool.length)].id;
    // ROPA DE TORSO RARA: ~5 % (efectos superiores, contorno azul).
    const ropaRaraPool = ropasTorsoRaras();
    if (ropaRaraPool.length && Math.random() < ROPA_RARA_LOOT_CHANCE) return ropaRaraPool[Math.floor(Math.random() * ropaRaraPool.length)].id;
    // ROPA DE TORSO COMÚN: canal propio, medianamente raro. Ocultas → no salen por el pool común.
    const ropaPool = ropasTorso();
    if (ropaPool.length && Math.random() < ROPA_LOOT_CHANCE) return ropaPool[Math.floor(Math.random() * ropaPool.length)].id;
    const pool = disponibles(tier).filter(i => i.tipo !== 'caballo'); if (!pool.length) return null;   // el caballo no cae como botín (es compra única)
    const w = pool.map(i => 1 / Math.pow(2, (i.tier || 1) - 1));
    let tot = 0; w.forEach(x => tot += x); let r = Math.random() * tot;
    for (let i = 0; i < pool.length; i++) { r -= w[i]; if (r <= 0) return pool[i].id; }
    return pool[pool.length - 1].id;
  }

  return { CATALOGO, get, disponibles, bloqueados, efectoTexto, equipBonus, manualDe, stockDelDia, botinAleatorio, esRaro, raroAleatorio, ropasTorso, COUNT_BY_TIER, GLIFOS: G };
})();
if (typeof window !== 'undefined') window.HacTienda = HacTienda;
