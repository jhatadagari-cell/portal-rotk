// Respeta la preferencia del sistema de "movimiento reducido":
// con ella activa, los efectos ambientales no arrancan.
const _REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ── CHERRY BLOSSOM AMBIENT (Turbantes Amarillos) ──

const blossomOverlay = document.createElement('div');
blossomOverlay.id = 'blossom-overlay';
document.body.appendChild(blossomOverlay);


const _blossomAnis = ['pfall-a','pfall-b','pfall-c'];
const _blossomCols = ['hsla(340,65%,84%,.82)','hsla(345,70%,88%,.76)','hsla(350,60%,81%,.85)','hsla(335,55%,90%,.78)'];
let _blossomTimer = null;

function _spawnPetal() {
  const p = document.createElement('div');
  p.className = 'bpetal';
  const w = 7 + Math.random() * 7;
  p.style.cssText = [
    `width:${w}px`,
    `height:${(w*1.4).toFixed(1)}px`,
    `left:${(Math.random()*100).toFixed(1)}%`,
    `top:-18px`,
    `background:${_blossomCols[Math.random()*_blossomCols.length|0]}`,
    `animation:${_blossomAnis[Math.random()*3|0]} ${(5+Math.random()*5).toFixed(1)}s ${(Math.random()*2).toFixed(1)}s linear forwards`
  ].join(';');
  blossomOverlay.appendChild(p);
  p.addEventListener('animationend', () => p.remove());
}

function startBlossom() {
  if (_REDUCED) return;
  if (activeEra && activeEra !== 'turbantes') return;
  if (_blossomTimer) return;
  document.body.classList.add('blossom-on');
  for (let i = 0; i < 16; i++) setTimeout(_spawnPetal, i * 85);
  _blossomTimer = setInterval(_spawnPetal, 620);
}

function stopBlossom() {
  if (activeEra === 'turbantes') return;
  document.body.classList.remove('blossom-on');
  clearInterval(_blossomTimer); _blossomTimer = null;
}

const _turbCard = document.querySelector('.pcard[data-pid="turbantes"]');
if (_turbCard) {
  _turbCard.addEventListener('mouseenter', startBlossom);
  _turbCard.addEventListener('mouseleave', stopBlossom);
}

// ── CHIBI — Ceniza + viento (DOM) · Brasas (canvas + bloom) ──
// Las brasas usan canvas con additive blending: se iluminan entre sí y con
// el fondo igual que fuego real. El bloom pass (CSS blur+screen) genera
// el halo sin Three.js. Ceniza y ráfagas siguen en DOM (formas geométricas
// no necesitan additive blending).

const fireOverlay = document.createElement('div');
fireOverlay.id = 'fire-overlay';
document.body.appendChild(fireOverlay);

// Canvas brasas (z-99, nítido) + bloom (z-100, blur+screen)
const _cnv = document.createElement('canvas');
_cnv.id = 'chibi-canvas';
document.body.appendChild(_cnv);
const _ctx = _cnv.getContext('2d');

const _bloomCnv = document.createElement('canvas');
_bloomCnv.id = 'chibi-bloom';
document.body.appendChild(_bloomCnv);
const _bloomCtx = _bloomCnv.getContext('2d');

let _cW, _cH;
(function _szCnv(){
  _cW = _cnv.width = _bloomCnv.width = innerWidth;
  _cH = _cnv.height = _bloomCnv.height = innerHeight;
})();
window.addEventListener('resize', () => {
  _cW = _cnv.width = _bloomCnv.width = innerWidth;
  _cH = _cnv.height = _bloomCnv.height = innerHeight;
});

// ── Sprites pre-horneados: 12 pasos de color (caliente → frío) ──
// Núcleo blanco-cálido → corona naranja → halo rojo → transparente.
// Un canvas 52×52 por paso; drawImage es mucho más barato que radialGradient por frame.
const _ESPR_SZ = 52;
function _bakeEmberSpr(g) {
  const c = document.createElement('canvas');
  c.width = c.height = _ESPR_SZ;
  const x = c.getContext('2d');
  const grd = x.createRadialGradient(_ESPR_SZ/2,_ESPR_SZ/2,0, _ESPR_SZ/2,_ESPR_SZ/2,_ESPR_SZ/2);
  grd.addColorStop(0.00, 'rgba(255,252,235,1)');
  grd.addColorStop(0.16, `rgba(255,${g},8,0.96)`);
  grd.addColorStop(0.46, `rgba(255,${Math.max(0,g-55)},0,0.46)`);
  grd.addColorStop(0.76, `rgba(${Math.max(180,255-Math.round(g*0.5))},0,0,0.14)`);
  grd.addColorStop(1.00, 'rgba(0,0,0,0)');
  x.fillStyle = grd; x.fillRect(0,0,_ESPR_SZ,_ESPR_SZ);
  return c;
}
const _ESPR = [];
for (let _ei = 0; _ei < 12; _ei++) {
  // g recorre 235 (amarillo brillante) → 12 (rojo intenso)
  _ESPR.push(_bakeEmberSpr(Math.round(235 - (_ei / 11) * 223)));
}

