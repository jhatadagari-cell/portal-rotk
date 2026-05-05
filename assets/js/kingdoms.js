// ══════════════════════════════════════════════════════════════
//  KINGDOMS.JS — Kingdom modal system for Portal ROTK
//  Handles: Wei interactive ficha + Próximamente for Shu/Wu
// ══════════════════════════════════════════════════════════════

// ── Geographic helpers (same projection as mapa.html) ──
function kx(lon) { return +((lon - 73) * 12.26 + 20).toFixed(1) }
function ky(lat) { return +((53 - lat) * 20.29 + 20).toFixed(1) }
function kxy(lon, lat) { return kx(lon) + ',' + ky(lat) }

// ── China outline path ──
const KM_OUTER = `M ${kxy(102,40)} L ${kxy(104,42)} L ${kxy(107,42)} L ${kxy(110,43)}
  L ${kxy(114,43)} L ${kxy(116,43)} L ${kxy(118,43)} L ${kxy(120,42)}
  L ${kxy(123,42)} L ${kxy(126,42)} L ${kxy(129,42)} L ${kxy(131,43)}
  L ${kxy(133,43)} L ${kxy(134,41)} L ${kxy(133,38)} L ${kxy(132,35)}
  L ${kxy(131,32)} L ${kxy(129,29)} L ${kxy(124,25)} L ${kxy(121,23)}
  L ${kxy(117,22)} L ${kxy(114,21)} L ${kxy(111,20)} L ${kxy(110,18)}
  L ${kxy(109,19)} L ${kxy(108,22)} L ${kxy(106,22)} L ${kxy(104,22)}
  L ${kxy(102,22)} L ${kxy(100,22)} L ${kxy(99,23)}
  L ${kxy(98,24)} L ${kxy(97,25)} L ${kxy(98,28)} L ${kxy(97,29)}
  L ${kxy(97,31)} L ${kxy(98,33)} L ${kxy(100,34)}
  L ${kxy(102,35)} L ${kxy(103,36)} L ${kxy(102,38)} L ${kxy(100,39)}
  L ${kxy(98,40)} L ${kxy(97,38)} L ${kxy(95,38)} L ${kxy(93,39)}
  L ${kxy(91,40)} L ${kxy(90,38)} L ${kxy(88,38)} L ${kxy(86,38)}
  L ${kxy(85,40)} L ${kxy(83,43)} L ${kxy(81,43)} L ${kxy(79,40)}
  L ${kxy(79,37)} L ${kxy(80,35)} L ${kxy(82,34)} L ${kxy(84,34)}
  L ${kxy(76,37)} L ${kxy(74,36)} L ${kxy(73,37)} L ${kxy(73,40)}
  L ${kxy(75,42)} L ${kxy(78,44)} L ${kxy(80,46)} L ${kxy(82,47)}
  L ${kxy(85,47)} L ${kxy(87,48)} L ${kxy(90,50)} L ${kxy(93,50)}
  L ${kxy(96,50)} L ${kxy(99,50)} L ${kxy(102,50)} L ${kxy(105,50)}
  L ${kxy(108,50)} L ${kxy(111,50)} L ${kxy(114,49)} L ${kxy(116,48)}
  L ${kxy(119,48)} L ${kxy(122,47)} L ${kxy(125,46)} L ${kxy(128,45)}
  L ${kxy(130,44)} L ${kxy(131,43)} Z`.trim();

