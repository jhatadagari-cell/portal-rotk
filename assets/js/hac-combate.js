/* ═══════════════════════════════════════════════════════════════════════
   hac-combate.js — PROTOTIPO de combate por turnos estilo Octopath (slice).
   ─────────────────────────────────────────────────────────────────────────
   1 encuentro: tu banda (3) vs 1 enemigo. En SOLITARIO controlas a los 3.
   Mecánicas: orden de turnos por velocidad, ESCUDO + ROTURA (rompes al golpear
   debilidades), debilidades OCULTAS (???) que se revelan al probar, BP (Boost),
   SP para habilidades. El chino solo adorna; el texto accionable va en castellano.
   Aislado: no toca la finca. Se juega en combate.html.
   ═══════════════════════════════════════════════════════════════════════ */
const HacCombate = (function () {
  'use strict';

  // Tipos de daño (icono = adorno; nombre accionable en castellano).
  const TIPOS = {
    espada: { es: 'Espada', zh: '劍' },
    lanza:  { es: 'Lanza',  zh: '槍' },
    arco:   { es: 'Arco',   zh: '弓' },
    fuego:  { es: 'Fuego',  zh: '火' },
    viento: { es: 'Viento', zh: '風' },
  };
  const rnd = (a, b) => a + Math.random() * (b - a);
  const ri = (a, b) => Math.floor(rnd(a, b + 1));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // Plantilla de banda (tu mecenas + 2). Todos jugables en solitario.
  function nuevaParty() {
    return [
      { id: 'g', name: 'Guan Yu', rol: 'Guerrero', aptitud: 'militar', aspecto: { robe: '#7a3b34', piel: 1, pelo: 0 },
        maxHp: 130, hp: 130, maxSp: 22, sp: 22, spd: 9, bp: 1, wpn: 'espada', def: false,
        skills: [
          { name: 'Tajo doble', type: 'espada', sp: 6, hits: 2, power: 15 },
          { name: 'Estocada', type: 'lanza', sp: 8, hits: 1, power: 30 },
        ] },
      { id: 'a', name: 'Huang Zhong', rol: 'Arquero', aptitud: 'militar', aspecto: { robe: '#4e6f8f', piel: 0, pelo: 2 },
        maxHp: 98, hp: 98, maxSp: 26, sp: 26, spd: 12, bp: 1, wpn: 'arco', def: false,
        skills: [
          { name: 'Andanada', type: 'arco', sp: 7, hits: 3, power: 10 },
          { name: 'Flecha ígnea', type: 'fuego', sp: 10, hits: 1, power: 26 },
        ] },
      { id: 'm', name: 'Zhuge Liang', rol: 'Estratega', aptitud: 'cultural', aspecto: { robe: '#7f9e6a', piel: 0, pelo: 0 },
        maxHp: 84, hp: 84, maxSp: 38, sp: 38, spd: 8, bp: 1, wpn: 'viento', def: false,
        skills: [
          { name: 'Llamarada', type: 'fuego', sp: 9, hits: 1, power: 30 },
          { name: 'Ventisca', type: 'viento', sp: 9, hits: 2, power: 15 },
          { name: 'Vendaval curativo', type: 'cura', sp: 10, heal: 55 },
        ] },
    ];
  }
  // Enemigo del slice (rating 1 ≈ Turbantes). Debilidades OCULTAS al empezar.
  function nuevoEnemigo() {
    const tipos = Object.keys(TIPOS);
    // 2 debilidades al azar (ocultas). Determinista dentro de la partida.
    const pool = tipos.slice(); const weak = [];
    for (let i = 0; i < 2; i++) weak.push(pool.splice(ri(0, pool.length - 1), 1)[0]);
    return {
      name: 'Cabecilla Turbante', zh: '黃巾', aptitud: 'militar', aspecto: { robe: '#caa23c', piel: 2, pelo: 1 },
      maxHp: 460, hp: 460, maxShield: 4, shield: 4, weak: weak, revelado: {}, roto: false, rotoTurnos: 0,
      spd: 10, atk: [22, 34],
    };
  }

  let root = null, party = [], enemy = null, orden = [], idx = 0, ronda = 1, busy = false, over = false, sel = { skill: -1, boost: 0 };
  let elTimeline, elScene, elParty, elMenu, elLog, logLines = [];

  const alive = (u) => u.hp > 0;
  const partyAlive = () => party.filter(alive);

  // ── Orden de turnos de la ronda (por velocidad, desc) ──────────────────────
  function calcOrden() {
    const units = [enemy].concat(party).filter(alive);
    units.sort((a, b) => b.spd - a.spd || (a === enemy ? 1 : -1));
    orden = units; idx = 0;
  }
  function actual() { return orden[idx]; }

  function log(msg) { logLines.unshift(msg); logLines = logLines.slice(0, 5); if (elLog) elLog.innerHTML = logLines.map((l, i) => `<div class="hcb-log-l" style="opacity:${1 - i * 0.16}">${l}</div>`).join(''); }

  // ── Daño y rotura ──────────────────────────────────────────────────────────
  function golpe(tipo, power, hits) {
    let total = 0, rompio = false;
    for (let i = 0; i < hits; i++) {
      if (enemy.hp <= 0) break;
      const esDebil = enemy.weak.indexOf(tipo) >= 0;
      if (esDebil) { enemy.revelado[tipo] = true; if (!enemy.roto && enemy.shield > 0) { enemy.shield--; if (enemy.shield === 0) { rompio = true; enemy.roto = true; enemy.rotoTurnos = 1; } } }
      const mult = (enemy.roto ? 1.6 : 1) * (esDebil ? 1.3 : 0.7);
      const dmg = Math.max(1, Math.round(power * mult * rnd(0.92, 1.08)));
      enemy.hp = Math.max(0, enemy.hp - dmg); total += dmg;
    }
    return { total, rompio };
  }

  // ── Acciones del jugador ───────────────────────────────────────────────────
  function ejecutar(u, action) {
    if (busy || over || actual() !== u) return;
    const boost = sel.boost | 0;
    if (action.sp && u.sp < action.sp) { log(`<b>${u.name}</b> no tiene SP para ${action.name}.`); return; }
    if (action.sp) u.sp -= action.sp;
    if (boost > 0) u.bp = Math.max(0, u.bp - boost);
    busy = true; u.def = false;
    if (action.heal) {                                   // curación (al aliado más herido)
      const target = partyAlive().slice().sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp))[0] || u;
      const heal = Math.round(action.heal * (1 + boost * 0.5));
      target.hp = Math.min(target.maxHp, target.hp + heal);
      log(`<b>${u.name}</b> cura a <b>${target.name}</b> (+${heal} PV).`);
      pulse(target.id, 'heal');
    } else if (action.defend) {
      u.def = true; u.sp = Math.min(u.maxSp, u.sp + 4);
      log(`<b>${u.name}</b> se pone en guardia.`);
    } else {
      const hits = (action.hits || 1) + boost;           // cada BP = +1 golpe (más rotura + daño)
      const r = golpe(action.type, action.power, hits);
      const t = TIPOS[action.type];
      log(`<b>${u.name}</b> · ${action.name} 〔${t ? t.zh : '·'}〕 → ${r.total} de daño${r.rompio ? ' · <span class="hcb-break">¡ESCUDO ROTO!</span>' : ''}`);
      pulse('enemy', r.rompio ? 'break' : 'hit');
    }
    render();
    setTimeout(() => { busy = false; avanzar(); }, r_delay());
  }
  function r_delay() { return 420; }

  // ── Turno del enemigo (IA simple) ──────────────────────────────────────────
  function turnoEnemigo() {
    busy = true;
    if (enemy.roto) {                                    // aturdido: pierde el turno y se recupera
      enemy.rotoTurnos--; log(`<b>${enemy.name}</b> está aturdido y no puede actuar.`);
      if (enemy.rotoTurnos <= 0) { enemy.roto = false; enemy.shield = enemy.maxShield; }
      render(); setTimeout(() => { busy = false; avanzar(); }, 700); return;
    }
    const vivos = partyAlive(); const target = vivos[ri(0, vivos.length - 1)];
    let dmg = ri(enemy.atk[0], enemy.atk[1]); if (target.def) dmg = Math.round(dmg * 0.5);
    target.hp = Math.max(0, target.hp - dmg);
    log(`<b>${enemy.name}</b> golpea a <b>${target.name}</b> · ${dmg} de daño${target.def ? ' (en guardia)' : ''}.`);
    pulse(target.id, 'hurt');
    render();
    setTimeout(() => { busy = false; avanzar(); }, r_delay());
  }

  // ── Avance de turnos ────────────────────────────────────────────────────────
  function avanzar() {
    if (comprobarFin()) return;
    idx++;
    if (idx >= orden.length) { ronda++; calcOrden(); }
    // salta unidades muertas
    while (orden[idx] && !alive(orden[idx])) idx++;
    if (idx >= orden.length) { ronda++; calcOrden(); }
    const u = actual();
    if (u === enemy) { render(); setTimeout(turnoEnemigo, 500); }
    else { u.bp = Math.min(5, u.bp + 1); sel = { skill: -1, boost: 0 }; render(); }
  }
  function comprobarFin() {
    if (enemy.hp <= 0 && !over) { over = true; render(); fin(true); return true; }
    if (!partyAlive().length && !over) { over = true; render(); fin(false); return true; }
    return false;
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  function spriteData(u, dir) {
    const c = document.createElement('canvas');
    if (window.HacChar) HacChar.draw(c, { aptitud: u.aptitud, aspecto: u.aspecto, dir: dir, frame: 0, scale: 3 });
    return c.toDataURL ? c.toDataURL() : '';
  }
  const spriteCache = {};
  function sprite(u, dir) { const k = u.id + dir; if (!spriteCache[k]) spriteCache[k] = spriteData(u, dir); return spriteCache[k]; }

  function bar(v, mx, cls) { return `<div class="hcb-bar ${cls}"><span style="width:${clamp(v / mx * 100, 0, 100)}%"></span></div>`; }
  function bpPips(n) { let s = ''; for (let i = 0; i < 5; i++) s += `<i class="hcb-bp${i < n ? ' on' : ''}"></i>`; return s; }

  function renderTimeline() {
    const chip = (u) => {
      const cur = u === actual();
      const face = u === enemy ? '賊' : (u.name[0]);
      return `<div class="hcb-tl-chip${cur ? ' cur' : ''}${u === enemy ? ' foe' : ''}" title="${u.name}"><span>${face}</span></div>`;
    };
    elTimeline.innerHTML = `<div class="hcb-tl-lbl">Ronda ${ronda} · orden</div><div class="hcb-tl-row">${orden.map(chip).join('')}</div>`;
  }
  function weakPips() {
    // Una casilla por debilidad: ??? hasta revelarla; entonces muestra el icono.
    return enemy.weak.map(t => enemy.revelado[t]
      ? `<span class="hcb-wk on" title="${TIPOS[t].es}">${TIPOS[t].zh}</span>`
      : `<span class="hcb-wk">?</span>`).join('');
  }
  function renderScene() {
    const foe = `<div class="hcb-foe" data-u="enemy">
        <div class="hcb-foe-top"><b>${enemy.name}</b> <span class="hcb-foe-zh">${enemy.zh}</span></div>
        <div class="hcb-shield${enemy.roto ? ' broken' : ''}"><span class="hcb-shield-ic">🛡</span><b>${enemy.roto ? '¡ROTO!' : enemy.shield}</b></div>
        <div class="hcb-weak"><span class="hcb-weak-lbl">Debilidades</span> ${weakPips()}</div>
        <img class="hcb-spr foe${enemy.roto ? ' broken' : ''}" src="${sprite(enemy, 'SE')}" alt="">
        ${bar(enemy.hp, enemy.maxHp, 'hp')}
        <div class="hcb-foe-hp">${enemy.hp}/${enemy.maxHp}</div>
      </div>`;
    const allies = party.map(u => `<div class="hcb-ally${!alive(u) ? ' dead' : ''}${u === actual() ? ' cur' : ''}" data-u="${u.id}">
        <img class="hcb-spr" src="${sprite(u, 'SW')}" alt="">
      </div>`).join('');
    elScene.innerHTML = `<div class="hcb-foes">${foe}</div><div class="hcb-allies">${allies}</div>`;
  }
  function renderParty() {
    elParty.innerHTML = party.map(u => `<div class="hcb-pc${!alive(u) ? ' dead' : ''}${u === actual() ? ' cur' : ''}">
        <div class="hcb-pc-h"><b>${u.name}</b> <span class="hcb-pc-rol">${u.rol}</span>${u.def ? ' <span class="hcb-guard">guardia</span>' : ''}</div>
        <div class="hcb-pc-row"><span class="hcb-pc-k">PV</span>${bar(u.hp, u.maxHp, 'hp')}<span class="hcb-pc-v">${u.hp}/${u.maxHp}</span></div>
        <div class="hcb-pc-row"><span class="hcb-pc-k">SP</span>${bar(u.sp, u.maxSp, 'sp')}<span class="hcb-pc-v">${u.sp}/${u.maxSp}</span></div>
        <div class="hcb-pc-bp">BP ${bpPips(u.bp)}</div>
      </div>`).join('');
  }
  function renderMenu() {
    const u = actual();
    if (over) { elMenu.innerHTML = ''; return; }
    if (u === enemy) { elMenu.innerHTML = `<div class="hcb-menu-wait">Turno de <b>${enemy.name}</b>…</div>`; return; }
    const maxB = Math.min(3, u.bp);
    const boostRow = `<div class="hcb-boost"><span class="hcb-boost-lbl">Boost</span>
      ${[0, 1, 2, 3].map(n => `<button class="hcb-boost-b${sel.boost === n ? ' on' : ''}${n > maxB ? ' dis' : ''}" data-boost="${n}"${n > maxB ? ' disabled' : ''}>${n === 0 ? '—' : '+' + n}</button>`).join('')}
      <span class="hcb-boost-hint">cada BP = +1 golpe</span></div>`;
    const wpn = TIPOS[u.wpn];
    const btns = [`<button class="hcb-act atk" data-act="basic">Atacar<small>〔${wpn.zh}〕 ${wpn.es}</small></button>`]
      .concat(u.skills.map((s, i) => {
        const t = s.type === 'cura' ? { es: 'Cura', zh: '癒' } : TIPOS[s.type];
        const noSp = u.sp < s.sp;
        return `<button class="hcb-act${noSp ? ' dis' : ''}" data-skill="${i}"${noSp ? ' disabled' : ''}>${s.name}<small>〔${t.zh}〕 ${s.heal ? '+PV' : (s.hits > 1 ? s.hits + '× ' : '') + t.es} · ${s.sp} SP</small></button>`;
      }))
      .concat([`<button class="hcb-act def" data-act="defend">Defender<small>−50% daño</small></button>`]);
    elMenu.innerHTML = `<div class="hcb-menu-who">Actúa <b>${u.name}</b></div>${boostRow}<div class="hcb-acts">${btns.join('')}</div>`;
  }
  function render() { renderTimeline(); renderScene(); renderParty(); renderMenu(); }

  function pulse(id, kind) {
    const el = elScene && elScene.querySelector(id === 'enemy' ? '.hcb-foe' : `.hcb-ally[data-u="${id}"]`);
    if (!el) return; const c = 'hcb-fx-' + kind; el.classList.add(c); setTimeout(() => el.classList.remove(c), 480);
  }

  function fin(win) {
    setTimeout(() => {
      const ov = document.createElement('div'); ov.className = 'hcb-end';
      ov.innerHTML = `<div class="hcb-end-box ${win ? 'win' : 'lose'}">
        <div class="hcb-end-t">${win ? '¡Victoria!' : 'Derrota'}</div>
        <div class="hcb-end-s">${win ? 'La banda ha roto y abatido al enemigo.' : 'La banda ha caído. Volved más fuertes.'}</div>
        <button class="hcb-end-btn" data-restart>Combatir de nuevo</button></div>`;
      root.appendChild(ov);
      ov.querySelector('[data-restart]').addEventListener('click', () => { ov.remove(); start(); });
    }, 500);
  }

  // ── Entrada de usuario ───────────────────────────────────────────────────────
  function onClick(e) {
    const b = e.target.closest('button'); if (!b || busy || over) return;
    if (b.dataset.boost != null) { sel.boost = +b.dataset.boost; renderMenu(); return; }
    const u = actual(); if (!u || u === enemy) return;
    if (b.dataset.act === 'basic') return ejecutar(u, { name: 'Atacar', type: u.wpn, hits: 1, power: 13, sp: 0 });
    if (b.dataset.act === 'defend') return ejecutar(u, { name: 'Defender', defend: true, sp: 0 });
    if (b.dataset.skill != null) return ejecutar(u, u.skills[+b.dataset.skill]);
  }

  function start() {
    party = nuevaParty(); enemy = nuevoEnemigo(); ronda = 1; over = false; busy = false; logLines = []; sel = { skill: -1, boost: 0 };
    calcOrden();
    // Si el enemigo abre, pásale el turno; si no, espera al jugador.
    render(); log('Comienza la escaramuza. Descubre las debilidades del enemigo y rómpele el escudo.');
    const u = actual(); if (u === enemy) setTimeout(turnoEnemigo, 700);
  }

  function init(container) {
    root = container;
    root.innerHTML = `<div class="hcb">
      <div class="hcb-timeline" data-tl></div>
      <div class="hcb-scene" data-scene></div>
      <div class="hcb-log" data-log></div>
      <div class="hcb-party" data-party></div>
      <div class="hcb-menu" data-menu></div>
    </div>`;
    elTimeline = root.querySelector('[data-tl]'); elScene = root.querySelector('[data-scene]');
    elParty = root.querySelector('[data-party]'); elMenu = root.querySelector('[data-menu]'); elLog = root.querySelector('[data-log]');
    root.addEventListener('click', onClick);
    start();
  }
  return { init };
})();
if (typeof window !== 'undefined') window.HacCombate = HacCombate;