// ── EmberP: brasa individual con trail de 5 puntos ──
function EmberP() {
  this.x  = _cW * (0.04 + Math.random() * 0.92);
  this.y  = _cH * (0.18 + Math.random() * 0.74);
  this.vx = -(1.8 + Math.random() * 3.6);    // viento siempre a la izquierda
  this.vy = -(0.8 + Math.random() * 2.8);    // sube al nacer
  this.r  = 2.4 + Math.random() * 6.2;
  this.life  = 1.0;
  this.decay = 0.010 + Math.random() * 0.016;
  this.w  = Math.random() * 6.28;
  this.trail = [];
}
EmberP.prototype.tick = function() {
  this.trail.push({ x: this.x, y: this.y });
  if (this.trail.length > 5) this.trail.shift();
  this.w  += 0.14;
  this.vy += 0.058;                           // gravedad suave
  this.vx += (Math.random() - 0.52) * 0.09;  // turbulencia
  this.x  += this.vx + Math.sin(this.w) * 0.72;
  this.y  += this.vy;
  this.life -= this.decay;
};
EmberP.prototype.draw = function() {
  const age = 1 - this.life;
  const spr = _ESPR[Math.min(11, (age * 12) | 0)];
  const tn  = this.trail.length;
  // Cola: segmentos anteriores con opacidad y tamaño decrecientes
  for (let i = 0; i < tn; i++) {
    const tf = (i + 1) / tn;
    const rd = this.r * (0.20 + tf * 0.65);
    _ctx.globalAlpha = tf * this.life * 0.55;
    _ctx.drawImage(spr, this.trail[i].x - rd, this.trail[i].y - rd, rd * 2, rd * 2);
  }
  // Núcleo
  const rd = this.r * (0.42 + this.life * 0.58);
  _ctx.globalAlpha = this.life * 0.94;
  _ctx.drawImage(spr, this.x - rd, this.y - rd, rd * 2, rd * 2);
  _ctx.globalAlpha = 1;
};
EmberP.prototype.dead = function() {
  return this.life <= 0 || this.x < -30 || this.y > _cH + 30;
};

let _embers = [], _raf = null, _lt = 0, _est = 0;

function _loopFire(t) {
  _raf = requestAnimationFrame(_loopFire);
  const dt = Math.min(t - _lt, 50); _lt = t; _est += dt;

  _ctx.clearRect(0, 0, _cW, _cH);
  _bloomCtx.clearRect(0, 0, _cW, _cH);

  // Spawn cada ~28 ms: 3–5 brasas nuevas mientras no saturemos
  if (_est > 28) {
    _est = 0;
    if (_embers.length < 160) {
      const n = 3 + (Math.random() * 3 | 0);
      for (let i = 0; i < n; i++) _embers.push(new EmberP());
    }
  }

  _embers = _embers.filter(e => { e.tick(); return !e.dead(); });

  // Additive blending: las brasas se acumulan y se iluminan entre sí
  _ctx.globalCompositeOperation = 'lighter';
  _embers.forEach(e => e.draw());
  _ctx.globalCompositeOperation = 'source-over';

  // Bloom: solo brasas jóvenes (life > 0.48) — las más brillantes dan el halo
  _bloomCtx.globalCompositeOperation = 'lighter';
  _embers.forEach(e => {
    if (e.life > 0.48) {
      const spr = _ESPR[Math.min(11, ((1 - e.life) * 12) | 0)];
      const rd  = e.r * 2.1;
      _bloomCtx.globalAlpha = (e.life - 0.48) / 0.52 * 0.58;
      _bloomCtx.drawImage(spr, e.x - rd, e.y - rd, rd * 2, rd * 2);
    }
  });
  _bloomCtx.globalCompositeOperation = 'source-over';
  _bloomCtx.globalAlpha = 1;
}

let _ashTimer = null;