// ── 14 Zhou provinces ──
const KM_ZHOU = [
  {id:'liangzhou',zh:'凉州',lon:97,lat:37,
   path:`M ${kxy(96,40)} L ${kxy(98,40)} L ${kxy(100,40)} L ${kxy(102,40)}
     L ${kxy(104,38)} L ${kxy(104,36)} L ${kxy(103,35)} L ${kxy(102,34)}
     L ${kxy(100,34)} L ${kxy(98,34)} L ${kxy(97,34)} L ${kxy(96,35)}
     L ${kxy(95,36)} L ${kxy(95,38)} L ${kxy(96,39)} Z`},
  {id:'bingzhou',zh:'并州',lon:112,lat:38,
   path:`M ${kxy(110,40)} L ${kxy(112,40)} L ${kxy(114,40)} L ${kxy(114,38)}
     L ${kxy(114,36)} L ${kxy(113,35)} L ${kxy(111,35)} L ${kxy(110,35)}
     L ${kxy(109,36)} L ${kxy(109,37)} L ${kxy(109,38)} L ${kxy(110,39)} Z`},
  {id:'jizhou',zh:'冀州',lon:115.5,lat:38,
   path:`M ${kxy(114,40)} L ${kxy(116,40)} L ${kxy(118,40)} L ${kxy(120,39)}
     L ${kxy(120,37)} L ${kxy(118,36)} L ${kxy(116,36)} L ${kxy(114,36)}
     L ${kxy(114,38)} Z`},
  {id:'youzhou',zh:'幽州',lon:117,lat:41,
   path:`M ${kxy(114,43)} L ${kxy(116,43)} L ${kxy(118,43)} L ${kxy(120,42)}
     L ${kxy(123,42)} L ${kxy(126,42)} L ${kxy(127,41)} L ${kxy(126,40)}
     L ${kxy(123,40)} L ${kxy(120,40)} L ${kxy(118,40)} L ${kxy(116,40)}
     L ${kxy(114,40)} Z`},
  {id:'qingzhou',zh:'青州',lon:119.5,lat:36.5,
   path:`M ${kxy(118,38)} L ${kxy(120,38)} L ${kxy(122,38)} L ${kxy(122,37)}
     L ${kxy(121,35)} L ${kxy(120,35)} L ${kxy(118,35)} L ${kxy(117,36)}
     L ${kxy(117,37)} Z`},
  {id:'yanzhou',zh:'兗州',lon:115.5,lat:35.5,
   path:`M ${kxy(114,37)} L ${kxy(116,37)} L ${kxy(118,37)} L ${kxy(118,35)}
     L ${kxy(116,35)} L ${kxy(114,35)} L ${kxy(113,36)} Z`},
  {id:'sizhou',zh:'司州',lon:111.5,lat:34.5,
   path:`M ${kxy(109,36)} L ${kxy(111,36)} L ${kxy(113,36)} L ${kxy(114,35)}
     L ${kxy(113,34)} L ${kxy(111,34)} L ${kxy(110,34)} L ${kxy(109,34)}
     L ${kxy(108,35)} Z`},
  {id:'xuzhou',zh:'徐州',lon:117.5,lat:34,
   path:`M ${kxy(116,36)} L ${kxy(118,36)} L ${kxy(120,36)} L ${kxy(120,34)}
     L ${kxy(119,33)} L ${kxy(117,33)} L ${kxy(116,34)} Z`},
  {id:'yuzhou',zh:'豫州',lon:113.5,lat:33.5,
   path:`M ${kxy(110,35)} L ${kxy(113,35)} L ${kxy(114,35)} L ${kxy(116,35)}
     L ${kxy(116,33)} L ${kxy(114,32)} L ${kxy(112,32)} L ${kxy(110,33)} Z`},
  {id:'yangzhou',zh:'扬州',lon:118.5,lat:30.5,
   path:`M ${kxy(116,33)} L ${kxy(118,33)} L ${kxy(120,33)} L ${kxy(122,32)}
     L ${kxy(122,30)} L ${kxy(121,29)} L ${kxy(120,29)} L ${kxy(118,29)}
     L ${kxy(116,29)} L ${kxy(115,30)} L ${kxy(115,32)} Z`},
  {id:'jingzhou',zh:'荆州',lon:112,lat:30,
   path:`M ${kxy(108,33)} L ${kxy(110,33)} L ${kxy(112,33)} L ${kxy(114,33)}
     L ${kxy(116,32)} L ${kxy(116,30)} L ${kxy(114,28)} L ${kxy(112,28)}
     L ${kxy(110,28)} L ${kxy(108,30)} Z`},
  {id:'yizhou',zh:'益州',lon:104,lat:29,
   path:`M ${kxy(98,33)} L ${kxy(100,33)} L ${kxy(102,33)} L ${kxy(104,33)}
     L ${kxy(106,33)} L ${kxy(108,33)} L ${kxy(108,30)} L ${kxy(106,28)}
     L ${kxy(104,26)} L ${kxy(102,24)} L ${kxy(100,23)} L ${kxy(99,23)}
     L ${kxy(98,24)} L ${kxy(97,25)} L ${kxy(97,29)} L ${kxy(98,31)} Z`},
  {id:'hanzhong',zh:'汉中',lon:107,lat:33,
   path:`M ${kxy(104,34)} L ${kxy(106,34)} L ${kxy(108,34)} L ${kxy(108,33)}
     L ${kxy(108,32)} L ${kxy(106,32)} L ${kxy(104,32)} L ${kxy(104,33)} Z`},
  {id:'jiaozhi',zh:'交州',lon:107,lat:22,
   path:`M ${kxy(104,26)} L ${kxy(106,26)} L ${kxy(108,26)} L ${kxy(110,24)}
     L ${kxy(112,22)} L ${kxy(110,20)} L ${kxy(108,20)} L ${kxy(106,20)}
     L ${kxy(104,20)} L ${kxy(102,20)} L ${kxy(100,21)} L ${kxy(100,22)}
     L ${kxy(101,23)} L ${kxy(102,24)} Z`},
];

