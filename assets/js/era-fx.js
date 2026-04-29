// ── CHERRY BLOSSOM AMBIENT (Turbantes Amarillos) ──

const blossomOverlay = document.createElement('div');
blossomOverlay.id = 'blossom-overlay';
document.body.appendChild(blossomOverlay);

(function buildBranches(){
  function fl(x, y, rot, sc, al) {
    sc = sc||1; al = al||.88; rot = rot||0;
    const cs = ['#ffb8c5','#ffc0ca','#ffaab8','#ffd0da','#ffb4c2'];
    const pts = cs.map((c,i) =>
      `<ellipse cx="0" cy="${-8*sc}" rx="${4.5*sc}" ry="${6.5*sc}" fill="${c}" opacity="${al}" transform="rotate(${i*72})"/>`
    ).join('');
    return `<g transform="translate(${x},${y}) rotate(${rot})">${pts}<circle r="${2.8*sc}" fill="rgba(255,215,0,.6)"/></g>`;
  }
  function makeBranch(flip) {
    const W = 420, H = 380;
    const tronco = `<g fill="none" stroke="#6b3a2a" stroke-linecap="round" stroke-linejoin="round">
      <path d="M-5,-5 C18,38 46,64 62,108 C74,140 66,178 60,220" stroke-width="5.5"/>
      <path d="M30,46 C56,28 96,12 138,6 C168,1 198,6 225,2" stroke-width="3.2"/>
      <path d="M176,5 C202,-6 230,-10 260,-16" stroke-width="2"/>
      <path d="M50,78 C82,58 124,46 164,40 C198,35 232,38 268,32" stroke-width="3"/>
      <path d="M232,37 C258,24 284,16 314,10" stroke-width="1.8"/>
      <path d="M60,136 C90,118 128,110 168,104 C202,99 236,101 272,94" stroke-width="2.5"/>
      <path d="M60,190 C84,176 116,172 152,168" stroke-width="1.8"/>
    </g>`;
    const flores = [
      fl(225,2,-5,1,.88),  fl(260,-16,8,.78,.82),
      fl(268,32,12,1,.86), fl(314,10,-8,.82,.8),
      fl(272,94,5,1,.86),  fl(152,168,14,.85,.8),
      fl(138,6,5,.72,.78), fl(42,88,-10,.68,.72),
      fl(185,5,15,.6,.7),  fl(230,38,8,.65,.72),
    ].join('');
    const pos = flip ? `style="position:absolute;top:0;right:0"` : `style="position:absolute;top:0;left:0"`;
    const tr = flip ? `transform="scale(-1,1) translate(-${W},0)"` : '';
    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" ${pos}><g ${tr}>${tronco}${flores}</g></svg>`;
  }
  blossomOverlay.innerHTML = makeBranch(false) + makeBranch(true);
})();

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

// ── CHIBI FIRE AMBIENT — Canvas particle system ──

const fireOverlay = document.createElement('div');
fireOverlay.id = 'fire-overlay';
document.body.appendChild(fireOverlay);

const _cnv = document.createElement('canvas');
_cnv.id = 'chibi-canvas';
document.body.appendChild(_cnv);
const _ctx = _cnv.getContext('2d');
let _cW, _cH;
(function _szCnv(){ _cW = _cnv.width = innerWidth; _cH = _cnv.height = innerHeight; })();
window.addEventListener('resize', function(){ _cW = _cnv.width = innerWidth; _cH = _cnv.height = innerHeight; });