// Ceniza y carbón — DOM, arrastrados por el viento
function _spawnAsh() {
  const el  = document.createElement('div');
  const lg  = Math.random() > 0.65;
  el.className = 'chibif';
  const sz   = lg ? (9 + Math.random() * 18) : (2 + Math.random() * 8);
  const szH  = (sz * (0.35 + Math.random() * 0.60)).toFixed(1);
  const top  = (-5 + Math.random() * 108).toFixed(1);
  const left = (10 + Math.random() * 95).toFixed(1);
  const dx   = (-(200 + Math.random() * 320)).toFixed(1);
  const dy   = (-15 + Math.random() * 60).toFixed(1);
  const rot  = (Math.random() * 900 - 200).toFixed(1);
  const dur  = (1.2 + Math.random() * 2.0).toFixed(2);
  const del  = (Math.random() * 0.10).toFixed(2);
  const v    = Math.random();
  const r    = (16 + v * 30) | 0;
  const a    = (0.60 + Math.random() * 0.35).toFixed(2);
  el.style.cssText = [
    `width:${sz.toFixed(1)}px`, `height:${szH}px`,
    `top:${top}%`, `left:${left}%`,
    `background:rgba(${r},${Math.max(0,r-8)|0},${Math.max(0,r-15)|0},${a})`,
    `--dx:${dx}px`, `--dy:${dy}vh`, `--rot:${rot}deg`,
    `animation:chibif-fly ${dur}s ${del}s ease-in forwards`
  ].join(';');
  document.body.appendChild(el);
  el.addEventListener('animationend', () => el.remove());
}

// Ráfagas de viento — DOM, 2–4 líneas paralelas por ráfaga
function _spawnGust() {
  const n    = 2 + (Math.random() * 3 | 0);
  const base = 4 + Math.random() * 82;
  for (let i = 0; i < n; i++) {
    const el  = document.createElement('div');
    el.className = 'chibig';
    const top = (base + i * (1.0 + Math.random() * 3.2)).toFixed(1);
    const len = (160 + Math.random() * 280).toFixed(0);
    const dur = (0.28 + Math.random() * 0.32).toFixed(2);
    const del = (i * 0.030).toFixed(3);
    el.style.cssText = [
      `top:${top}%`, `width:${len}px`,
      `animation-duration:${dur}s`,
      `animation-delay:${del}s`
    ].join(';');
    document.body.appendChild(el);
    el.addEventListener('animationend', () => el.remove());
  }
}

function startFire() {
  if (_REDUCED) return;
  if (activeEra && activeEra !== 'chibi') return;
  if (_ashTimer) return;
  document.body.classList.add('fire-on');
  _cnv.style.opacity = '1';
  _bloomCnv.style.opacity = '1';
  // Ráfaga DOM inicial
  for (let i = 0; i < 48; i++) {
    setTimeout(_spawnAsh, i * 22);
    if (i % 6 === 0) setTimeout(_spawnGust, i * 22 + 3);
  }
  _ashTimer = setInterval(() => {
    _spawnAsh();
    _spawnAsh();
    if (Math.random() > 0.38) _spawnAsh();
    if (Math.random() > 0.44) _spawnGust();
  }, 150);
  // RAF brasas (solo desktop)
  if (!_raf && _cW > 640) {
    _lt = performance.now();
    _loopFire(_lt);
  }
}

function stopFire() {
  if (activeEra === 'chibi') return;
  document.body.classList.remove('fire-on');
  _cnv.style.opacity = '0';
  _bloomCnv.style.opacity = '0';
  clearInterval(_ashTimer); _ashTimer = null;
  setTimeout(() => {
    if (_raf) { cancelAnimationFrame(_raf); _raf = null; }
    _embers = [];
    _ctx.clearRect(0, 0, _cW, _cH);
    _bloomCtx.clearRect(0, 0, _cW, _cH);
  }, 1600);
}

const _chibiCard = document.querySelector('.pcard[data-pid="chibi"]');
if (_chibiCard) {
  _chibiCard.addEventListener('mouseenter', startFire);
  _chibiCard.addEventListener('mouseleave', stopFire);
}

// ── SIMA BLIZZARD AMBIENT ──
const blizzardOverlay = document.createElement('div');
blizzardOverlay.id = 'blizzard-overlay';
document.body.appendChild(blizzardOverlay);
let _blizzardTimer = null;