// ── Faction color palette for map ──
const KM_FAC = {
  han:  {fill:'rgba(200,150,42,.30)',  stroke:'rgba(200,150,42,.6)',  dim:false},
  cao:  {fill:'rgba(30,90,191,.72)',   stroke:'#1e5abf',             dim:false},
  wei:  {fill:'rgba(30,90,191,.72)',   stroke:'#1e5abf',             dim:false},
  shu:  {fill:'rgba(30,138,46,.42)',   stroke:'rgba(30,138,46,.7)',   dim:true},
  liu:  {fill:'rgba(30,138,46,.42)',   stroke:'rgba(30,138,46,.7)',   dim:true},
  wu:   {fill:'rgba(191,32,32,.42)',   stroke:'rgba(191,32,32,.7)',   dim:true},
  sun:  {fill:'rgba(191,32,32,.42)',   stroke:'rgba(191,32,32,.7)',   dim:true},
  jin:  {fill:'rgba(136,32,176,.72)',  stroke:'#8820b0',             dim:false},
  sima: {fill:'rgba(136,32,176,.72)',  stroke:'#8820b0',             dim:false},
  neut: {fill:'rgba(100,80,50,.22)',   stroke:'rgba(80,60,30,.4)',    dim:true},
};

// ── Territory snapshots by year ──
const KM_TERRITORY = [
  { year:196, label:'196 d.C. — Cao Cao controla el norte bajo el estandarte Han',
    ctrl:{liangzhou:'neut',bingzhou:'cao',jizhou:'cao',youzhou:'cao',qingzhou:'cao',
          yanzhou:'cao',sizhou:'cao',xuzhou:'neut',yuzhou:'cao',
          yangzhou:'sun',jingzhou:'neut',yizhou:'neut',hanzhong:'neut',jiaozhi:'neut'}},
  { year:200, label:'200 d.C. — Batalla de Guandu: el norte cae en manos de Cao Cao',
    ctrl:{liangzhou:'neut',bingzhou:'cao',jizhou:'cao',youzhou:'cao',qingzhou:'cao',
          yanzhou:'cao',sizhou:'cao',xuzhou:'cao',yuzhou:'cao',
          yangzhou:'sun',jingzhou:'neut',yizhou:'neut',hanzhong:'neut',jiaozhi:'neut'}},
  { year:207, label:'207 d.C. — Campaña Wuhuan, norte unificado bajo Cao Cao',
    ctrl:{liangzhou:'cao',bingzhou:'cao',jizhou:'cao',youzhou:'cao',qingzhou:'cao',
          yanzhou:'cao',sizhou:'cao',xuzhou:'cao',yuzhou:'cao',
          yangzhou:'sun',jingzhou:'neut',yizhou:'neut',hanzhong:'neut',jiaozhi:'neut'}},
  { year:208, label:'208 d.C. — Chibi: la flota de Cao Cao arde en el Yangtzé',
    ctrl:{liangzhou:'cao',bingzhou:'cao',jizhou:'cao',youzhou:'cao',qingzhou:'cao',
          yanzhou:'cao',sizhou:'cao',xuzhou:'cao',yuzhou:'cao',
          yangzhou:'sun',jingzhou:'liu',yizhou:'neut',hanzhong:'neut',jiaozhi:'sun'}},
  { year:214, label:'214 d.C. — Liu Bei conquista Yizhou; el trípode toma forma',
    ctrl:{liangzhou:'cao',bingzhou:'cao',jizhou:'cao',youzhou:'cao',qingzhou:'cao',
          yanzhou:'cao',sizhou:'cao',xuzhou:'cao',yuzhou:'cao',
          yangzhou:'sun',jingzhou:'liu',yizhou:'liu',hanzhong:'neut',jiaozhi:'sun'}},
  { year:220, label:'220 d.C. — Cao Pi funda el Reino de Wei 魏',
    ctrl:{liangzhou:'wei',bingzhou:'wei',jizhou:'wei',youzhou:'wei',qingzhou:'wei',
          yanzhou:'wei',sizhou:'wei',xuzhou:'wei',yuzhou:'wei',
          yangzhou:'wu',jingzhou:'wu',yizhou:'shu',hanzhong:'shu',jiaozhi:'wu'}},
  { year:228, label:'228 d.C. — Primera Expedición del Norte de Zhuge Liang',
    ctrl:{liangzhou:'wei',bingzhou:'wei',jizhou:'wei',youzhou:'wei',qingzhou:'wei',
          yanzhou:'wei',sizhou:'wei',xuzhou:'wei',yuzhou:'wei',
          yangzhou:'wu',jingzhou:'wu',yizhou:'shu',hanzhong:'shu',jiaozhi:'wu'}},
  { year:234, label:'234 d.C. — Zhuge Liang muere en Wuzhang; Wei resiste',
    ctrl:{liangzhou:'wei',bingzhou:'wei',jizhou:'wei',youzhou:'wei',qingzhou:'wei',
          yanzhou:'wei',sizhou:'wei',xuzhou:'wei',yuzhou:'wei',
          yangzhou:'wu',jingzhou:'wu',yizhou:'shu',hanzhong:'shu',jiaozhi:'wu'}},
  { year:249, label:'249 d.C. — Golpe de Gaoping: los Sima toman el control de Wei',
    ctrl:{liangzhou:'wei',bingzhou:'wei',jizhou:'wei',youzhou:'wei',qingzhou:'wei',
          yanzhou:'wei',sizhou:'wei',xuzhou:'wei',yuzhou:'wei',
          yangzhou:'wu',jingzhou:'wu',yizhou:'shu',hanzhong:'shu',jiaozhi:'wu'}},
  { year:263, label:'263 d.C. — Wei conquista Shu Han; Deng Ai cruza Yinping',
    ctrl:{liangzhou:'wei',bingzhou:'wei',jizhou:'wei',youzhou:'wei',qingzhou:'wei',
          yanzhou:'wei',sizhou:'wei',xuzhou:'wei',yuzhou:'wei',
          yangzhou:'wu',jingzhou:'wu',yizhou:'wei',hanzhong:'wei',jiaozhi:'wu'}},
  { year:265, label:'265 d.C. — Sima Yan funda Jin 晉; Wei desaparece',
    ctrl:{liangzhou:'jin',bingzhou:'jin',jizhou:'jin',youzhou:'jin',qingzhou:'jin',
          yanzhou:'jin',sizhou:'jin',xuzhou:'jin',yuzhou:'jin',
          yangzhou:'wu',jingzhou:'wu',yizhou:'jin',hanzhong:'jin',jiaozhi:'wu'}},
];