// Ship definitions: xr=screen-left (0–1), w=display-px, rot=deg, nw/nh=SVG viewbox, d=hull path
// masts: array of {xf=x-fraction, topH=mast-top as fraction of nh above ship, sailBot=sail-bottom fraction, sailLW/RW=sail-width fractions, battens=batten count}
const _SHIPS = [
  // ── 楼船 (lóuchuán) — Large tower warship
  { xr:.03, w:290, rot:-1.5, nw:340, nh:148,
    masts:[
      {xf:.27, topH:.54, sailBot:.30, sailLW:.095, sailRW:.085, battens:7},
      {xf:.67, topH:.43, sailBot:.22, sailLW:.078, sailRW:.070, battens:6}
    ],
    d:'M 5,146 C 4,124 9,100 20,84 L 28,72 Q 36,62 42,56 Q 46,51 48,49 Q 52,47 66,47 L 72,39 L 88,33 L 88,47 L 124,45 L 124,35 L 130,25 L 140,17 Q 154,10 172,7 Q 190,10 204,17 L 214,25 L 220,35 L 220,47 L 264,43 L 276,36 L 288,27 Q 306,17 320,9 Q 328,15 330,32 L 332,56 L 333,92 L 333,146 L 5,146 Z'
  },
  // ── 蒙冲 (méngchōng) — Fast attack ram ship
  { xr:.31, w:190, rot:1.2, nw:220, nh:96,
    masts:[
      {xf:.44, topH:.58, sailBot:.24, sailLW:.100, sailRW:.090, battens:5}
    ],
    d:'M 5,94 C 4,78 7,62 16,50 Q 24,40 30,33 Q 34,27 36,24 Q 40,22 52,22 L 60,15 L 76,11 L 76,23 L 148,21 L 156,15 L 172,11 L 178,19 L 188,20 L 196,13 Q 204,6 210,3 Q 215,7 216,20 L 216,40 L 215,94 L 5,94 Z'
  },
  // ── 斗舰 (dǒujiàn) — Medium battle junk with tower
  { xr:.57, w:255, rot:-.8, nw:292, nh:132,
    masts:[
      {xf:.26, topH:.52, sailBot:.28, sailLW:.088, sailRW:.080, battens:6},
      {xf:.64, topH:.41, sailBot:.20, sailLW:.072, sailRW:.068, battens:5}
    ],
    d:'M 5,130 C 4,110 8,89 18,73 Q 26,60 34,52 Q 38,46 40,42 Q 44,39 58,39 L 64,30 L 80,24 L 80,39 L 108,37 L 108,26 L 116,17 Q 128,9 144,5 Q 160,2 174,5 Q 186,9 194,17 L 200,26 L 200,39 L 236,34 L 252,26 Q 264,17 276,9 Q 281,14 282,28 L 280,52 L 279,90 L 279,130 L 5,130 Z'
  },
  // ── 走舸 (zǒugě) — Light scout galley
  { xr:.83, w:135, rot:2.5, nw:172, nh:90,
    masts:[
      {xf:.42, topH:.60, sailBot:.26, sailLW:.095, sailRW:.085, battens:4}
    ],
    d:'M 5,88 C 4,74 7,58 16,46 Q 22,38 28,32 Q 32,26 34,23 Q 38,21 50,21 L 58,14 L 72,10 L 76,20 L 134,18 L 144,13 Q 156,7 164,4 Q 168,8 169,20 L 168,38 L 168,88 L 5,88 Z'
  }
];
const _sPaths = _SHIPS.map(function(s){ return new Path2D(s.d); });

// ── Particle constructors ──

function FireP(x, y) {
  this.x = x + (Math.random()-.5)*40; this.y = y;
  this.vx = (Math.random()-.5)*1.5;
  this.vy = -(1.8 + Math.random()*3.2);
  this.life = 1; this.decay = .005 + Math.random()*.008;
  this.r = 15 + Math.random()*26; this.w = Math.random()*6.28;
  this.type = 'fire';
}
FireP.prototype.tick = function(){
  this.w += .065; this.x += this.vx + Math.sin(this.w)*.95;
  this.y += this.vy; this.vy *= .982; this.life -= this.decay;
};
FireP.prototype.draw = function(){
  const t = 1 - this.life, rad = this.r*(.38 + this.life*.62);
  let r = 255, g = 0;
  if      (t < .28) g = (210 - t/.28*165)|0;
  else if (t < .56) g = (45  - (t-.28)/.28*45)|0;
  else              r = (255 - (t-.56)/.44*175)|0;
  const gd = _ctx.createRadialGradient(this.x,this.y,0,this.x,this.y,rad);
  gd.addColorStop(0,   `rgba(${r},${g},0,${(this.life*.92).toFixed(2)})`);
  gd.addColorStop(.42, `rgba(${(r*.72)|0},${(g*.18)|0},0,${(this.life*.44).toFixed(2)})`);
  gd.addColorStop(1,   'rgba(0,0,0,0)');
  _ctx.beginPath(); _ctx.arc(this.x,this.y,rad,0,6.28);
  _ctx.fillStyle = gd; _ctx.fill();
};
FireP.prototype.dead = function(){ return this.life <= 0; };