function _spawnFlake(strong) {
  const f = document.createElement('div');
  f.className = 'blizzard-flake';
  const base = 4 + Math.random() * 7;
  const size = strong ? base * 1.3 : base;
  const amp = strong ? 180 : 90;
  const tx1 = (Math.random() * amp * 2 - amp) * 0.32 * (strong ? 2.4 : 1);
  const tx2 = (Math.random() * amp * 2 - amp) * 0.68 * (strong ? 2.4 : 1);
  const tx3 = (Math.random() * amp * 2 - amp) * 0.9 * (strong ? 2.4 : 1);
  const tx = (Math.random() * amp * 2 - amp) * (strong ? 1.5 : 1.2);
  const rot = (Math.random() * 720 - 360) * (strong ? 1.4 : 0.9);
  const dur = 5 + Math.random() * 4 - (strong ? 0.5 : 0);
  const left = Math.random() * 100;
  f.style.cssText = `left:${left.toFixed(2)}%;width:${size.toFixed(1)}px;height:${(size * 2.4).toFixed(1)}px;--tx1:${tx1.toFixed(1)}px;--tx2:${tx2.toFixed(1)}px;--tx3:${tx3.toFixed(1)}px;--tx:${tx.toFixed(1)}px;--rot:${rot.toFixed(1)}deg;animation:flake-fall ${dur.toFixed(2)}s linear forwards;`;
  blizzardOverlay.appendChild(f);
  f.addEventListener('animationend', () => f.remove());
}

function _spawnGustLine() {
  const g = document.createElement('div');
  g.className = 'blizzard-gust';
  g.style.top = (12 + Math.random() * 70).toFixed(2) + '%';
  g.style.width = (140 + Math.random() * 80).toFixed(1) + 'px';
  g.style.animationDuration = (0.7 + Math.random() * 0.35).toFixed(2) + 's';
  blizzardOverlay.appendChild(g);
  g.addEventListener('animationend', () => g.remove());
}

function startBlizzard() {
  if (_REDUCED) return;
  if (activeEra && activeEra !== 'sima') return;
  if (_blizzardTimer) return;
  document.body.classList.add('blizzard-on');
  for (let i = 0; i < 18; i++) setTimeout(() => _spawnFlake(i % 2 === 0), i * 55);
  _blizzardTimer = setInterval(() => {
    _spawnFlake(Math.random() > 0.65);
    if (Math.random() > 0.8) _spawnGustLine();
  }, 170);
}

function stopBlizzard() {
  if (activeEra === 'sima') return;
  document.body.classList.remove('blizzard-on');
  clearInterval(_blizzardTimer);
  _blizzardTimer = null;
}

function startBlizzardGust() {
  if (_REDUCED) return;
  if (activeEra && activeEra !== 'sima' && !document.body.classList.contains('blizzard-on')) return;
  for (let i = 0; i < 12; i++) setTimeout(() => _spawnFlake(true), i * 30);
  for (let i = 0; i < 5; i++) setTimeout(_spawnGustLine, i * 80);
}

const _simaCard = document.querySelector('.pcard[data-pid="sima"]');
if (_simaCard) {
  _simaCard.addEventListener('mouseenter', startBlizzard);
  _simaCard.addEventListener('mouseleave', stopBlizzard);
  _simaCard.addEventListener('click', startBlizzardGust);
}

// ── HAN TARDÍO — 金尘 Polvo dorado ──

const dustOverlay = document.createElement('div');
dustOverlay.id = 'dust-overlay';
document.body.appendChild(dustOverlay);

let _dustTimer = null;
const _dustCols = ['hsla(40,65%,68%,.68)','hsla(38,60%,62%,.55)','hsla(42,70%,72%,.62)','hsla(36,55%,58%,.48)'];
const _dustAnis = ['dust-rise-a','dust-rise-b','dust-rise-c'];

function _spawnDust() {
  const m = document.createElement('div');
  m.className = 'dust-mote';
  const sz = (3 + Math.random() * 5).toFixed(1);
  m.style.cssText = [
    `width:${sz}px`, `height:${sz}px`,
    `left:${(Math.random()*100).toFixed(1)}%`, `bottom:-8px`,
    `background:${_dustCols[Math.random()*_dustCols.length|0]}`,
    `--dx1:${((Math.random()-.5)*60).toFixed(1)}px`,
    `--dx2:${((Math.random()-.5)*80).toFixed(1)}px`,
    `animation:${_dustAnis[Math.random()*3|0]} ${(10+Math.random()*8).toFixed(1)}s ${(Math.random()*3).toFixed(1)}s ease-in-out forwards`
  ].join(';');
  dustOverlay.appendChild(m);
  m.addEventListener('animationend', () => m.remove());
}