// ── Wei events by year ──
const KM_EVENTS = [
  {year:196, title:'El nido del fénix',
   desc:'Cao Cao traslada al Emp. Xian a Xu. Gobierna China "en nombre del Han".'},
  {year:199, title:'Fin de Lü Bu',
   desc:'Cao Cao captura y ejecuta a Lü Bu en Xiaopi. El último señor independiente del este cae.'},
  {year:200, title:'Batalla de Guandu 官渡之战',
   desc:'Cao Cao destruye los graneros de Wuchao e inflige una derrota catastrófica a Yuan Shao.'},
  {year:207, title:'Campaña contra los Wuhuan',
   desc:'Victoria en Liucheng. El noreste queda asegurado. El norte de China es de Cao Cao.'},
  {year:208, title:'Chibi 赤壁 — La gran derrota',
   desc:'Zhou Yu incendia la flota. El sueño de unificación se pospone medio siglo.'},
  {year:215, title:'Hanzhong tomado… y abandonado',
   desc:'Cao Cao toma Hanzhong a Zhang Lu pero decide no avanzar sobre Yizhou — error histórico.'},
  {year:219, title:'Guan Yu asedia Xiangyang',
   desc:'Guan Yu inunda los ejércitos de Yu Jin. Pero Wu ataca por la espalda: Guan Yu es ejecutado.'},
  {year:220, title:'魏 — El Reino de Wei se funda',
   desc:'Cao Pi abole el Han. Se proclama Primer Emperador. La era de los Tres Reinos comienza.'},
  {year:223, title:'Liu Bei muere en Baidicheng',
   desc:'El fundador de Shu entrega la regencia a Zhuge Liang. El trípode se estabiliza.'},
  {year:228, title:'Primera Expedición del Norte',
   desc:'Zhuge Liang ataca por Qishan. Sima Yi lo frena. La guerra se convierte en desgaste.'},
  {year:231, title:'Zhang He muere en Muniuge',
   desc:'El último gran general de primera generación de Wei cae persiguiendo la retirada de Shu.'},
  {year:234, title:'Wuzhang — Muere Zhuge Liang',
   desc:'Zhuge Liang muere en su campamento. La amenaza de Shu sobre el norte concluye.'},
  {year:249, title:'Golpe de Gaoping 高平陵之变',
   desc:'Sima Yi elimina a Cao Shuang mientras visita la tumba imperial. Wei queda en manos Sima.'},
  {year:254, title:'Cao Mao, el último digno',
   desc:'Marcha con lanza a matar a Sima Zhao. Es asesinado en la calle. Último gesto de honor Wei.'},
  {year:263, title:'Caída de Shu Han 蜀漢亡',
   desc:'Deng Ai cruza las "imposibles" montañas de Yinping. Liu Shan se rinde. Shu desaparece.'},
  {year:265, title:'晉 — Nace la Dinastía Jin',
   desc:'Cao Huan abdica. 45 años de Wei concluyen. Sima Yan reinicia el ciclo.'},
];