function SmokeP(x, y) {
  this.x = x + (Math.random()-.5)*75; this.y = y - 52 - Math.random()*48;
  this.vx = (Math.random()-.5)*.62; this.vy = -(0.3 + Math.random()*.72);
  this.life = .65 + Math.random()*.35; this.decay = .002 + Math.random()*.0015;
  this.r = 30 + Math.random()*45; this.w = Math.random()*6.28;
  this.type = 'smoke';
}
SmokeP.prototype.tick = function(){
  this.w += .013; this.x += this.vx + Math.sin(this.w)*.3;
  this.y += this.vy; this.r += .45; this.life -= this.decay;
};
SmokeP.prototype.draw = function(){
  const gd = _ctx.createRadialGradient(this.x,this.y,0,this.x,this.y,this.r);
  gd.addColorStop(0,  `rgba(11,5,2,${(this.life*.3).toFixed(2)})`);
  gd.addColorStop(.5, `rgba(7,3,1,${(this.life*.13).toFixed(2)})`);
  gd.addColorStop(1,  'rgba(0,0,0,0)');
  _ctx.beginPath(); _ctx.arc(this.x,this.y,this.r,0,6.28);
  _ctx.fillStyle = gd; _ctx.fill();
};
SmokeP.prototype.dead = function(){ return this.life <= 0; };

function EmberP(x, y) {
  this.x = x + (Math.random()-.5)*55; this.y = y - 18;
  this.vx = (Math.random()-.5)*5; this.vy = -(4 + Math.random()*6);
  this.life = 1; this.decay = .013 + Math.random()*.012;
  this.r = 1.4 + Math.random()*3; this.trail = [];
  this.type = 'ember';
}
EmberP.prototype.tick = function(){
  this.trail.push({x:this.x, y:this.y});
  if (this.trail.length > 8) this.trail.shift();
  this.vy += .09; this.vx *= .982;
  this.x += this.vx; this.y += this.vy; this.life -= this.decay;
};
EmberP.prototype.draw = function(){
  this.trail.forEach(function(pt, i, arr){
    _ctx.beginPath(); _ctx.arc(pt.x,pt.y,this.r*.4,0,6.28);
    _ctx.fillStyle = 'rgba(255,88,10,'+(i/arr.length*this.life*.48).toFixed(2)+')';
    _ctx.fill();
  }, this);
  const gd = _ctx.createRadialGradient(this.x,this.y,0,this.x,this.y,this.r*3);
  gd.addColorStop(0,   `rgba(255,240,90,${this.life.toFixed(2)})`);
  gd.addColorStop(.36, `rgba(255,108,10,${(this.life*.72).toFixed(2)})`);
  gd.addColorStop(1,   'rgba(150,12,0,0)');
  _ctx.beginPath(); _ctx.arc(this.x,this.y,this.r*3,0,6.28);
  _ctx.fillStyle = gd; _ctx.fill();
};
EmberP.prototype.dead = function(){ return this.life <= 0; };

function AshP() {
  this.x = Math.random()*_cW; this.y = -8;
  this.vx = (Math.random()-.5)*.5; this.vy = .36 + Math.random()*.65;
  this.life = .5 + Math.random()*.5; this.decay = .0007 + Math.random()*.0005;
  this.r = .7 + Math.random()*2.3; this.w = Math.random()*6.28;
  this.type = 'ash';
}
AshP.prototype.tick = function(){
  this.w += .016; this.x += this.vx + Math.sin(this.w)*.22;
  this.y += this.vy; this.life -= this.decay;
};
AshP.prototype.draw = function(){
  _ctx.beginPath(); _ctx.arc(this.x,this.y,this.r,0,6.28);
  _ctx.fillStyle = 'rgba(170,158,144,'+(this.life*.54).toFixed(2)+')';
  _ctx.fill();
};
AshP.prototype.dead = function(){ return this.life <= 0 || this.y > _cH+10; };