function startDust() {
  if (_REDUCED) return;
  if (activeEra && activeEra !== 'han-tardio') return;
  if (_dustTimer) return;
  document.body.classList.add('dust-on');
  for (let i = 0; i < 22; i++) setTimeout(_spawnDust, i * 80);
  _dustTimer = setInterval(_spawnDust, 560);
}
function stopDust() {
  if (activeEra === 'han-tardio') return;
  document.body.classList.remove('dust-on');
  clearInterval(_dustTimer); _dustTimer = null;
}

const _hanCard = document.querySelector('.pcard[data-pid="han-tardio"]');
if (_hanCard) {
  _hanCard.addEventListener('mouseenter', startDust);
  _hanCard.addEventListener('mouseleave', stopDust);
}

// ── JIN — 太平 Linternas de paz ──

const peaceOverlay = document.createElement('div');
peaceOverlay.id = 'peace-overlay';
document.body.appendChild(peaceOverlay);

let _peaceTimer = null;
const _peaceCols = [
  ['rgba(255,255,240,.82)','rgba(255,255,225,.28)'],
  ['rgba(200,245,235,.72)','rgba(180,235,220,.22)'],
  ['rgba(220,252,246,.68)','rgba(200,240,232,.20)']
];

function _spawnLantern() {
  const pl = document.createElement('div');
  pl.className = 'peace-light';
  const sz = (6 + Math.random() * 9).toFixed(1);
  const ci = Math.random() * _peaceCols.length | 0;
  pl.style.cssText = [
    `width:${sz}px`, `height:${sz}px`,
    `left:${(Math.random()*100).toFixed(1)}%`, `bottom:-12px`,
    `background:${_peaceCols[ci][0]}`,
    `box-shadow:0 0 ${(parseFloat(sz)*2.4).toFixed(0)}px ${_peaceCols[ci][1]}`,
    `--lx1:${((Math.random()-.5)*55).toFixed(1)}px`,
    `--lx2:${((Math.random()-.5)*75).toFixed(1)}px`,
    `animation:lantern-rise ${(8+Math.random()*6).toFixed(1)}s ${(Math.random()*2).toFixed(1)}s ease-in-out forwards`
  ].join(';');
  peaceOverlay.appendChild(pl);
  pl.addEventListener('animationend', () => pl.remove());
}

function startPeace() {
  if (_REDUCED) return;
  if (activeEra && activeEra !== 'jin') return;
  if (_peaceTimer) return;
  document.body.classList.add('peace-on');
  for (let i = 0; i < 20; i++) setTimeout(_spawnLantern, i * 110);
  _peaceTimer = setInterval(_spawnLantern, 680);
}
function stopPeace() {
  if (activeEra === 'jin') return;
  document.body.classList.remove('peace-on');
  clearInterval(_peaceTimer); _peaceTimer = null;
}

const _jinCard = document.querySelector('.pcard[data-pid="jin"]');
if (_jinCard) {
  _jinCard.addEventListener('mouseenter', startPeace);
  _jinCard.addEventListener('mouseleave', stopPeace);
}

// ── GUERRAS SEÑORES — 落叶 Hojas de otoño ──

const leavesOverlay = document.createElement('div');
leavesOverlay.id = 'leaves-overlay';
document.body.appendChild(leavesOverlay);

let _leavesTimer = null;
const _leafCols = ['hsla(15,65%,34%,.82)','hsla(22,68%,40%,.78)','hsla(10,58%,28%,.88)','hsla(32,62%,46%,.72)','hsla(8,50%,32%,.8)'];
const _leafAnis  = ['leaf-a','leaf-b','leaf-c'];

function _spawnLeaf() {
  const lf = document.createElement('div');
  lf.className = 'autumn-leaf';
  const sz = (8 + Math.random() * 10).toFixed(1);
  lf.style.cssText = [
    `width:${sz}px`, `height:${(parseFloat(sz)*.8).toFixed(1)}px`,
    `left:${(Math.random()*105).toFixed(1)}%`, `top:-16px`,
    `background:${_leafCols[Math.random()*_leafCols.length|0]}`,
    `animation:${_leafAnis[Math.random()*3|0]} ${(4.5+Math.random()*4).toFixed(1)}s ${(Math.random()*1.2).toFixed(1)}s linear forwards`
  ].join(';');
  leavesOverlay.appendChild(lf);
  lf.addEventListener('animationend', () => lf.remove());
}