// ── Wei rulers ──
const KM_RULERS = [
  {name:'Cao Cao 曹操',title:'Canciller / Rey de Wei',from:155,to:220},
  {name:'Cao Pi 曹丕',  title:'1.er Emperadord de Wei',from:220,to:226},
  {name:'Cao Rui 曹叡', title:'2.º Emperador',         from:226,to:239},
  {name:'Cao Fang 曹芳',title:'(Regencia Sima Yi)',    from:239,to:254},
  {name:'Cao Mao 曹髦', title:'Murió por Sima Zhao',   from:254,to:260},
  {name:'Cao Huan 曹奂',title:'Último Emp. de Wei',    from:260,to:265},
];

// ── Kingdom definitions ──
const KM_DATA = {
  wei: {
    zh:'魏', en:'Wei', color:'#1e5abf',
    yrs:'196 — 265 d.C.', cap:'Luoyang 洛阳 / Ye 邺',
    sliderMin:196, sliderMax:265, sliderDefault:220,
    desc:'El más poderoso de los Tres Reinos, heredero directo de la administración Han del norte. Fundado sobre la genialidad política de Cao Cao y la ambición imperial de su hijo Cao Pi, Wei dominó las provincias más ricas y pobladas de China hasta que la familia Sima los devoró desde dentro.',
    stats:[
      {label:'Capital',     value:'Luoyang / Ye'},
      {label:'Período',     value:'220–265 d.C.'},
      {label:'Fundador',    value:'Cao Pi 曹丕'},
      {label:'Territorio',  value:'Norte + centro'},
    ],
    generals:[
      {ico:'🦅',name:'Cao Cao 曹操',role:'Fundador de facto'},
      {ico:'🧠',name:'Sima Yi 司馬懿',role:'Estratega supremo'},
      {ico:'⚔',name:'Zhang Liao 張遼',role:'General de vanguardia'},
      {ico:'🗡',name:'Deng Ai 鄧艾',role:'Conquista de Shu'},
      {ico:'🔱',name:'Xu Chu 許褚',role:'Guardia personal'},
      {ico:'📜',name:'Guo Jia 郭嘉',role:'Consejero principal'},
    ],
  },
  shu: {
    zh:'蜀漢', en:'Shu Han', color:'#1e8a2e',
    yrs:'221 — 263 d.C.', cap:'Chengdu 成都',
    desc:'El reino del suroeste, el más pequeño de los tres.',
    soon:true,
  },
  wu: {
    zh:'吳', en:'Wu', color:'#bf2020',
    yrs:'222 — 280 d.C.', cap:'Jianye 建業',
    desc:'El reino del sureste, dominando el Yangtzé.',
    soon:true,
  },
};

// ── State ──
let kmYear = 220;
let kmFid  = null;

// ── Helpers ──
function kmGetTerritory(year) {
  let snap = KM_TERRITORY[0];
  for (const s of KM_TERRITORY) {
    if (s.year <= year) snap = s;
    else break;
  }
  return snap;
}

function kmGetEvent(year) {
  let ev = KM_EVENTS[0];
  for (const e of KM_EVENTS) {
    if (e.year <= year) ev = e;
    else break;
  }
  return ev;
}

function kmGetRuler(year) {
  for (const r of KM_RULERS) {
    if (year >= r.from && year <= r.to) return r;
  }
  return KM_RULERS[KM_RULERS.length - 1];
}