// Fire spawn points: 3 columns per ship at superstructure level
function _pts(){
  return _SHIPS.reduce(function(acc, s){
    var sc = s.w/s.nw, sx = s.xr*_cW, fy = _cH - s.nh*sc*.44;
    acc.push({x:sx+s.w*.24,y:fy},{x:sx+s.w*.5,y:fy-10},{x:sx+s.w*.76,y:fy});
    return acc;
  }, []);
}

// Water glow reflection under each ship
function _drawWater(){
  _SHIPS.forEach(function(s){
    var cx = s.xr*_cW + s.w*.5;
    var gd = _ctx.createRadialGradient(cx,_cH,0,cx,_cH,s.w*.8);
    gd.addColorStop(0,'rgba(85,12,0,.24)');
    gd.addColorStop(.4,'rgba(50,6,0,.11)');
    gd.addColorStop(1,'rgba(0,0,0,0)');
    _ctx.fillStyle = gd;
    _ctx.beginPath();
    _ctx.ellipse(cx,_cH,s.w*.62,s.w*.15,0,0,6.28);
    _ctx.fill();
  });
}

// Ship silhouettes + masts + battened sails + pennants drawn on canvas
function _drawShips(){
  _SHIPS.forEach(function(s, i){
    var sc = s.w/s.nw;
    var ty = _cH - s.nh*sc*.55;
    _ctx.save();
    _ctx.translate(s.xr*_cW, ty);
    _ctx.scale(sc, sc);
    _ctx.rotate(s.rot*.01745);

    // Hull silhouette
    _ctx.fillStyle = '#060100';
    _ctx.fill(_sPaths[i]);

    s.masts.forEach(function(m){
      var mx    = m.xf * s.nw;
      var mBase = s.nh * 0.28;
      var mTop  = -s.nh * m.topH;
      var sTopY = mTop + s.nh * 0.08;
      var sBotY = s.nh * m.sailBot;

      // Mast pole
      _ctx.strokeStyle = 'rgba(4,2,0,.96)';
      _ctx.lineWidth = 2.2/sc;
      _ctx.beginPath();
      _ctx.moveTo(mx, mBase);
      _ctx.lineTo(mx, mTop);
      _ctx.stroke();

      // Sail vertices — trapezoid narrower at top (Chinese lug sail shape)
      var slT = mx - s.nw * m.sailLW * 0.62;
      var srT = mx + s.nw * m.sailRW * 0.62;
      var slB = mx - s.nw * m.sailLW;
      var srB = mx + s.nw * m.sailRW;

      // Sail body — semi-transparent so fire glows through fabric
      _ctx.fillStyle = 'rgba(8,3,1,.68)';
      _ctx.beginPath();
      _ctx.moveTo(slT, sTopY);
      _ctx.lineTo(srT, sTopY);
      _ctx.lineTo(srB, sBotY);
      _ctx.lineTo(slB, sBotY);
      _ctx.closePath();
      _ctx.fill();

      // Bamboo batten lines (interpolate width top→bottom)
      _ctx.strokeStyle = 'rgba(3,1,0,.88)';
      _ctx.lineWidth = 1.1/sc;
      for (var b = 0; b <= m.battens; b++){
        var t  = b / m.battens;
        var by = sTopY + (sBotY - sTopY) * t;
        _ctx.beginPath();
        _ctx.moveTo(slT + (slB - slT) * t, by);
        _ctx.lineTo(srT + (srB - srT) * t, by);
        _ctx.stroke();
      }

      // Red pennant flag at mast top
      _ctx.fillStyle = 'rgba(165,20,8,.82)';
      _ctx.beginPath();
      _ctx.moveTo(mx,                        mTop);
      _ctx.lineTo(mx + s.nw * 0.055,         mTop + s.nh * 0.055);
      _ctx.lineTo(mx,                        mTop + s.nh * 0.068);
      _ctx.closePath();
      _ctx.fill();
    });

    _ctx.restore();
  });
}