function startLeaves() {
  if (_REDUCED) return;
  if (activeEra && activeEra !== 'guerras-senores') return;
  if (_leavesTimer) return;
  document.body.classList.add('leaves-on');
  for (let i = 0; i < 26; i++) setTimeout(_spawnLeaf, i * 65);
  _leavesTimer = setInterval(_spawnLeaf, 300);
}
function stopLeaves() {
  if (activeEra === 'guerras-senores') return;
  document.body.classList.remove('leaves-on');
  clearInterval(_leavesTimer); _leavesTimer = null;
}

const _guerrasCard = document.querySelector('.pcard[data-pid="guerras-senores"]');
if (_guerrasCard) {
  _guerrasCard.addEventListener('mouseenter', startLeaves);
  _guerrasCard.addEventListener('mouseleave', stopLeaves);
}

// ── DONG ZHUO — 焚城 Brasas en llamas ──

const cinderOverlay = document.createElement('div');
cinderOverlay.id = 'cinder-overlay';
document.body.appendChild(cinderOverlay);

let _cinderTimer = null;
const _cinderBright = ['rgba(255,90,10,.88)','rgba(255,140,30,.78)','rgba(220,55,5,.72)'];
const _cinderAsh    = ['rgba(55,18,4,.58)','rgba(80,25,6,.46)'];
const _cinderAnis   = ['cinder-a','cinder-b','cinder-c'];

function _spawnCinder() {
  const el = document.createElement('div');
  el.className = 'cinder';
  const isSpark = Math.random() > 0.35;
  const sz = (isSpark ? 2+Math.random()*2.5 : 4+Math.random()*5).toFixed(1);
  const cols = isSpark ? _cinderBright : _cinderAsh;
  el.style.cssText = [
    `width:${sz}px`, `height:${sz}px`,
    `left:${(Math.random()*105).toFixed(1)}%`, `top:-8px`,
    `background:${cols[Math.random()*cols.length|0]}`,
    `animation:${_cinderAnis[Math.random()*3|0]} ${(2.5+Math.random()*3.5).toFixed(1)}s ${(Math.random()*.8).toFixed(1)}s linear forwards`
  ].join(';');
  cinderOverlay.appendChild(el);
  el.addEventListener('animationend', () => el.remove());
}

function startCinder() {
  if (_REDUCED) return;
  if (activeEra && activeEra !== 'dong-zhuo') return;
  if (_cinderTimer) return;
  document.body.classList.add('cinder-on');
  for (let i = 0; i < 34; i++) setTimeout(_spawnCinder, i * 45);
  _cinderTimer = setInterval(_spawnCinder, 210);
}
function stopCinder() {
  if (activeEra === 'dong-zhuo') return;
  document.body.classList.remove('cinder-on');
  clearInterval(_cinderTimer); _cinderTimer = null;
}

const _dongCard = document.querySelector('.pcard[data-pid="dong-zhuo"]');
if (_dongCard) {
  _dongCard.addEventListener('mouseenter', startCinder);
  _dongCard.addEventListener('mouseleave', stopCinder);
}

// ── GUERRAS OCASO — 暮雨 Lluvia crepuscular ──

const duskOverlay = document.createElement('div');
duskOverlay.id = 'dusk-overlay';
document.body.appendChild(duskOverlay);

let _duskTimer = null;
const _duskCols = ['rgba(200,158,96,.62)','rgba(185,145,80,.52)','rgba(215,170,108,.58)'];

function _spawnDrop() {
  const dr = document.createElement('div');
  dr.className = 'rain-drop';
  dr.style.cssText = [
    `height:${(12+Math.random()*12).toFixed(1)}px`,
    `left:${(Math.random()*104).toFixed(1)}%`, `top:-26px`,
    `background:${_duskCols[Math.random()*_duskCols.length|0]}`,
    `--rdx:${(55+Math.random()*30).toFixed(1)}px`,
    `animation:dusk-rain ${(.7+Math.random()*.45).toFixed(2)}s ${(Math.random()*.4).toFixed(2)}s linear forwards`
  ].join(';');
  duskOverlay.appendChild(dr);
  dr.addEventListener('animationend', () => dr.remove());
}

function startDuskRain() {
  if (_REDUCED) return;
  if (activeEra && activeEra !== 'guerras-ocaso') return;
  if (_duskTimer) return;
  document.body.classList.add('dusk-rain-on');
  for (let i = 0; i < 55; i++) setTimeout(_spawnDrop, i * 20);
  _duskTimer = setInterval(_spawnDrop, 72);
}
function stopDuskRain() {
  if (activeEra === 'guerras-ocaso') return;
  document.body.classList.remove('dusk-rain-on');
  clearInterval(_duskTimer); _duskTimer = null;
}