// ── Build static SVG (rivers, land, paths, labels) ──
function buildKmSVG() {
  const hhPts = [[96,36],[98,36],[100,36],[102,36],[103,37],[104,37],[104,38],[103,38],
    [105,38],[106,40],[107,40],[108,40],[109,40],[110,40],[111,40],[111,39],
    [111,38],[110,37],[110,36],[111,35],[112,35],[113,35],[114,35],[115,35],
    [116,35],[117,36],[118,36],[119,36],[120,37],[121,37]];
  const yyPts = [[98,30],[100,28],[101,28],[102,28],[103,28],[104,29],[105,29],
    [106,29],[107,29],[108,30],[109,30],[110,30],[111,29],[112,30],[113,30],
    [114,30],[115,30],[116,30],[117,30],[118,31],[119,31],[120,32],[121,31]];

  function rPts(arr) { return arr.map(([lo,la]) => `${kx(lo)},${ky(la)}`).join(' ') }

  const mtns = [
    [104.2,33.5],[106,33.5],[108,33.5],[110,33.5],
    [113,36],[113,37],[113,38],[113,39],
    [101,30],[101,31],[101,32],
  ];

  let s = `<svg viewBox="0 0 800 750" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet" style="width:100%;height:100%;display:block">
  <defs>
    <filter id="kmgl"><feGaussianBlur stdDeviation="2.2" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <filter id="kmsh"><feDropShadow dx="0" dy="2" stdDeviation="5" flood-color="#000" flood-opacity="0.6"/></filter>
    <linearGradient id="kmsea" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f2540"/>
      <stop offset="100%" stop-color="#061220"/>
    </linearGradient>
    <radialGradient id="kmland" cx="40%" cy="45%" r="65%">
      <stop offset="0%" stop-color="#d4b06a"/>
      <stop offset="50%" stop-color="#b88a42"/>
      <stop offset="100%" stop-color="#8a6422"/>
    </radialGradient>
    <pattern id="kmwave" x="0" y="0" width="24" height="10" patternUnits="userSpaceOnUse">
      <path d="M0,5 Q6,2 12,5 Q18,8 24,5" fill="none" stroke="rgba(80,150,220,.14)" stroke-width="0.8"/>
    </pattern>
    <linearGradient id="kmriv" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#4a88c0" stop-opacity=".85"/>
      <stop offset="100%" stop-color="#2a5890" stop-opacity=".65"/>
    </linearGradient>
  </defs>

  <rect width="800" height="750" fill="url(#kmsea)"/>
  <rect width="800" height="750" fill="url(#kmwave)"/>

  <text x="720" y="380" text-anchor="middle" font-family="IM Fell English" font-style="italic"
    font-size="15" fill="rgba(80,140,210,.18)" transform="rotate(-8,720,380)">東 海</text>
  <text x="650" y="690" text-anchor="middle" font-family="IM Fell English" font-style="italic"
    font-size="13" fill="rgba(80,140,210,.14)">南 海</text>

  <path d="${KM_OUTER}" fill="url(#kmland)" stroke="#7a5018" stroke-width="1.6" filter="url(#kmsh)"/>`;

  // Province fills (will be updated by updateKmTerritory)
  s += `\n  <g id="km-zhou-fills">`;
  KM_ZHOU.forEach(z => {
    s += `\n    <path id="kzp_${z.id}" d="${z.path}"
      fill="rgba(100,80,50,.22)" stroke="rgba(80,60,30,.35)" stroke-width="0.8" opacity="1"/>`;
  });
  s += `\n  </g>`;

  // Province borders (dashed overlay, always visible)
  s += `\n  <g opacity=".28" stroke="#6a4510" stroke-width="0.6" fill="none" stroke-dasharray="3,3">`;
  KM_ZHOU.forEach(z => { s += `<path d="${z.path}"/>`; });
  s += `\n  </g>`;

  // Mountains
  s += `\n  <g opacity=".45">`;
  mtns.forEach(([lo, la]) => {
    const mx = kx(lo), my = ky(la);
    s += `<path d="M${mx-7},${my+5} L${mx},${my-6} L${mx+7},${my+5}" fill="rgba(160,120,60,.2)" stroke="#8a6030" stroke-width="1"/>`;
  });
  s += `\n  </g>`;

  // Huang He
  s += `
  <polyline id="kmhh" points="${rPts(hhPts)}"
    fill="none" stroke="url(#kmriv)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" opacity=".75"/>
  <text font-family="IM Fell English" font-size="8.5" fill="rgba(70,130,200,.55)" font-style="italic">
    <textPath href="#kmhh" startOffset="18%">黄河 · Río Amarillo</textPath></text>

  <polyline id="kmyy" points="${rPts(yyPts)}"
    fill="none" stroke="url(#kmriv)" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" opacity=".72"/>
  <text font-family="IM Fell English" font-size="9" fill="rgba(70,130,200,.55)" font-style="italic">
    <textPath href="#kmyy" startOffset="12%">长江 · Yangtzé</textPath></text>`;

  // Dongting lake
  s += `
  <ellipse cx="${kx(113.2)}" cy="${ky(29.4)}" rx="13" ry="7"
    fill="#1e3c6a" opacity=".5" stroke="#3a78a8" stroke-width="0.7"/>`;

  // Province name labels
  s += `\n  <g id="km-zhou-labels">`;
  KM_ZHOU.forEach(z => {
    s += `<text x="${kx(z.lon)}" y="${ky(z.lat)}" text-anchor="middle"
      font-family="Noto Serif SC,serif" font-size="13" font-weight="700"
      fill="rgba(20,10,0,.7)" pointer-events="none">${z.zh}</text>`;
  });
  s += `\n  </g>`;

  // Capitals: Luoyang ★ and Ye ★
  const caps = [
    {zh:'洛阳★',lon:112.5,lat:34.7},
    {zh:'邺★',  lon:114.4,lat:36.3},
  ];
  s += `\n  <g>`;
  caps.forEach(c => {
    s += `<circle cx="${kx(c.lon)}" cy="${ky(c.lat)}" r="5" fill="#f0d050" opacity=".92" stroke="#8a5800" stroke-width="1.4" filter="url(#kmgl)"/>
    <text x="${kx(c.lon)+8}" y="${ky(c.lat)+4}" font-family="Noto Serif SC,serif" font-size="9" fill="#f0d070" font-weight="700" pointer-events="none">${c.zh}</text>`;
  });
  s += `\n  </g>`;

  // Year label overlay (updated via textContent)
  s += `
  <rect x="610" y="12" width="178" height="40" rx="3" fill="rgba(4,6,14,.82)" stroke="rgba(30,90,191,.35)" stroke-width="1"/>
  <text id="km-year-overlay" x="699" y="33" text-anchor="middle"
    font-family="Cinzel Decorative,serif" font-size="14" fill="rgba(30,90,191,.9)" font-weight="700">${kmYear} d.C.</text>
  <text x="699" y="45" text-anchor="middle" font-family="Noto Serif SC,serif"
    font-size="7" fill="rgba(30,90,191,.45)">魏 · REINO DE WEI</text>

  <!-- Legend -->
  <rect x="10" y="680" width="160" height="62" rx="2" fill="rgba(4,6,14,.75)" stroke="rgba(255,255,255,.06)" stroke-width="1"/>
  <circle cx="24" cy="698" r="5" fill="rgba(30,90,191,.8)"/>
  <text x="34" y="702" font-family="Noto Sans SC,sans-serif" font-size="9" fill="rgba(200,200,220,.7)">Wei 魏</text>
  <circle cx="24" cy="714" r="5" fill="rgba(191,32,32,.65)"/>
  <text x="34" y="718" font-family="Noto Sans SC,sans-serif" font-size="9" fill="rgba(200,200,220,.7)">Wu 吳</text>
  <circle cx="24" cy="730" r="5" fill="rgba(30,138,46,.65)"/>
  <text x="34" y="734" font-family="Noto Sans SC,sans-serif" font-size="9" fill="rgba(200,200,220,.7)">Shu Han 蜀漢</text>
  <circle cx="90" cy="698" r="5" fill="rgba(136,32,176,.75)"/>
  <text x="100" y="702" font-family="Noto Sans SC,sans-serif" font-size="9" fill="rgba(200,200,220,.7)">Jin 晉</text>
  <circle cx="90" cy="714" r="5" fill="rgba(100,80,50,.55)"/>
  <text x="100" y="718" font-family="Noto Sans SC,sans-serif" font-size="9" fill="rgba(200,200,220,.7)">Varios</text>`;

  s += `\n</svg>`;
  return s;
}