// ── Main render loop ──
var _parts = [], _raf = null, _st = 0, _lt = 0, _arrowTimer = null, _stopTO = null;

function _loop(t){
  _raf = requestAnimationFrame(_loop);
  var dt = Math.min(t - _lt, 50); _lt = t; _st += dt;
  _ctx.clearRect(0,0,_cW,_cH);

  _drawWater();

  if (_st > 26){
    _st = 0;
    var pts = _pts();
    pts.forEach(function(p){
      if (Math.random() > .38) _parts.push(new FireP(p.x, p.y));
      if (Math.random() > .87) _parts.push(new EmberP(p.x, p.y));
    });
    if (Math.random() > .6){ var rp=pts[Math.random()*pts.length|0]; _parts.push(new SmokeP(rp.x,rp.y)); }
    if (Math.random() > .7) _parts.push(new AshP());
  }

  _parts = _parts.filter(function(p){ p.tick(); return !p.dead(); });

  // Additive blending: overlapping fire particles sum their light for realistic glow
  _ctx.globalCompositeOperation = 'lighter';
  _parts.forEach(function(p){ if (p.type==='fire'||p.type==='ember') p.draw(); });

  _ctx.globalCompositeOperation = 'source-over';
  _drawShips();

  _parts.forEach(function(p){ if (p.type==='smoke'||p.type==='ash') p.draw(); });
}

// ── Fire arrows (DOM/CSS, occasional) ──
function _spawnArrow(){
  var el = document.createElement('div');
  el.className = 'farrow';
  var top = (10+Math.random()*52).toFixed(1), len = 50+Math.random()*32, spd = (1.4+Math.random()*1.1).toFixed(1);
  el.style.cssText = 'top:'+top+'%;right:-'+(len+22)+'px;animation:arrow-fly '+spd+'s ease-in forwards';
  el.innerHTML =
    '<div style="width:'+len+'px;height:2px;background:linear-gradient(to left,rgba(65,40,14,.9),rgba(100,58,20,.6));border-radius:1px;flex-shrink:0"></div>'+
    '<div style="width:6px;height:6px;border-radius:50%;flex-shrink:0;background:rgba(255,125,12,.95);box-shadow:0 0 8px rgba(255,95,0,.9),0 0 18px rgba(230,60,0,.5)"></div>';
  document.body.appendChild(el);
  el.addEventListener('animationend', function(){ el.remove(); });
}
function _schedArrow(){ _arrowTimer = setTimeout(function(){ _spawnArrow(); _schedArrow(); }, 13000+Math.random()*19000); }

// ── Public fire controls (called from era selector + hover) ──
function startFire(){
  if (activeEra && activeEra !== 'chibi') return;
  if (_stopTO){ clearTimeout(_stopTO); _stopTO = null; }
  if (_raf){
    document.body.classList.add('fire-on');
    _cnv.style.opacity = '1';
    return;
  }
  document.body.classList.add('fire-on');
  _cnv.style.opacity = '1';
  _lt = performance.now(); _loop(_lt);
  var pts = _pts();
  for (var i=0; i<75; i++){
    var p = pts[Math.random()*pts.length|0];
    _parts.push(new FireP(p.x, p.y + Math.random()*55));
    if (Math.random()>.62) _parts.push(new EmberP(p.x, p.y));
    if (Math.random()>.8)  _parts.push(new SmokeP(p.x, p.y));
  }
  _schedArrow();
}

function stopFire(){
  if (activeEra === 'chibi') return;
  document.body.classList.remove('fire-on');
  _cnv.style.opacity = '0';
  _stopTO = setTimeout(function(){
    _stopTO = null;
    cancelAnimationFrame(_raf); _raf = null;
    _parts = []; _ctx.clearRect(0,0,_cW,_cH);
  }, 1500);
  clearTimeout(_arrowTimer); _arrowTimer = null;
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