const _ocasoCard = document.querySelector('.pcard[data-pid="guerras-ocaso"]');
if (_ocasoCard) {
  _ocasoCard.addEventListener('mouseenter', startDuskRain);
  _ocasoCard.addEventListener('mouseleave', stopDuskRain);
}

// ── OCHO PRÍNCIPES — 乱雨 Tormenta de caos ──

const chaosOverlay = document.createElement('div');
chaosOverlay.id = 'chaos-overlay';
document.body.appendChild(chaosOverlay);

let _chaosRainTimer = null;
let _lightningTimer = null;
const _chaosCols = ['rgba(175,185,198,.58)','rgba(155,165,178,.48)','rgba(190,198,210,.52)'];

function _spawnChaosRain() {
  const dr = document.createElement('div');
  dr.className = 'chaos-drop';
  dr.style.cssText = [
    `height:${(16+Math.random()*14).toFixed(1)}px`,
    `left:${(Math.random()*108).toFixed(1)}%`, `top:-32px`,
    `background:${_chaosCols[Math.random()*_chaosCols.length|0]}`,
    `--rdx:${(105+Math.random()*55).toFixed(1)}px`,
    `animation:chaos-rain ${(.3+Math.random()*.32).toFixed(2)}s ${(Math.random()*.15).toFixed(2)}s linear forwards`
  ].join(';');
  chaosOverlay.appendChild(dr);
  dr.addEventListener('animationend', () => dr.remove());
}

function _triggerLightning() {
  document.body.classList.remove('lightning-flash');
  void document.body.offsetHeight; // reflow para reiniciar la animación
  document.body.classList.add('lightning-flash');
  document.body.addEventListener('animationend', () => document.body.classList.remove('lightning-flash'), { once: true });
}

function _scheduleLightning() {
  _lightningTimer = setTimeout(function() {
    if (activeEra === 'ocho-principes') { _triggerLightning(); _scheduleLightning(); }
  }, 8000 + Math.random() * 14000);
}

function startChaos() {
  if (_REDUCED) return;
  if (activeEra && activeEra !== 'ocho-principes') return;
  if (_chaosRainTimer) return;
  document.body.classList.add('chaos-on');
  for (let i = 0; i < 90; i++) setTimeout(_spawnChaosRain, i * 10);
  _chaosRainTimer = setInterval(_spawnChaosRain, 38);
  _scheduleLightning();
}
function stopChaos() {
  if (activeEra === 'ocho-principes') return;
  document.body.classList.remove('chaos-on');
  clearInterval(_chaosRainTimer); _chaosRainTimer = null;
  clearTimeout(_lightningTimer);  _lightningTimer = null;
}

const _ochoCard = document.querySelector('.pcard[data-pid="ocho-principes"]');
if (_ochoCard) {
  _ochoCard.addEventListener('mouseenter', startChaos);
  _ochoCard.addEventListener('mouseleave', stopChaos);
}

// ── TRES REINOS — 战尘 Polvo de guerra ──

const wardustOverlay = document.createElement('div');
wardustOverlay.id = 'wardust-overlay';
document.body.appendChild(wardustOverlay);

let _wdTimer = null;
let _wdBurstX = 15; // posición del "batallón" actual en %
const _wdPuffCols = ['rgba(175,145,92,.28)','rgba(160,130,78,.22)','rgba(192,162,105,.26)','rgba(145,118,72,.20)'];
const _wdGrainCols = ['rgba(182,150,95,.72)','rgba(162,132,80,.62)','rgba(198,165,102,.68)'];
const _wdPuffAnis = ['wd-puff-a','wd-puff-b','wd-puff-c'];

function _spawnWdPuff(x, sz) {
  const p = document.createElement('div');
  p.className = 'wd-puff';
  const s = sz || (55 + Math.random() * 80);
  const blur = (8 + Math.random() * 12).toFixed(1);
  p.style.cssText = [
    `width:${s.toFixed(0)}px`, `height:${(s * .82).toFixed(0)}px`,
    `left:${x.toFixed(1)}%`, `bottom:${(-s * .28).toFixed(0)}px`,
    `background:${_wdPuffCols[Math.random() * _wdPuffCols.length | 0]}`,
    `--blur:${blur}px`,
    `--px:${((Math.random() - .38) * 75).toFixed(1)}px`,
    `--px2:${((Math.random() - .38) * 105).toFixed(1)}px`,
    `animation:${_wdPuffAnis[Math.random() * 3 | 0]} ${(4.5 + Math.random() * 5).toFixed(1)}s ${(Math.random() * .5).toFixed(2)}s ease-out forwards`
  ].join(';');
  wardustOverlay.appendChild(p);
  p.addEventListener('animationend', () => p.remove());
}