// ── Update only the territory fills (fast, no full SVG rebuild) ──
function updateKmTerritory(ctrl) {
  KM_ZHOU.forEach(z => {
    const el = document.getElementById('kzp_' + z.id);
    if (!el) return;
    const fk = ctrl[z.id] || 'neut';
    const f  = KM_FAC[fk] || KM_FAC.neut;
    el.setAttribute('fill', f.fill);
    el.setAttribute('stroke', f.stroke);
    el.setAttribute('stroke-width', f.dim ? '0.8' : '1.4');
    el.setAttribute('opacity', '1');
  });
}

// ── Update year overlay text in SVG ──
function updateKmYearOverlay(year) {
  const el = document.getElementById('km-year-overlay');
  if (el) el.textContent = year + ' d.C.';
}

// ── Update ruler list highlight ──
function updateKmRulers(year) {
  document.querySelectorAll('.km-ruler-row').forEach(row => {
    const from = parseInt(row.dataset.from);
    const to   = parseInt(row.dataset.to);
    row.classList.toggle('km-ruler-active', year >= from && year <= to);
  });
}

// ── Update event card ──
function updateKmEventCard(year) {
  const ev = kmGetEvent(year);
  const card = document.getElementById('km-event-card');
  if (!card) return;
  card.innerHTML = `<div class="km-event-title">${ev.title}</div>
    <div class="km-event-desc">${ev.desc}</div>`;
}

// ── Update slider fill track ──
function updateKmSliderTrack(slider) {
  const min = parseInt(slider.min);
  const max = parseInt(slider.max);
  const val = parseInt(slider.value);
  const pct = ((val - min) / (max - min) * 100).toFixed(1) + '%';
  document.getElementById('km-overlay').style.setProperty('--km-pct', pct);
  document.getElementById('km-year-num').textContent = val + ' d.C.';
}

// ── Full year update (called on slider input) ──
function updateKmYear(year) {
  kmYear = year;
  const snap = kmGetTerritory(year);
  updateKmTerritory(snap.ctrl);
  updateKmYearOverlay(year);
  updateKmRulers(year);
  updateKmEventCard(year);
  const slider = document.getElementById('km-year-slider');
  if (slider) updateKmSliderTrack(slider);
}

