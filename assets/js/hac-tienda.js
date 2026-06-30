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

  // tipo: 'comida' | 'tomo' | 'inventario' | 'mascota'
  const CATALOGO = Object.freeze([
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
    { id: 'caballo', nombre: 'Caballo de raza', zh: '寶馬', icon: '🐎', tier: 6, precio: 260, tipo: 'mascota', efecto: { guardable: true }, desc: 'Un corcel digno de un general.' },
    { id: 'jade',    nombre: 'Colgante de jade', zh: '玉佩', icon: '💠', tier: 6, precio: 300, tipo: 'mascota', efecto: { guardable: true }, desc: 'Pieza de jade tallado, símbolo de rango.' },
  ]);

  const byId = {}; CATALOGO.forEach(i => { byId[i.id] = i; });
  const get = (id) => byId[id] || null;
  const disponibles = (tier) => CATALOGO.filter(i => i.tier <= (tier || 1));
  const bloqueados = (tier) => CATALOGO.filter(i => i.tier > (tier || 1));

  function efectoTexto(item) {
    const e = item.efecto || {};
    if (e.energia) return `+${e.energia} energía ⚡`;
    if (e.equip) return Object.keys(e.equip).map(d => `+${e.equip[d]} ${G[d] || ''}`).join(' · ') + ' · equipable';
    if (e.xp) return Object.keys(e.xp).map(d => `+${e.xp[d]} XP ${G[d] || ''}`).join(' · ');
    if (e.capInv) return `+${e.capInv} ranuras 🎒`;
    if (e.guardable) return 'Objeto · ocupa 1 ranura';
    return '';
  }
  // Bonos de equipo de un item (o {} si no es equipable).
  function equipBonus(id) { const it = byId[id]; return (it && it.efecto && it.efecto.equip) || null; }

  return { CATALOGO, get, disponibles, bloqueados, efectoTexto, equipBonus, GLIFOS: G };
})();
if (typeof window !== 'undefined') window.HacTienda = HacTienda;