function _spawnWdGrain(x) {
  const g = document.createElement('div');
  g.className = 'wd-grain';
  const sz = (2.5 + Math.random() * 4.5).toFixed(1);
  g.style.cssText = [
    `width:${sz}px`, `height:${sz}px`,
    `left:${(x + (Math.random() - .5) * 9).toFixed(1)}%`, `bottom:${(Math.random() * 6).toFixed(1)}px`,
    `background:${_wdGrainCols[Math.random() * _wdGrainCols.length | 0]}`,
    `--bx:${((Math.random() - .5) * 65).toFixed(1)}px`,
    `--bx2:${((Math.random() - .5) * 88).toFixed(1)}px`,
    `animation:wd-grain ${(2.8 + Math.random() * 3.2).toFixed(1)}s ${(Math.random() * .25).toFixed(2)}s ease-out forwards`
  ].join(';');
  wardustOverlay.appendChild(g);
  g.addEventListener('animationend', () => g.remove());
}

function _wdBurst() {
  // Ráfaga de polvo: simula varios caballos pasando por _wdBurstX
  const x = _wdBurstX;
  for (let i = 0; i < 5; i++) {
    setTimeout(() => _spawnWdPuff(x + (Math.random() - .5) * 20, 50 + Math.random() * 60), i * 110);
    setTimeout(() => _spawnWdGrain(x + (Math.random() - .5) * 12), i * 75);
  }
  _wdBurstX = (_wdBurstX + 14 + Math.random() * 16) % 98;
}

function startWarDust() {
  if (_REDUCED) return;
  if (activeEra && activeEra !== 'tres-reinos') return;
  if (_wdTimer) return;
  document.body.classList.add('wardust-on');
  // Cobertura inicial por toda la pantalla
  for (let i = 0; i < 10; i++) {
    setTimeout(() => _spawnWdPuff(8 + Math.random() * 84, 65 + Math.random() * 75), i * 180);
    if (i < 6) setTimeout(() => _spawnWdGrain(8 + Math.random() * 84), i * 130);
  }
  _wdTimer = setInterval(_wdBurst, 1300);
}
function stopWarDust() {
  if (activeEra === 'tres-reinos') return;
  document.body.classList.remove('wardust-on');
  clearInterval(_wdTimer); _wdTimer = null;
}

const _tresCard = document.querySelector('.pcard[data-pid="tres-reinos"]');
if (_tresCard) {
  _tresCard.addEventListener('mouseenter', startWarDust);
  _tresCard.addEventListener('mouseleave', stopWarDust);
}

// ── Pausa con la pestaña oculta ──
// Los spawners (setInterval/timeout) seguían creando nodos DOM en segundo plano.
// Al ocultar la pestaña se detienen todos; al volver se reanuda el de la era activa.
document.addEventListener('visibilitychange', function () {
  if (document.hidden) {
    clearInterval(_blossomTimer);    _blossomTimer = null;
    clearInterval(_dustTimer);       _dustTimer = null;
    clearInterval(_peaceTimer);      _peaceTimer = null;
    clearInterval(_leavesTimer);     _leavesTimer = null;
    clearInterval(_cinderTimer);     _cinderTimer = null;
    clearInterval(_duskTimer);       _duskTimer = null;
    clearInterval(_blizzardTimer);   _blizzardTimer = null;
    clearInterval(_chaosRainTimer);  _chaosRainTimer = null;
    clearTimeout(_lightningTimer);   _lightningTimer = null;
    clearInterval(_wdTimer);         _wdTimer = null;
    clearInterval(_ashTimer);        _ashTimer = null;
    if (_raf) { cancelAnimationFrame(_raf); _raf = null; }
    _embers = [];
  } else {
    switch (typeof activeEra !== 'undefined' ? activeEra : null) {
      case 'turbantes':       startBlossom();  break;
      case 'chibi':           startFire();     break;
      case 'sima':            startBlizzard(); break;
      case 'han-tardio':      startDust();     break;
      case 'jin':             startPeace();    break;
      case 'guerras-senores': startLeaves();   break;
      case 'dong-zhuo':       startCinder();   break;
      case 'guerras-ocaso':   startDuskRain(); break;
      case 'ocho-principes':  startChaos();    break;
      case 'tres-reinos':     startWarDust();  break;
    }
  }
});