// ── Render Wei info left panel ──
function buildKmLeftWei() {
  const kd = KM_DATA.wei;

  const statsHtml = kd.stats.map(s =>
    `<div class="km-stat">
      <div class="km-stat-label">${s.label}</div>
      <div class="km-stat-value">${s.value}</div>
    </div>`
  ).join('');

  const rulersHtml = KM_RULERS.map(r =>
    `<div class="km-ruler-row" data-from="${r.from}" data-to="${r.to}">
      <span class="km-ruler-name">${r.name}</span>
      <span class="km-ruler-yrs">${r.from}–${r.to}</span>
    </div>`
  ).join('');

  const gensHtml = kd.generals.map(g =>
    `<div class="km-gen-row">
      <span class="km-gen-ico">${g.ico}</span>
      <span class="km-gen-name">${g.name}</span>
      <span class="km-gen-role">${g.role}</span>
    </div>`
  ).join('');

  return `
    <div class="km-sec">
      <div class="km-sec-title">Descripción</div>
      <p class="km-desc">${kd.desc}</p>
    </div>
    <div class="km-sec">
      <div class="km-sec-title">Datos</div>
      <div class="km-stat-grid">${statsHtml}</div>
    </div>
    <div class="km-sec">
      <div class="km-sec-title">Gobernantes</div>
      ${rulersHtml}
    </div>
    <div class="km-sec">
      <div class="km-sec-title">Figuras destacadas</div>
      ${gensHtml}
    </div>`;
}

// ── Render Próximamente body ──
function buildKmSoon(fid) {
  const kd = KM_DATA[fid];
  return `<div class="km-soon">
    <div class="km-soon-zh">${kd.zh}</div>
    <div class="km-soon-title">${kd.en} · ${kd.zh}</div>
    <p class="km-soon-sub">La Ficha de este reino —incluyendo su mapa territorial interactivo y línea temporal año a año— está siendo preparada con el mismo nivel de detalle que Wei.</p>
    <div class="km-soon-badge">Próximamente</div>
  </div>`;
}

// ── Open kingdom modal ──
function openKm(fid) {
  const kd = KM_DATA[fid];
  if (!kd) return;
  kmFid = fid;
  kmYear = kd.sliderDefault || 220;

  const overlay = document.getElementById('km-overlay');
  overlay.style.setProperty('--km-fc', kd.color);

  // Header
  document.getElementById('km-hdr').innerHTML = `
    <div class="km-hzh">${kd.zh}</div>
    <div class="km-hinfo">
      <div class="km-hen">${kd.en} · ${kd.zh}</div>
      <div class="km-hyrs">${kd.yrs}</div>
      <div class="km-hcap">Capital · ${kd.cap}</div>
    </div>`;

  // Body
  if (kd.soon) {
    document.getElementById('km-body').innerHTML = buildKmSoon(fid);
  } else {
    // Wei full layout
    const initSnap = kmGetTerritory(kmYear);
    const initEv   = kmGetEvent(kmYear);
    const pct = ((kmYear - kd.sliderMin) / (kd.sliderMax - kd.sliderMin) * 100).toFixed(1) + '%';

    document.getElementById('km-body').innerHTML = `
      <div class="km-left" id="km-left">${buildKmLeftWei()}</div>
      <div class="km-right">
        <div class="km-map-wrap" id="km-map-wrap"></div>
        <div class="km-slider-area">
          <div class="km-year-row">
            <span class="km-year-lbl">Año · 年</span>
            <span class="km-year-num" id="km-year-num">${kmYear} d.C.</span>
          </div>
          <input type="range" class="km-range" id="km-year-slider"
            min="${kd.sliderMin}" max="${kd.sliderMax}" value="${kmYear}">
          <div class="km-event-card" id="km-event-card">
            <div class="km-event-title">${initEv.title}</div>
            <div class="km-event-desc">${initEv.desc}</div>
          </div>
        </div>
      </div>`;

    overlay.style.setProperty('--km-pct', pct);

    // Inject SVG
    document.getElementById('km-map-wrap').innerHTML = buildKmSVG();

    // Apply initial territory
    updateKmTerritory(initSnap.ctrl);
    updateKmYearOverlay(kmYear);
    updateKmRulers(kmYear);

    // Wire slider
    const slider = document.getElementById('km-year-slider');
    slider.addEventListener('input', e => {
      updateKmYear(parseInt(e.target.value));
    });
  }

  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
}

// ── Close modal ──
function closeKm() {
  document.getElementById('km-overlay').classList.remove('open');
  document.body.style.overflow = '';
}

// ── Keyboard close ──
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && document.getElementById('km-overlay').classList.contains('open')) {
    closeKm();
  }
});

// ── Wire faction card clicks ──
document.querySelectorAll('.fcard[data-fid]').forEach(card => {
  card.addEventListener('click', () => openKm(card.dataset.fid));
});
