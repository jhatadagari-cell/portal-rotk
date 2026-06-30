/* ═══════════════════════════════════════════════════════════════════════
   gen-iso-sprites.js — Genera (hornea) los sprites isométricos de los
   edificios de las haciendas a PNG con transparencia, SIN dependencias.

   Uso:  node tools/gen-iso-sprites.js
   Salida: assets/img/iso/bld-*.png  +  assets/js/iso-sprites-meta.js
           (este último exporta window.ISO_SPRITES_META con los anclajes)

   Determinista: misma entrada → misma salida. Los PNG son ASSETS FIJOS; el
   render (hac-iso.js) solo los coloca. Para cambiar el arte, edita este
   generador y vuelve a ejecutarlo, o sustituye los PNG por un set externo
   con el mismo naming/anclaje.
   ═══════════════════════════════════════════════════════════════════════ */
'use strict';
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const IMG_DIR = path.join(ROOT, 'assets', 'img', 'iso');
const META_FILE = path.join(ROOT, 'assets', 'js', 'iso-sprites-meta.js');

const TW = 36, TH = 18;          // tile isométrico (igual que hac-iso.js)

// ── Color helpers ────────────────────────────────────────────────────────
function hexToRgb(h){h=String(h).replace('#','');if(h.length===3)h=h.split('').map(c=>c+c).join('');return [parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)];}
const cl=v=>Math.max(0,Math.min(255,Math.round(v)));
const toHex=(r,g,b)=>'#'+[r,g,b].map(v=>cl(v).toString(16).padStart(2,'0')).join('');
function mix(a,b,t){const A=hexToRgb(a),B=hexToRgb(b);return toHex(A[0]+(B[0]-A[0])*t,A[1]+(B[1]-A[1])*t,A[2]+(B[2]-A[2])*t);}
const light=(c,t)=>mix(c,'#ffffff',t), dark=(c,t)=>mix(c,'#000000',t);

// ── Raster RGBA (SUPERSAMPLING) ──────────────────────────────────────────
// El dibujo se hace en coordenadas LÓGICAS; las primitivas rasterizan a S×
// (más densidad de píxeles: bordes de polígono más finos). S debe coincidir
// con HacIso.SCALE del render para que los anclajes (meta) cuadren.
const S = 2;
function makeBuf(W,H){ const DW=Math.round(W*S),DH=Math.round(H*S); return { W:DW, H:DH, data:new Uint8Array(DW*DH*4) }; }
function pxd(buf,X,Y,rgb,a){ if(X<0||Y<0||X>=buf.W||Y>=buf.H)return; const i=(Y*buf.W+X)*4; buf.data[i]=rgb[0];buf.data[i+1]=rgb[1];buf.data[i+2]=rgb[2];buf.data[i+3]=a==null?255:a; }
// px LÓGICO → bloque S×S (puntos sueltos: remates, centros de flor, tachones…).
function px(buf,x,y,rgb,a){ const X=Math.round(x*S),Y=Math.round(y*S); for(let dy=0;dy<S;dy++)for(let dx=0;dx<S;dx++)pxd(buf,X+dx,Y+dy,rgb,a); }
function fillPoly(buf,pts,hex){
  const rgb=hexToRgb(hex), P=pts.map(p=>[p[0]*S,p[1]*S]);
  let minY=Infinity,maxY=-Infinity;
  P.forEach(p=>{minY=Math.min(minY,p[1]);maxY=Math.max(maxY,p[1]);});
  minY=Math.max(0,Math.floor(minY));maxY=Math.min(buf.H-1,Math.ceil(maxY));
  for(let y=minY;y<=maxY;y++){
    const xs=[];
    for(let i=0;i<P.length;i++){const a=P[i],b=P[(i+1)%P.length];
      if((a[1]<=y&&b[1]>y)||(b[1]<=y&&a[1]>y)){const t=(y-a[1])/(b[1]-a[1]);xs.push(a[0]+t*(b[0]-a[0]));}}
    xs.sort((p,q)=>p-q);
    for(let k=0;k+1<xs.length;k+=2){const x0=Math.max(0,Math.round(xs[k])),x1=Math.min(buf.W-1,Math.round(xs[k+1])-1);
      for(let x=x0;x<=x1;x++)pxd(buf,x,y,rgb,255);}
  }
}
function lineP(buf,a,b,hex){
  const rgb=hexToRgb(hex);
  let x0=Math.round(a[0]*S),y0=Math.round(a[1]*S),x1=Math.round(b[0]*S),y1=Math.round(b[1]*S);
  const dx=Math.abs(x1-x0),dy=Math.abs(y1-y0),sx=x0<x1?1:-1,sy=y0<y1?1:-1;let err=dx-dy;
  for(;;){ for(let q=0;q<S;q++)for(let p=0;p<S;p++)pxd(buf,x0+p,y0+q,rgb,255);   // grosor ~S
    if(x0===x1&&y0===y1)break;const e2=2*err;if(e2>-dy){err-=dy;x0+=sx;}if(e2<dx){err+=dx;y0+=sy;}}
}
// Elipse rellena (nenúfares, flores, piedras, reflejos del agua).
function fillEllipse(buf,cx,cy,rx,ry,hex){
  const rgb=hexToRgb(hex); cx*=S;cy*=S;rx*=S;ry*=S;
  const y0=Math.floor(cy-ry),y1=Math.ceil(cy+ry);
  for(let y=y0;y<=y1;y++){const dy=(y-cy)/ry; if(dy<-1||dy>1)continue;
    const span=rx*Math.sqrt(Math.max(0,1-dy*dy));
    for(let x=Math.round(cx-span);x<=Math.round(cx+span);x++)pxd(buf,x,y,rgb,255);}
}
// PRNG determinista (LCG) — mismas semillas → mismos jardines.
function rng(seed){let s=(seed>>>0)||1;return()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296;};}

// ── Texturas pixel-art (rompen el monocromo: veta, moteado, dither) ───────
const BAYER4=[0,8,2,10, 12,4,14,6, 3,11,1,9, 15,7,13,5];
function h2(x,y){ const s=Math.sin(x*12.9898+y*78.233)*43758.5453; return s-Math.floor(s); }
// fillPoly cuyo color lo decide fn(X,Y) por píxel de DISPOSITIVO → texturas.
function fillPolyFn(buf,pts,fn){
  const P=pts.map(p=>[p[0]*S,p[1]*S]); let minY=Infinity,maxY=-Infinity;
  P.forEach(p=>{minY=Math.min(minY,p[1]);maxY=Math.max(maxY,p[1]);});
  minY=Math.max(0,Math.floor(minY));maxY=Math.min(buf.H-1,Math.ceil(maxY));
  for(let y=minY;y<=maxY;y++){ const xs=[];
    for(let i=0;i<P.length;i++){const a=P[i],b=P[(i+1)%P.length];
      if((a[1]<=y&&b[1]>y)||(b[1]<=y&&a[1]>y)){const t=(y-a[1])/(b[1]-a[1]);xs.push(a[0]+t*(b[0]-a[0]));}}
    xs.sort((p,q)=>p-q);
    for(let k=0;k+1<xs.length;k+=2){const x0=Math.max(0,Math.round(xs[k])),x1=Math.min(buf.W-1,Math.round(xs[k+1])-1);
      for(let x=x0;x<=x1;x++){ const c=fn(x,y); if(c) pxd(buf,x,y,c,255); } }
  }
}
// Moteado de piedra: base con píxeles más oscuros (desgaste) y algún claro.
function txStone(base){ const b=hexToRgb(base),d=hexToRgb(dark(base,.13)),d2=hexToRgb(dark(base,.24)),l=hexToRgb(light(base,.10));
  return (X,Y)=>{ const n=h2(X*0.8,Y*0.8); return n>0.94?d2 : n>0.82?d : n<0.10?l : b; }; }
// Veta de madera vertical: columnas con tono variable + juntas de tablón.
function txWoodV(base){ const b=hexToRgb(base),d=hexToRgb(dark(base,.13)),d2=hexToRgb(dark(base,.27)),l=hexToRgb(light(base,.07));
  return (X,Y)=>{ const c=Math.floor(X/2), n=h2(c*1.3,1), m=h2(c*0.7+Math.floor(Y/3)*0.11,2);
    return n>0.90?d2 : n>0.66?d : m>0.85?l : m<0.12?d : b; }; }
// Moteado de césped: briznas claras y calvas oscuras (ribera natural).
function txGrass(base){ const b=hexToRgb(base),d=hexToRgb(dark(base,.16)),d2=hexToRgb(dark(base,.30)),l=hexToRgb(light(base,.14));
  return (X,Y)=>{ const n=h2(X*0.95,Y*0.95); return n>0.90?l : n>0.78?d : n<0.12?d2 : b; }; }
// Tejado: gradiente claro(cumbrera)→oscuro(alero) suavizado con dither Bayer.
function roofFill(buf,pts,base){ const P2=pts.map(p=>[p[0]*S,p[1]*S]); let mn=Infinity,mx=-Infinity;
  P2.forEach(p=>{mn=Math.min(mn,p[1]);mx=Math.max(mx,p[1]);}); const span=Math.max(1,mx-mn);
  const hi=hexToRgb(light(base,.11)),mid=hexToRgb(base),lo=hexToRgb(dark(base,.11));
  fillPolyFn(buf,pts,(X,Y)=>{ const f=(Y-mn)/span, bj=(BAYER4[(Y&3)*4+(X&3)]/16-0.5)*0.55;
    const t=(1-f)*2-1+bj; return t>0.33?hi : t<-0.33?lo : mid; }); }

// ── PNG RGBA (color type 6) ──────────────────────────────────────────────
const crcT=(()=>{const t=[];for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;t[n]=c>>>0;}return t;})();
const crc32=b=>{let c=0xffffffff;for(let i=0;i<b.length;i++)c=crcT[(c^b[i])&0xff]^(c>>>8);return(c^0xffffffff)>>>0;};
function chunk(type,data){const l=Buffer.alloc(4);l.writeUInt32BE(data.length,0);const cd=Buffer.concat([Buffer.from(type),data]);const c=Buffer.alloc(4);c.writeUInt32BE(crc32(cd),0);return Buffer.concat([l,cd,c]);}
function writePng(file,buf){
  const sig=Buffer.from([137,80,78,71,13,10,26,10]);
  const ih=Buffer.alloc(13);ih.writeUInt32BE(buf.W,0);ih.writeUInt32BE(buf.H,4);ih[8]=8;ih[9]=6;
  const raw=Buffer.alloc(buf.H*(1+buf.W*4));
  for(let y=0;y<buf.H;y++){raw[y*(1+buf.W*4)]=0;for(let x=0;x<buf.W*4;x++)raw[y*(1+buf.W*4)+1+x]=buf.data[y*buf.W*4+x];}
  fs.writeFileSync(file,Buffer.concat([sig,chunk('IHDR',ih),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]));
}

// ── Paleta común (cohesión tipo la referencia: tejado rojizo, madera, piedra) ──
const PAL = {
  wallL:'#74532e', wall:'#5c4024', wallD:'#3c2a18',
  beam:'#9c3c22', beamD:'#6a2614',            // columnas de laca roja (cinabrio)
  stoneT:'#a39a8b', stone:'#82796d', stoneD:'#564f45',
  door:'#2a1c10', doorStud:'#caa64a',         // tachones dorados de la puerta
  frieze:'#3a8472', friezeL:'#54a48e', friezeD:'#214a42', // friso pintado bajo alero
  bracket:'#c2592c',                          // ménsulas dougong
  lattice:'#9a7848',                          // celosía de ventana
  ridgeOrn:'#33231a', finial:'#d0a84a'        // remates de cumbrera / dorado
};

// ── Dibujo de un edificio ────────────────────────────────────────────────
// cfg: { w, h, roof, baseH, bodyH, roofH, stories, bodyH2, roofH2 }
function drawBuilding(cfg, layer) {
  layer = layer || 'all';
  const wantBase = layer !== 'body', wantBody = layer !== 'base';
  const { w, h, roof } = cfg;
  const baseH = cfg.baseH ?? 5;
  const bodyH = cfg.bodyH ?? 14;
  const roofH = cfg.roofH ?? 13;
  const ovB = 0.22, ovR = 0.3;     // voladizos de base y alero
  // GROSOR MÍNIMO para edificios cerrados de 1 celda de ancho/fondo: sin tocar
  // su footprint, se hornean con cuerpo más grueso (≈0.76 celda en vez de 0.44)
  // para que se lean como volumen y no como un tablón. Los tipos ABIERTOS por
  // diseño (galería, quiosco) no lo llevan. El cuerpo se extiende a ±pad sobre
  // las celdas extremas (bx0..bx1, by0..by1).
  const PADW = 0.38;
  const padX = (cfg.minThick && w === 1) ? PADW : 0;
  const padY = (cfg.minThick && h === 1) ? PADW : 0;
  const PB = padX + padY;          // holgura extra (uno de los dos es 0 en la práctica)
  const bx0 = -padX, by0 = -padY, bx1 = (w - 1) + padX, by1 = (h - 1) + padY;

  // Pisos superiores (cuerpos+tejados apilados que encogen). `tiers` es una
  // lista explícita; `stories:true` es el atajo de UN solo piso (compatibilidad).
  const tierList = cfg.tiers ? cfg.tiers : (cfg.stories ? [{ bodyH: cfg.bodyH2, roofH: cfg.roofH2 }] : []);
  const tierIns = cfg.tierIns ?? 0.5;          // cuánto encoge cada piso por lado
  const tier0Ins = cfg.tier0Ins ?? 0.55;       // encogido del primer piso superior
  const tiersExtra = tierList.reduce((s, t) => s + t.bodyH + t.roofH - 1, 0);
  const totalH = baseH + bodyH + roofH + tiersExtra + 11;
  const W = Math.ceil((w + h - 2 + 2 * PB + 4 * ovR) * TW / 2) + 6;
  const OX = Math.round((h - 1 + PB + 2 * ovR) * TW / 2) + 3;
  const OY = Math.round(totalH + PB * TH / 2) + 2;
  const H = OY + Math.ceil((w + h - 2 + PB + 2 * ovR) * TH / 2) + Math.ceil(TH / 2) + 4;
  const buf = makeBuf(W, H);

  const P = (gx, gy, gz) => [OX + (gx - gy) * TW / 2, OY + (gx + gy) * TH / 2 - gz];

  // Prisma con bounds float [x0,y0]..[x1,y1] y voladizo `ov`, entre z0 y z1.
  // tex: 'wood' (veta vertical) | 'stone' (moteado) | null (color plano).
  function prism(x0, y0, x1, y1, ov, z0, z1, cTop, cL, cR, edge, tex) {
    const N=[x0-ov,y0-ov], E=[x1+ov,y0-ov], S=[x1+ov,y1+ov], Wc=[x0-ov,y1+ov];
    const T=p=>P(p[0],p[1],z1), B=p=>P(p[0],p[1],z0);
    const TX = tex==='wood'?txWoodV : tex==='stone'?txStone : null;
    const f = (pts,col)=> TX ? fillPolyFn(buf,pts,TX(col)) : fillPoly(buf,pts,col);
    f([B(Wc),B(S),T(S),T(Wc)],cL);
    f([B(S),B(E),T(E),T(S)],cR);
    f([T(N),T(E),T(S),T(Wc)],cTop);
    if(edge){lineP(buf,T(S),T(Wc),edge);lineP(buf,T(E),T(S),edge);}
  }

  // Tejado a 4 aguas con alero volado, fascia, limatesas, cursos de teja y
  // aleros levantados.
  function hipRoof(x0, y0, x1, y1, zEave, rh, c) {
    const roofL=light(c,.26), roofR=dark(c,.04), roofBack=dark(c,.34);
    const eave=light(c,.44), ridge=dark(c,.42), fascia=dark(c,.58), ridgeCap=light(c,.50);
    const courseL=dark(c,.10), courseR=dark(c,.22);   // líneas de teja
    const lerp=(a,b,t)=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
    const dx=x1-x0, dy=y1-y0;
    const flyUp=Math.max(3, Math.round(rh*0.4));       // vuelo del alero en las esquinas (起翘)
    const N=P(x0-ovR,y0-ovR,zEave), E=P(x1+ovR,y0-ovR,zEave), S=P(x1+ovR,y1+ovR,zEave), Wc=P(x0-ovR,y1+ovR,zEave);
    const cx=(x0+x1)/2, cy=(y0+y1)/2;
    let r0,r1;
    // Inset de cumbrera: más corto en edificios alargados (caballete largo).
    const insL = (dx>=dy ? (dx>dy?0.12:0.2) : (dy>dx?0.12:0.2));
    if(dx>=dy){ r0=P(x0+insL*dx,cy,zEave+rh); r1=P(x1-insL*dx,cy,zEave+rh); if(dx===0){r0=P(cx,cy,zEave+rh);r1=r0;} }
    else      { r0=P(cx,y0+insL*dy,zEave+rh); r1=P(cx,y1-insL*dy,zEave+rh); }
    // Esquinas con el alero ELEVADO (vuelo) y curva CÓNCAVA (反宇): entre dos
    // esquinas elevadas, el borde del alero se comba hacia abajo en el centro.
    const up=p=>[p[0],p[1]-flyUp];
    const Su=up(S), Eu=up(E), Wu=up(Wc), Nu=up(N);
    const eaveCurve=(A,B,seg)=>{ const o=[]; for(let i=0;i<=seg;i++){ const t=i/seg, p=lerp(A,B,t); o.push([p[0],p[1]+flyUp*4*t*(1-t)]); } return o; };
    const courseQuad=(ea,eb,ra,rb,col)=>{ for(const t of [.16,.32,.48,.64,.80,.92]) lineP(buf,lerp(ea,ra,t),lerp(eb,rb,t),col); };
    const courseHip =(ba,bb,ap,col)=>{ for(const t of [.25,.5,.72,.9]) lineP(buf,lerp(ba,ap,t),lerp(bb,ap,t),col); };
    const ribQuad=(ea,eb,ra,rb,col)=>{ const n=Math.max(3,Math.round(Math.hypot(eb[0]-ea[0],eb[1]-ea[1])/5));
      for(let i=1;i<n;i++){ const u=i/n; lineP(buf,lerp(ea,eb,u),lerp(ra,rb,u),col); } };
    const polyline=(pts,col)=>{ for(let i=0;i<pts.length-1;i++) lineP(buf,pts[i],pts[i+1],col); };
    const drop=p=>[p[0],p[1]+2];
    const fasciaOf=(cv)=>{ for(let i=0;i<cv.length-1;i++) fillPoly(buf,[cv[i],cv[i+1],drop(cv[i+1]),drop(cv[i])],fascia); };
    const teeth=(cv)=>{ for(let i=0;i<cv.length;i++) fillEllipse(buf,cv[i][0],cv[i][1]+1,1.3,1,eave); };
    // Cuerno de alero volado (起翘): la punta sube y se curva hacia afuera.
    const horn=(Cu,ox)=>{ fillPoly(buf,[[Cu[0],Cu[1]+1],[Cu[0]+ox*0.4,Cu[1]-2],[Cu[0]+ox*1.5,Cu[1]-4],[Cu[0]+ox*1.8,Cu[1]-2.4],[Cu[0]+ox*0.7,Cu[1]+1]],eave);
      px(buf,Math.round(Cu[0]+ox*1.6),Math.round(Cu[1]-4),hexToRgb(PAL.finial),255); };

    if(dx>=dy){
      const swC=eaveCurve(Su,Wu,7), seC=eaveCurve(Eu,Su,4);
      fasciaOf(swC); fasciaOf(seC);
      fillPoly(buf,[r0,r1,Eu,Nu],roofBack);                 // norte (atrás)
      fillPoly(buf,[r0,Nu,Wu],roofBack);                    // hip oeste (atrás)
      roofFill(buf,[r1].concat(seC),roofR);                 // hip este (frente-der)
      roofFill(buf,[r0,r1].concat(swC),roofL);              // faldón sur (frente)
      courseQuad(Wu,Su,r0,r1,courseL);
      ribQuad(Wu,Su,r0,r1,dark(roofL,.12));
      courseHip(Eu,Su,r1,courseR);
      lineP(buf,r0,Wu,ridge); lineP(buf,r1,Su,ridge); lineP(buf,r1,Eu,ridge);
      polyline(swC,eave); polyline(seC,eave);
      teeth(swC); teeth(seC);
      horn(Su,1.7); horn(Wu,-2.4); horn(Eu,2.4);
    } else {
      const seC=eaveCurve(Su,Eu,4), swC=eaveCurve(Su,Wu,7);
      fasciaOf(seC); fasciaOf(swC);
      fillPoly(buf,[r0,Eu,Nu],roofBack);
      fillPoly(buf,[r0,r1,Wu,Nu],roofBack);
      roofFill(buf,[r0,r1].concat(seC),roofR);              // faldón este (frente)
      roofFill(buf,[r1].concat(swC),roofL);                 // hip oeste (frente-izq)
      courseQuad(Eu,Su,r0,r1,courseR);
      ribQuad(Eu,Su,r0,r1,dark(roofR,.12));
      courseHip(Wu,Su,r1,courseL);
      lineP(buf,r0,Eu,ridge); lineP(buf,r1,Su,ridge); lineP(buf,r1,Wu,ridge);
      polyline(seC,eave); polyline(swC,eave);
      teeth(seC); teeth(swC);
      horn(Su,1.7); horn(Eu,2.4); horn(Wu,-2.4);
    }
    // Cumbrera engrosada y caballete claro.
    lineP(buf,r0,r1,ridge); lineP(buf,[r0[0],r0[1]-1],[r1[0],r1[1]-1],ridge);
    lineP(buf,[r0[0],r0[1]-2],[r1[0],r1[1]-2],ridgeCap);
    // Remates de cumbrera 鴟吻 (las "dos puntas"): cola curva hacia dentro + perla dorada.
    const orn=(p,dir)=>{ const o=PAL.ridgeOrn;
      fillPoly(buf,[[p[0],p[1]+1],[p[0],p[1]-5],[p[0]+dir*2,p[1]-7],[p[0]+dir*4,p[1]-6],[p[0]+dir*3,p[1]-2],[p[0]+dir*1.5,p[1]+1]],o);
      px(buf,Math.round(p[0]+dir*3),Math.round(p[1]-6),hexToRgb(PAL.finial),255);
      px(buf,Math.round(p[0]+dir*4),Math.round(p[1]-6),hexToRgb(PAL.finial),255); };
    orn(r0,1); orn(r1,-1);
  }

  // ── Terraza de PIEDRA GRIS (台基) para edificios grandes ────────────────
  // Plinto de piedra gris (青石) con escalinatas talladas (huella + contrahuella)
  // y rampa central, y balaustrada de pilares. Gris (no mármol blanco, que sería
  // Ming/Qing) para casar con la teja y el ladrillo Han.
  const MB = { t:'#b7b4ab', l:'#9b988f', r:'#8b887f', d:'#75726a', edge:'#5d5b53', j:'#8d8a81' };
  const tov = 0.34;                                  // vuelo del plinto (cornisa)
  const swS = Math.max(0.75, (w-1)*0.30), swE = Math.max(0.75, (h-1)*0.30);
  const cxS = (w-1)/2, cyE = (h-1)/2;
  function marbleCourses(yb, xb) {
    const courses = Math.max(2, Math.round(baseH / 3.5));
    for (let i = 1; i < courses; i++) { const z = baseH * i / courses;
      lineP(buf, P(-tov, yb, z), P(w-1+tov, yb, z), MB.j);
      lineP(buf, P(xb, -tov, z), P(xb, h-1+tov, z), MB.j);
    }
    for (let gx = 0; gx <= w-1; gx++) lineP(buf, P(gx, yb, 0), P(gx, yb, baseH), dark(MB.r,.06));
    for (let gy = 0; gy <= h-1; gy++) lineP(buf, P(xb, gy, 0), P(xb, gy, baseH), dark(MB.r,.06));
  }
  function stairFlight(face) {
    const n = Math.max(4, Math.round(baseH / 1.5)), stepH = baseH / n, dRun = 0.12, D = n * dRun;
    if (face === 'S') {
      const sw = swS, cx = cxS, yb = (h-1)+tov;
      [-1,1].forEach(s => { const xx = cx + s*sw;                    // mejillones laterales
        fillPoly(buf, [P(xx, yb, baseH), P(xx, yb+D, 0), P(xx, yb, 0)], s>0?MB.r:MB.l);
        lineP(buf, P(xx, yb, baseH), P(xx, yb+D, 0), MB.edge); });
      for (let k = n-1; k >= 0; k--) {                              // peldaños (atrás→delante)
        const yf = yb + D - k*dRun, z1 = (k+1)*stepH, z0 = k*stepH;
        fillPoly(buf, [P(cx-sw, yf, z0), P(cx+sw, yf, z0), P(cx+sw, yf, z1), P(cx-sw, yf, z1)], MB.r);          // contrahuella
        fillPoly(buf, [P(cx-sw, yf, z1), P(cx+sw, yf, z1), P(cx+sw, yf-dRun, z1), P(cx-sw, yf-dRun, z1)], MB.t); // huella
        lineP(buf, P(cx-sw, yf, z1), P(cx+sw, yf, z1), light(MB.t,.12));                                        // mamperlán
      }
      const rw = sw*0.32;                                           // rampa central tallada (御路)
      fillPoly(buf, [P(cx-rw, yb, baseH), P(cx+rw, yb, baseH), P(cx+rw, yb+D, 0), P(cx-rw, yb+D, 0)], mix(MB.t,'#d8c5a4',.28));
      lineP(buf, P(cx-rw, yb, baseH), P(cx-rw, yb+D, 0), MB.edge);
      lineP(buf, P(cx+rw, yb, baseH), P(cx+rw, yb+D, 0), MB.edge);
      for (let k=1;k<n;k++){ const t=k/n; lineP(buf, P(cx-rw, yb+t*D, baseH*(1-t)), P(cx+rw, yb+t*D, baseH*(1-t)), dark(MB.j,.08)); }
    } else {
      const sw = swE, cy = cyE, xb = (w-1)+tov;
      [-1,1].forEach(s => { const yy = cy + s*sw;
        fillPoly(buf, [P(xb, yy, baseH), P(xb+D, yy, 0), P(xb, yy, 0)], s>0?MB.r:MB.l);
        lineP(buf, P(xb, yy, baseH), P(xb+D, yy, 0), MB.edge); });
      for (let k = n-1; k >= 0; k--) {
        const xf = xb + D - k*dRun, z1 = (k+1)*stepH, z0 = k*stepH;
        fillPoly(buf, [P(xf, cy-sw, z0), P(xf, cy+sw, z0), P(xf, cy+sw, z1), P(xf, cy-sw, z1)], MB.l);
        fillPoly(buf, [P(xf, cy-sw, z1), P(xf, cy+sw, z1), P(xf-dRun, cy+sw, z1), P(xf-dRun, cy-sw, z1)], MB.t);
        lineP(buf, P(xf, cy-sw, z1), P(xf, cy+sw, z1), light(MB.t,.12));
      }
      const rw = sw*0.32;
      fillPoly(buf, [P(xb, cy-rw, baseH), P(xb, cy+rw, baseH), P(xb+D, cy+rw, 0), P(xb+D, cy-rw, 0)], mix(MB.t,'#d8c5a4',.28));
      lineP(buf, P(xb, cy-rw, baseH), P(xb+D, cy-rw, 0), MB.edge);
      lineP(buf, P(xb, cy+rw, baseH), P(xb+D, cy+rw, 0), MB.edge);
      for (let k=1;k<n;k++){ const t=k/n; lineP(buf, P(xb+t*D, cy-rw, baseH*(1-t)), P(xb+t*D, cy+rw, baseH*(1-t)), dark(MB.j,.08)); }
    }
  }
  // Balaustrada (栏杆): hilera de pilares (望柱) con remate redondeado y dos
  // pasamanos, recorriendo las dos caras frontales (saltando el hueco de la
  // escalera). Se dibuja la ÚLTIMA (en primer plano, sobre el edificio).
  function balustrade() {
    const ph = 5.5, pw = 0.085, yb = (h-1)+tov, xb = (w-1)+tov;
    const panel = (a, b, fixed, face) => {
      const pt = (u,z) => face==='S' ? P(u,fixed,z) : P(fixed,u,z);
      fillPoly(buf, [pt(a,baseH+0.5), pt(b,baseH+0.5), pt(b,baseH+ph-0.9), pt(a,baseH+ph-0.9)], MB.t);
      lineP(buf, pt(a,baseH+ph-0.9), pt(b,baseH+ph-0.9), light(MB.t,.10));   // pasamanos superior
      lineP(buf, pt(a,baseH+ph*0.42), pt(b,baseH+ph*0.42), MB.d);            // larguero inferior
    };
    const post = (gx,gy) => {
      prism(gx-pw, gy-pw, gx+pw, gy+pw, 0, baseH, baseH+ph, light(MB.t,.07), MB.l, MB.r, MB.edge);
      const c = P(gx, gy, baseH+ph);
      fillEllipse(buf, c[0], c[1]-0.4, 1.5, 1.2, light(MB.t,.13));           // cabeza (望柱头)
      px(buf, Math.round(c[0]), Math.round(c[1]-1.4), hexToRgb(MB.d), 255);
    };
    const run = (n, fixed, face, cx, sw) => {
      const posts = [];
      for (let u=0; u<=n+1e-6; u+=0.5) { const gap = u>cx-sw-0.2 && u<cx+sw+0.2; if(!gap) posts.push(u); }
      for (let i=1;i<posts.length;i++) if (posts[i]-posts[i-1] < 0.75) panel(posts[i-1], posts[i], fixed, face);
      posts.forEach(u => face==='S' ? post(u, fixed) : post(fixed, u));
    };
    run(w-1, yb, 'S', cxS, swS);
    run(h-1, xb, 'E', cyE, swE);
  }

  // Compuesto: varias alas rectangulares (L, U, anillo) en un mismo lienzo,
  // pintadas de atrás hacia delante. Reutiliza base+cuerpo+tejado del edificio.
  if (cfg.wings) {
    const order = cfg.wings.slice().sort((a,b)=>(a.x1+a.y1)-(b.x1+b.y1)||(a.x0+a.y0)-(b.x0+b.y0));
    order.forEach(wg=>{
      if (wantBase) prism(wg.x0,wg.y0,wg.x1,wg.y1, ovB, 0, baseH, PAL.stoneT, dark(PAL.stone,.06), PAL.stone, PAL.stoneD, 'stone');
      if (wantBody) { body(wg.x0,wg.y0,wg.x1,wg.y1, baseH, bodyH, wg.door); hipRoof(wg.x0,wg.y0,wg.x1,wg.y1, baseH+bodyH, roofH, roof); }
    });
    return { buf, ox: OX, oy: OY };
  }

  let z = 0;
  if (wantBase) {
    if (cfg.stairs) {
      prism(0,0,w-1,h-1, tov, 0, baseH, MB.t, MB.l, MB.r, MB.edge);
      marbleCourses((h-1)+tov, (w-1)+tov);
      stairFlight('S'); stairFlight('E');
    } else {
      prism(bx0,by0,bx1,by1, ovB, z, z+baseH, PAL.stoneT, dark(PAL.stone,.06), PAL.stone, PAL.stoneD, 'stone');
    }
  }
  z += baseH;

  // door: 'x' = puerta en la cara +x (derecha/SE); 'y' = cara +y (izq/SW);
  // null = sin puerta (ventanas en ambas caras). La otra cara lleva ventanas.
  function body(x0,y0,x1,y1, zc, bh, door) {
    prism(x0,y0,x1,y1, 0, zc, zc+bh, PAL.wall, PAL.wallD, PAL.wallL, PAL.beamD, 'wood');
    const top = zc + bh;
    // Pilares de laca roja (cinabrio) en las aristas frontales, 2 px de grueso.
    [[x1,y1],[x1,y0],[x0,y1]].forEach(([gx,gy])=>{
      const a=P(gx,gy,zc), b=P(gx,gy,top);
      lineP(buf,a,b,PAL.beam);
      lineP(buf,[a[0]+1,a[1]],[b[0]+1,b[1]],PAL.beam);
      lineP(buf,[a[0]-1,a[1]],[b[0]-1,b[1]],PAL.beamD);
    });
    // Friso pintado bajo el alero + ménsulas (dougong) en las dos caras vistas.
    const fz0=top-4.4, fz1=top-0.7, fzm=(fz0+fz1)/2;
    fillPoly(buf,[P(x0,y1,fz0),P(x1,y1,fz0),P(x1,y1,fz1),P(x0,y1,fz1)],PAL.frieze);
    lineP(buf,P(x0,y1,fzm),P(x1,y1,fzm),PAL.friezeL);
    lineP(buf,P(x0,y1,fz0),P(x1,y1,fz0),PAL.friezeD);
    fillPoly(buf,[P(x1,y0,fz0),P(x1,y1,fz0),P(x1,y1,fz1),P(x1,y0,fz1)],PAL.frieze);
    lineP(buf,P(x1,y0,fzm),P(x1,y1,fzm),PAL.friezeL);
    lineP(buf,P(x1,y0,fz0),P(x1,y1,fz0),PAL.friezeD);
    for(let g=x0; g<=x1+0.001; g+=0.5) lineP(buf,P(g,y1,fz1),P(g,y1,top-0.1),PAL.bracket);
    for(let g=y0; g<=y1+0.001; g+=0.5) lineP(buf,P(x1,g,fz1),P(x1,g,top-0.1),PAL.bracket);
    // Ventana con celosía (panel oscuro + cruz clara) y puerta con tachones.
    const wy0=Math.round(zc+bh*0.30), wy1=Math.round(zc+bh*0.64), dh=Math.round(bh*0.60), wm=(wy0+wy1)/2;
    const winX=(gy)=>{ fillPoly(buf,[P(x1,gy+0.28,wy0),P(x1,gy+0.72,wy0),P(x1,gy+0.72,wy1),P(x1,gy+0.28,wy1)],dark(PAL.wall,.5));
      lineP(buf,P(x1,gy+0.5,wy0),P(x1,gy+0.5,wy1),PAL.lattice); lineP(buf,P(x1,gy+0.28,wm),P(x1,gy+0.72,wm),PAL.lattice); };
    const winY=(gx)=>{ fillPoly(buf,[P(gx+0.28,y1,wy0),P(gx+0.72,y1,wy0),P(gx+0.72,y1,wy1),P(gx+0.28,y1,wy1)],dark(PAL.wall,.5));
      lineP(buf,P(gx+0.5,y1,wy0),P(gx+0.5,y1,wy1),PAL.lattice); lineP(buf,P(gx+0.28,y1,wm),P(gx+0.72,y1,wm),PAL.lattice); };
    if(door==='x'){
      const gm=(y0+y1)/2;
      fillPoly(buf,[P(x1,gm-0.38,zc),P(x1,gm+0.38,zc),P(x1,gm+0.38,zc+dh),P(x1,gm-0.38,zc+dh)],PAL.door);
      lineP(buf,P(x1,gm,zc),P(x1,gm,zc+dh),dark(PAL.door,.4));
      fillEllipse(buf,P(x1,gm-0.16,zc+dh*0.55)[0],P(x1,gm-0.16,zc+dh*0.55)[1],1,1,PAL.doorStud);
      fillEllipse(buf,P(x1,gm+0.16,zc+dh*0.55)[0],P(x1,gm+0.16,zc+dh*0.55)[1],1,1,PAL.doorStud);
    } else { for(let gy=y0; gy<y1; gy++) winX(gy); }
    if(door==='y'){
      const xm=(x0+x1)/2;
      fillPoly(buf,[P(xm-0.38,y1,zc),P(xm+0.38,y1,zc),P(xm+0.38,y1,zc+dh),P(xm-0.38,y1,zc+dh)],PAL.door);
      lineP(buf,P(xm,y1,zc),P(xm,y1,zc+dh),dark(PAL.door,.4));
      fillEllipse(buf,P(xm-0.16,y1,zc+dh*0.55)[0],P(xm-0.16,y1,zc+dh*0.55)[1],1,1,PAL.doorStud);
      fillEllipse(buf,P(xm+0.16,y1,zc+dh*0.55)[0],P(xm+0.16,y1,zc+dh*0.55)[1],1,1,PAL.doorStud);
    } else { for(let gx=x0; gx<x1; gx++) winY(gx); }
  }

  if (wantBody) {
    body(bx0,by0,bx1,by1, z, bodyH, cfg.door);
    hipRoof(bx0,by0,bx1,by1, z+bodyH, roofH, roof);
    let zc = z + bodyH + roofH - 1;
    let ins = tier0Ins;
    tierList.forEach((ti) => {
      if ((bx1 - ins) - (bx0 + ins) < -0.16 || (by1 - ins) - (by0 + ins) < -0.16) return;
      body(bx0 + ins, by0 + ins, bx1 - ins, by1 - ins, zc, ti.bodyH, null);
      hipRoof(bx0 + ins, by0 + ins, bx1 - ins, by1 - ins, zc + ti.bodyH, ti.roofH, light(roof, .04));
      zc += ti.bodyH + ti.roofH - 1;
      ins += tierIns;
    });
  }
  if (cfg.stairs && wantBase) balustrade();
  // Decoración temática (edificios de clase): props del patio frontal, al final.
  if (wantBody && cfg.decor && DECOR_HALL[cfg.decor]) {
    DECOR_HALL[cfg.decor](buf, P, { w, h, baseH, bodyH, roofH, door: cfg.door });
  }
  return { buf, ox: OX, oy: OY };
}

// ── Catálogo a hornear (espejo de hac-build.js) ──────────────────────────
const EDIFICIOS = [
  { id:'pabellon',         w:1, h:2, roof:'#5b6068', bodyH:14, roofH:12, minThick:true },
  { id:'torre',            w:1, h:2, roof:'#5b6068', baseH:6, bodyH:30, roofH:11, minThick:true },
  { id:'pagoda',           w:2, h:2, roof:'#5b6068', bodyH:15, roofH:12, stories:true, bodyH2:12, roofH2:11 },
  { id:'galeria',          w:1, h:3, roof:'#5b6068', bodyH:13, roofH:11 },
  { id:'armeria',          w:2, h:2, roof:'#5b6068', bodyH:13, roofH:10 },
  { id:'ala',              w:2, h:3, roof:'#5b6068', bodyH:16, roofH:13 },
  { id:'templo',           w:2, h:3, roof:'#5b6068', baseH:6, bodyH:17, roofH:15, stories:true, bodyH2:9,  roofH2:11 },
  { id:'gran-pagoda',      w:2, h:4, roof:'#5b6068', baseH:6, bodyH:18, roofH:12, tier0Ins:0.2, tierIns:0.18,
    tiers:[{bodyH:13,roofH:10},{bodyH:11,roofH:9},{bodyH:9,roofH:8},{bodyH:8,roofH:7}] },
  { id:'salon',            w:3, h:4, roof:'#5b6068', bodyH:19, roofH:18 },
  { id:'templo-ancestral', w:3, h:4, roof:'#5b6068', baseH:7, bodyH:18, roofH:15, stories:true, bodyH2:10, roofH2:12 },
  { id:'salon-gran',       w:4, h:3, roof:'#5b6068', baseH:7, bodyH:19, roofH:16, stories:true, bodyH2:9,  roofH2:12 },
  { id:'pabellon-gran',    w:3, h:4, roof:'#5b6068', baseH:6, bodyH:18, roofH:16 },
  { id:'salon-corte',      w:3, h:6, roof:'#5b6068', baseH:8, bodyH:20, roofH:17, stairs:true, stories:true, bodyH2:10, roofH2:13 },
  { id:'palacio',          w:4, h:6, roof:'#5b6068', baseH:9, bodyH:22, roofH:18, stairs:true, stories:true, bodyH2:12, roofH2:15 },
  { id:'salon-largo',      w:3, h:5, roof:'#5b6068', baseH:7, bodyH:20, roofH:17, stories:true, bodyH2:10, roofH2:13 },
  { id:'salon-banquete',   w:3, h:7, roof:'#5b6068', baseH:8, bodyH:21, roofH:18, stairs:true, stories:true, bodyH2:11, roofH2:14 },
  { id:'cuartel',          w:4, h:5, roof:'#5b6068', baseH:6, bodyH:15, roofH:12 },
  { id:'gran-palacio',     w:4, h:7, roof:'#5b6068', baseH:10, bodyH:24, roofH:19, stairs:true, tier0Ins:0.6, tierIns:0.5,
    tiers:[{bodyH:14,roofH:13},{bodyH:11,roofH:11}] },
  { id:'salon-doble',      w:4, h:8, roof:'#5b6068', baseH:9, bodyH:21, roofH:18, stairs:true, stories:true, bodyH2:11, roofH2:14 },
  { id:'gran-recinto',     w:5, h:8, roof:'#5b6068', baseH:10, bodyH:24, roofH:20, stairs:true, tier0Ins:0.55, tierIns:0.5,
    tiers:[{bodyH:14,roofH:13},{bodyH:11,roofH:11}] },
  // ── Edificios de CLASE: teja GRIS Han como el resto; se diferencian por su
  //    DECORACIÓN (estandartes/estelas/tambores) + un tinte de pátina muy sutil.
  { id:'instruccion',      w:3, h:3, roof:'#4d5158', baseH:5, bodyH:15, roofH:13, decor:'instruccion' },                                   // 校場 militar (gris hierro, más oscuro)
  { id:'academia',         w:3, h:3, roof:'#586460', baseH:5, bodyH:16, roofH:13, stories:true, bodyH2:9, roofH2:11, decor:'academia' },   // 太學 cultural (gris con pátina verdosa leve)
  { id:'cancilleria',      w:3, h:3, roof:'#535b67', baseH:6, bodyH:16, roofH:14, decor:'cancilleria' },                                   // 官署 administrativo (gris con pátina azulada leve)
  // 'mercado' ya NO se genera aquí: usa un sprite HECHO A MANO (puesto ilustrado)
  // registrado en assets/js/iso-sprites-extra.js (bld-mercado-0.png).
  { id:'casa',             w:2, h:2, roof:'#5b6068', baseH:4, bodyH:12, roofH:11, decor:'casa' }                                           // 宅 casa de mecenas (cortina + farolillo)
];

// ── Compuestos: L, U y anillo (alas rectangulares unidas en escuadra) ─────
// `wings` = rectángulos [x0,y0,x1,y1] + cara con puerta. La rotación gira las
// alas con la MISMA rotaCelda que hac-build, para que el sprite cuadre con la
// huella. doorParam: 'E'(+x)→'x', 'S'(+y)→'y'; caras traseras (W/N) → ventanas.
function rotCell(dx,dy,w,h,rot){ rot=((rot%4)+4)%4;
  if(rot===1)return[h-1-dy,dx]; if(rot===2)return[w-1-dx,h-1-dy]; if(rot===3)return[dy,w-1-dx]; return[dx,dy]; }
function rotDoorDir(dir,rot){ if(!dir)return null; const s=['E','S','W','N']; return s[(s.indexOf(dir)+rot)%4]; }
function doorParam(dir){ return dir==='E'?'x':dir==='S'?'y':null; }
const COMPUESTOS = [
  { id:'ala-l',       w:3, h:3, roof:'#5b6068', baseH:5, bodyH:16, roofH:13,
    wings:[ {x0:0,y0:0,x1:0,y1:2,door:'E'}, {x0:0,y0:2,x1:2,y1:2,door:'S'} ] },
  { id:'ala-l-mayor', w:4, h:4, roof:'#5b6068', baseH:6, bodyH:17, roofH:14,
    wings:[ {x0:0,y0:0,x1:1,y1:3,door:'E'}, {x0:2,y0:2,x1:3,y1:3,door:'S'} ] },
  { id:'patio-u',     w:5, h:3, roof:'#5b6068', baseH:6, bodyH:17, roofH:14,
    wings:[ {x0:0,y0:0,x1:4,y1:0,door:'S'}, {x0:0,y0:0,x1:0,y1:2,door:'E'}, {x0:4,y0:0,x1:4,y1:2,door:null} ] },
  { id:'patio-o',     w:4, h:4, roof:'#5b6068', baseH:7, bodyH:18, roofH:15,
    wings:[ {x0:0,y0:0,x1:3,y1:0,door:'S'}, {x0:0,y0:3,x1:3,y1:3,door:'S'},
            {x0:0,y0:1,x1:0,y1:2,door:'E'}, {x0:3,y0:1,x1:3,y1:2,door:null} ] }
];

// ── Decoración 1×1 (faroles, antorchas, braseros, calderos, estandartes) ──
// Cada una es una mini-escena vertical sobre la celda (0,0). Comparten lienzo.
function drawDecor(cfg) {
  const totalH = cfg.totalH || 40;
  const W = TW + 18, OX = Math.round(W / 2), OY = totalH + 2;
  const H = OY + TH + 10;
  const buf = makeBuf(W, H);
  const P = (gx, gy, z) => [OX + (gx - gy) * TW / 2, OY + (gx + gy) * TH / 2 - z];
  cfg.draw(buf, P);
  return { buf, ox: OX, oy: OY };
}
// Prisma pequeño centrado (para pedestales/cuerpos de la decoración).
function miniPrism(buf, P, r, z0, z1, cTop, cL, cR) {
  fillPoly(buf, [P(-r, r, z0), P(r, r, z0), P(r, r, z1), P(-r, r, z1)], cL);
  fillPoly(buf, [P(r, r, z0), P(r, -r, z0), P(r, -r, z1), P(r, r, z1)], cR);
  fillPoly(buf, [P(-r, -r, z1), P(r, -r, z1), P(r, r, z1), P(-r, r, z1)], cTop);
}
function flame(buf, P, z) {
  const c = P(0, 0, z);
  fillEllipse(buf, c[0], c[1] - 3, 3.4, 5, '#e0641e');
  fillEllipse(buf, c[0], c[1] - 5, 2.1, 3.4, '#f0a020');
  fillEllipse(buf, c[0], c[1] - 6, 1.1, 2, '#ffe070');
}
const DECOR = [
  { id: 'farol', totalH: 30, draw: (buf, P) => {
      const st = '#8a8478', stD = '#5e594f', stL = '#a39c8d';
      miniPrism(buf, P, 0.26, 0, 4, stL, stD, st);                       // base
      lineP(buf, P(0, 0, 4), P(0, 0, 13), st); lineP(buf, [P(0,0,4)[0]+1,P(0,0,4)[1]], [P(0,0,13)[0]+1,P(0,0,13)[1]], stD); // fuste
      miniPrism(buf, P, 0.22, 13, 20, stL, stD, st);                     // caja de luz
      fillEllipse(buf, P(0.22,0,16.5)[0], P(0.22,0,16.5)[1], 1.4, 2.4, '#ffd060'); // ventana brillante
      fillEllipse(buf, P(0,0.22,16.5)[0], P(0,0.22,16.5)[1], 1.4, 2.4, '#ffd060');
      // tejadillo
      const ap = P(0, 0, 26), n = P(-0.34,-0.34,20), e = P(0.34,-0.34,20), s = P(0.34,0.34,20), ww = P(-0.34,0.34,20);
      fillPoly(buf,[n,e,ap],dark('#5b6068',.2)); fillPoly(buf,[n,ww,ap],dark('#5b6068',.08)); fillPoly(buf,[ww,s,ap],light('#5b6068',.1)); fillPoly(buf,[s,e,ap],dark('#5b6068',.02));
    } },
  { id: 'antorcha', totalH: 38, draw: (buf, P) => {
      const wd = '#5a3a22', wdD = '#3c2614';
      miniPrism(buf, P, 0.2, 0, 3, '#7c7468', '#544e44', '#7c7468');     // base de piedra
      lineP(buf, P(0,0,3), P(0,0,26), wd); lineP(buf,[P(0,0,3)[0]+1,P(0,0,3)[1]],[P(0,0,26)[0]+1,P(0,0,26)[1]], wdD); // poste
      // pebetero de hierro
      miniPrism(buf, P, 0.18, 26, 30, '#3a3a40', '#222228', '#2e2e34');
      flame(buf, P, 30); flame(buf, (gx,gy,z)=>P(gx+0.06,gy,z), 31);
    } },
  { id: 'brasero', totalH: 24, draw: (buf, P) => {
      const br = '#7a5a3a', brD = '#4e3a24', brL = '#9a7a52';
      [[-0.18,0.18],[0.18,0.18],[0.18,-0.18]].forEach(([gx,gy]) => lineP(buf, P(gx,gy,0), P(gx*0.6,gy*0.6,6), brD)); // patas
      // cuenco
      const c = P(0,0,6);
      fillEllipse(buf, c[0], c[1]+1, 8, 4, brD);
      fillEllipse(buf, c[0], c[1], 8, 4, br);
      fillEllipse(buf, c[0], c[1]-1, 6.4, 3.2, brL);
      fillEllipse(buf, c[0], c[1]-1, 5, 2.4, '#3a2418');                 // hueco con brasas
      // brasas + llama
      fillEllipse(buf, c[0], c[1]-1, 4, 1.8, '#c8401a');
      flame(buf, P, 7);
    } },
  { id: 'ding', totalH: 26, draw: (buf, P) => {
      const bz = '#4a6a52', bzD = '#2e4636', bzL = '#6a8a6e', pat = '#7aa888'; // bronce con pátina
      [[-0.2,0.2],[0.2,0.2],[0.2,-0.2]].forEach(([gx,gy]) => { lineP(buf, P(gx,gy,0), P(gx,gy,7), bzD); lineP(buf,[P(gx,gy,0)[0]+1,P(gx,gy,0)[1]],[P(gx,gy,7)[0]+1,P(gx,gy,7)[1]], bz); }); // 3 patas
      miniPrism(buf, P, 0.3, 7, 15, bzL, bzD, bz);                       // cuerpo
      lineP(buf, P(-0.3,0.3,11), P(0.3,0.3,11), pat); lineP(buf, P(0.3,0.3,11), P(0.3,-0.3,11), pat); // friso de pátina
      // dos asas (orejas) sobre el borde
      lineP(buf, P(-0.32,-0.1,15), P(-0.32,-0.1,18), bz); lineP(buf, P(-0.1,-0.32,15), P(-0.1,-0.32,18), bz);
      fillEllipse(buf, P(0,0,15)[0], P(0,0,15)[1], 5, 2.4, bzD);         // boca
    } },
  { id: 'estandarte', totalH: 44, draw: (buf, P) => {
      const pole = '#6a5030', poleD = '#46341e', cloth = '#b83018', clothD = '#8a2010', clothL = '#d04828';
      miniPrism(buf, P, 0.16, 0, 4, '#7c7468', '#544e44', '#7c7468');    // base
      lineP(buf, P(0,0,4), P(0,0,38), pole); lineP(buf,[P(0,0,4)[0]+1,P(0,0,4)[1]],[P(0,0,38)[0]+1,P(0,0,38)[1]], poleD); // asta
      // punta de lanza dorada
      const tip = P(0,0,38); fillPoly(buf,[[tip[0],tip[1]-5],[tip[0]-2,tip[1]],[tip[0]+2,tip[1]]],'#d0a84a');
      // pendón vertical colgando del lado +x
      const x = P(0,0,36)[0], y0 = P(0,0,36)[1];
      fillPoly(buf, [[x,y0],[x+13,y0+1],[x+13,y0+22],[x,y0+20]], cloth);
      fillPoly(buf, [[x,y0],[x+4,y0+0.5],[x+4,y0+20.5],[x,y0+20]], clothL);
      lineP(buf, [x+13,y0+1], [x+13,y0+22], clothD);
      fillEllipse(buf, x+7, y0+11, 2.4, 2.4, '#d8b850');                 // emblema dorado
    } },
  { id: 'pabellon-te', totalH: 36, draw: (buf, P) => {
      const red='#9c3c22', redD='#6a2614', tile='#5b6068', postH=13;
      miniPrism(buf, P, 0.42, 0, 3, '#a39c8d', '#6a655a', '#857c6e');    // plataforma
      // 4 columnas rojas
      [[-0.34,-0.34],[0.34,-0.34],[0.34,0.34],[-0.34,0.34]].forEach(([dx,dy])=>{ const a=P(dx,dy,3), b=P(dx,dy,3+postH);
        lineP(buf,a,b,red); lineP(buf,[a[0]+1,a[1]],[b[0]+1,b[1]],red); lineP(buf,[a[0]-1,a[1]],[b[0]-1,b[1]],redD); });
      // barandilla baja en las dos caras frontales
      [[[-0.34,0.34],[0.34,0.34]],[[0.34,0.34],[0.34,-0.34]]].forEach(([p,q])=>{ const za=3+postH*0.34;
        lineP(buf,P(p[0],p[1],za),P(q[0],q[1],za),redD); });
      // tejado piramidal de teja con aleros levantados + pináculo
      const z=3+postH, ap=P(0,0,z+12);
      const n=P(-0.52,-0.52,z),e=P(0.52,-0.52,z),s=P(0.52,0.52,z),wv=P(-0.52,0.52,z);
      fillPoly(buf,[n,e,ap],dark(tile,.26)); fillPoly(buf,[n,wv,ap],dark(tile,.14));
      fillPoly(buf,[wv,s,ap],light(tile,.10)); fillPoly(buf,[s,e,ap],dark(tile,.02));
      [s,wv,e].forEach(p=>fillPoly(buf,[[p[0]-1,p[1]],[p[0]+1,p[1]],[p[0],p[1]-3]],light(tile,.18)));
      lineP(buf,[ap[0],ap[1]],[ap[0],ap[1]-4],'#d0a84a'); fillEllipse(buf,ap[0],ap[1]-5,1.4,1.4,'#e8c24a');
    } }
];

// ── Decoración TEMÁTICA de los edificios de clase (校場/太學/官署) ──────────
// Se dibuja DENTRO del lienzo del edificio, en el PATIO frontal (sobre el suelo,
// z=0), tras el cuerpo+tejado. Respeta la cara de la puerta: rot0 puerta +x
// (frente este), rot1 puerta +y (frente sur); en las "traseras" (door=null) se
// coloca en el frente sur, que igualmente da a cámara. Anclado en coords de
// huella → cuadra con la rotación. Helpers globales: fillPoly/lineP/fillEllipse.
function frontInfo(ctx) {
  const { w, h, door } = ctx;
  if (door === 'x') return { face: 'E', flanks: [[w - 1, 0], [w - 1, h - 1]], out: [0.55, 0], cx: w - 1, cy: (h - 1) / 2 };
  return { face: 'S', flanks: [[0, h - 1], [w - 1, h - 1]], out: [0, 0.55], cx: (w - 1) / 2, cy: h - 1 };  // 'y' y null
}
// Prisma pequeño en (gx,gy) con radio r entre z0..z1.
function pcube(buf, P, gx, gy, r, z0, z1, cT, cL, cR) {
  fillPoly(buf, [P(gx - r, gy + r, z0), P(gx + r, gy + r, z0), P(gx + r, gy + r, z1), P(gx - r, gy + r, z1)], cL);
  fillPoly(buf, [P(gx + r, gy + r, z0), P(gx + r, gy - r, z0), P(gx + r, gy - r, z1), P(gx + r, gy + r, z1)], cR);
  fillPoly(buf, [P(gx - r, gy - r, z1), P(gx + r, gy - r, z1), P(gx + r, gy + r, z1), P(gx - r, gy + r, z1)], cT);
}
// Estandarte de guerra (asta + pendón rojo colgante + punta dorada).
function warBanner(buf, P, gx, gy, topZ) {
  const pole = '#6a5030', poleD = '#46341e', cloth = '#b2261b', clothD = '#7e1810', clothL = '#d0473a';
  lineP(buf, P(gx, gy, 0), P(gx, gy, topZ), pole);
  lineP(buf, [P(gx, gy, 0)[0] + 1, P(gx, gy, 0)[1]], [P(gx, gy, topZ)[0] + 1, P(gx, gy, topZ)[1]], poleD);
  const tip = P(gx, gy, topZ); fillPoly(buf, [[tip[0], tip[1] - 5], [tip[0] - 2, tip[1]], [tip[0] + 2, tip[1]]], '#d0a84a');
  const a = P(gx, gy, topZ - 3), x = a[0], y0 = a[1];
  fillPoly(buf, [[x, y0], [x + 11, y0 + 1], [x + 11, y0 + 19], [x, y0 + 18]], cloth);
  fillPoly(buf, [[x, y0], [x + 3, y0 + 0.4], [x + 3, y0 + 18.4], [x, y0 + 18]], clothL);
  lineP(buf, [x + 11, y0 + 1], [x + 11, y0 + 19], clothD);
  fillEllipse(buf, x + 6, y0 + 9, 2, 2, '#d8b850');
}
// Panoplia: caballete de madera con lanzas y un escudo (兵器架).
function weaponRack(buf, P, gx, gy, face) {
  const wd = '#6a4a2a', wdD = '#46301a', steel = '#cbd0d6', shield = '#3a6a8a', shieldR = '#c0392b';
  const along = face === 'E' ? ([d, z]) => P(gx, gy + d, z) : ([d, z]) => P(gx + d, gy, z);  // el caballete corre por la cara
  lineP(buf, along([-0.34, 0]), along([0, 6.5]), wdD); lineP(buf, along([0.34, 0]), along([0, 6.5]), wd);  // patas en A
  lineP(buf, along([-0.28, 4]), along([0.28, 4]), wd);                                                      // travesaño
  [-0.26, -0.09, 0.08, 0.25].forEach(d => { const b = along([d * 0.5 + 0.1, 12]); lineP(buf, along([d, 0]), b, wd);
    fillPoly(buf, [[b[0], b[1] - 4], [b[0] - 1.3, b[1]], [b[0] + 1.3, b[1]]], steel); });                   // lanzas
  const sc = along([0, 3.2]); fillEllipse(buf, sc[0], sc[1], 2.6, 3, shield); fillEllipse(buf, sc[0], sc[1], 1.3, 1.6, shieldR);
}
// Estela de piedra inscrita (石碑): pedestal + losa con panel de inscripción.
function stele(buf, P, gx, gy, topZ) {
  const st = '#aaa59b', stL = '#c8c3b7', stD = '#747064', ink = '#3a3e38';
  pcube(buf, P, gx, gy, 0.24, 0, 2.4, stL, stD, st);                // pedestal ancho
  pcube(buf, P, gx, gy, 0.13, 2.4, topZ, stL, stD, st);             // losa
  const a = P(gx + 0.13, gy + 0.13, topZ - 1.6), b = P(gx + 0.13, gy + 0.13, 3.4);  // strip vertical (cara a cámara)
  fillPoly(buf, [[a[0] - 1.5, a[1]], [a[0] + 1.5, a[1]], [b[0] + 1.5, b[1]], [b[0] - 1.5, b[1]]], ink);  // panel inscrito
  for (let k = 0; k < 4; k++) px(buf, Math.round(a[0]), Math.round(a[1] + (b[1] - a[1]) * (k + 1) / 5), hexToRgb(stL), 210);
  const cap = P(gx, gy, topZ); fillEllipse(buf, cap[0], cap[1] - 0.4, 2, 1.2, stL);                       // remate redondeado
}
// Tambor de audiencia sobre caballete en X (鼓): cilindro rojo con tachones.
function audienceDrum(buf, P, gx, gy) {
  const wd = '#7a4a2a', wdD = '#4e2e18', red = '#b42a1c', hide = '#ead8b0';
  lineP(buf, P(gx - 0.26, gy, 0), P(gx + 0.16, gy, 7), wdD);        // caballete en X
  lineP(buf, P(gx + 0.26, gy, 0), P(gx - 0.16, gy, 7), wd);
  lineP(buf, P(gx - 0.22, gy, 0), P(gx + 0.22, gy, 0), wdD);        // travesaño de pie
  const c = P(gx, gy, 8.5);                                         // tambor apoyado en la X
  fillEllipse(buf, c[0], c[1], 4.2, 4.4, '#8a1f14');               // sombra/canto
  fillEllipse(buf, c[0] - 0.5, c[1] - 0.5, 3.6, 3.8, red);          // cuerpo
  fillEllipse(buf, c[0] - 1.2, c[1] - 1.2, 2, 2.2, '#cf4030');      // brillo
  for (let k = 0; k < 8; k++) { const an = k / 8 * 6.2832; px(buf, Math.round(c[0] + Math.cos(an) * 3.2), Math.round(c[1] + Math.sin(an) * 3.4), hexToRgb('#e8c24a'), 255); }
  fillEllipse(buf, c[0] + 2.5, c[1], 1.1, 3.1, hide);              // parche lateral del parche
  lineP(buf, P(gx, gy, 12.7), P(gx, gy, 14.5), wdD); fillEllipse(buf, P(gx, gy, 15)[0], P(gx, gy, 15)[1], 1, 1, '#d8b24a'); // remate
}
// Placa horizontal sobre la puerta (匾額): tablero oscuro con marco dorado.
function plaque(buf, P, ctx, color) {
  const fi = frontInfo(ctx), z0 = ctx.baseH + ctx.bodyH * 0.62, z1 = z0 + 2.6, dark2 = '#2a1c12', gold = '#d8b24a';
  const pts = fi.face === 'E'
    ? [P(ctx.w - 1, fi.cy - 0.5, z0), P(ctx.w - 1, fi.cy + 0.5, z0), P(ctx.w - 1, fi.cy + 0.5, z1), P(ctx.w - 1, fi.cy - 0.5, z1)]
    : [P(fi.cx - 0.5, ctx.h - 1, z0), P(fi.cx + 0.5, ctx.h - 1, z0), P(fi.cx + 0.5, ctx.h - 1, z1), P(fi.cx - 0.5, ctx.h - 1, z1)];
  fillPoly(buf, pts, color || dark2);
  lineP(buf, pts[0], pts[1], gold); lineP(buf, pts[2], pts[3], gold);
  const mid = [(pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2 - 1.3];
  for (let k = -1; k <= 1; k++) px(buf, Math.round(mid[0] + k * 3), Math.round(mid[1]), hexToRgb(gold), 230);
}
// ── Mercado (市): mercader, mostrador con género, toldo a rayas y banderola ──
// Un mercader de pie (túnica azul clara, faja ocre, gorro 幘) mirando al frente.
// Grande y con buen contraste para que se lea bien "el mercader dentro".
function merchant(buf, P, gx, gy) {
  const b = P(gx, gy, 0), cx = Math.round(b[0]), cy = Math.round(b[1]);
  const robe = '#3f6e9c', robeD = '#2c4f72', robeL = '#5a89b4', sash = '#d4a83a', skin = '#e2b288', cap = '#241d15', beard = '#3a2c20';
  fillPoly(buf, [[cx - 4, cy], [cx + 4, cy], [cx + 2.8, cy - 12], [cx - 2.8, cy - 12]], robe);          // túnica (más alta)
  fillPoly(buf, [[cx - 4, cy], [cx - 0.8, cy], [cx - 1.6, cy - 12], [cx - 2.8, cy - 12]], robeD);        // sombra izq
  fillPoly(buf, [[cx + 1.5, cy - 12], [cx + 2.8, cy - 12], [cx + 4, cy], [cx + 2.6, cy]], robeL);        // luz der
  fillPoly(buf, [[cx - 2.8, cy - 11.5], [cx - 5.4, cy - 7], [cx - 4, cy - 5.8], [cx - 1.8, cy - 10]], robe);  // manga izq
  fillPoly(buf, [[cx + 2.8, cy - 11.5], [cx + 5.4, cy - 7], [cx + 4, cy - 5.8], [cx + 1.8, cy - 10]], robeD); // manga der
  fillEllipse(buf, cx - 4.8, cy - 6, 1.2, 1.2, skin); fillEllipse(buf, cx + 4.8, cy - 6, 1.2, 1.2, skin);     // manos
  fillPoly(buf, [[cx - 3.3, cy - 6.3], [cx + 3.3, cy - 6.3], [cx + 3.1, cy - 8.4], [cx - 3.1, cy - 8.4]], sash); // faja
  lineP(buf, [cx, cy - 11.8], [cx - 2, cy - 8], robeD); lineP(buf, [cx, cy - 11.8], [cx + 2, cy - 8], robeD);    // cuello cruzado
  fillEllipse(buf, cx, cy - 14.4, 2.5, 2.9, skin);                                                       // cabeza
  fillEllipse(buf, cx, cy - 12.4, 1.6, 1.4, beard);                                                       // barba
  fillEllipse(buf, cx, cy - 16.2, 2.7, 1.8, cap);                                                         // gorro 幘
  fillPoly(buf, [[cx - 2.7, cy - 16.2], [cx + 2.7, cy - 16.2], [cx + 2.4, cy - 14.6], [cx - 2.4, cy - 14.6]], cap);
  px(buf, cx - 1, cy - 14.3, hexToRgb('#2a1c12'), 255); px(buf, cx + 1, cy - 14.3, hexToRgb('#2a1c12'), 255);   // ojos
}
// Mostrador de madera con género: rollos de tela, ánfora y cesto de fruta.
function marketStall(buf, P, gx, gy) {
  const wd = '#7a5430', wdL = '#9a7044', wdD = '#4e351c';
  pcube(buf, P, gx, gy, 0.46, 0, 4.4, wdL, wdD, wd);
  const t = P(gx, gy, 4.6);
  [['#b23b2e', -4], ['#caa23a', -1], ['#3a6ea5', 2]].forEach(([c, dx]) => {   // rollos de tela
    fillEllipse(buf, t[0] + dx, t[1] - 1.4, 1.5, 1.0, dark(c, .1));
    fillEllipse(buf, t[0] + dx, t[1] - 2.2, 1.5, 0.7, light(c, .22));
  });
  fillEllipse(buf, t[0] + 5.2, t[1] - 1.5, 1.7, 2.4, '#5a4530'); fillEllipse(buf, t[0] + 5.2, t[1] - 3.1, 0.9, 0.7, '#3a2c1c');   // ánfora
  fillEllipse(buf, t[0] - 6.6, t[1] - 0.6, 2.1, 1.3, '#8a6a3a');                                                                 // cesto
  [-0.8, 0, 0.8].forEach(d => fillEllipse(buf, t[0] - 6.6 + d * 1.9, t[1] - 1.7, 0.85, 0.75, '#c43a2a'));                        // fruta
}
// Asta con banderola larga de mercado (市招/酒旗): crema con borde rojo.
function marketFlag(buf, P, gx, gy, topZ) {
  const pole = '#6a5030', poleD = '#46341e';
  lineP(buf, P(gx, gy, 0), P(gx, gy, topZ), pole);
  lineP(buf, [P(gx, gy, 0)[0] + 1, P(gx, gy, 0)[1]], [P(gx, gy, topZ)[0] + 1, P(gx, gy, topZ)[1]], poleD);
  const a = P(gx, gy, topZ - 1), x = a[0], y0 = a[1], cloth = '#e3d4a6', clothD = '#c8b888', edge = '#b23b2e';
  fillPoly(buf, [[x, y0], [x + 9, y0 + 1.5], [x + 9, y0 + 26], [x, y0 + 24]], cloth);
  fillPoly(buf, [[x, y0], [x + 2.6, y0 + 0.5], [x + 2.6, y0 + 24], [x, y0 + 24]], clothD);
  lineP(buf, [x + 9, y0 + 1.5], [x + 9, y0 + 26], edge); lineP(buf, [x, y0 + 24], [x + 9, y0 + 26], edge);
  for (let k = 0; k < 3; k++) px(buf, Math.round(x + 4.6), Math.round(y0 + 7 + k * 5), hexToRgb('#7a1f16'), 230);   // 市 sugerido
}
// Toldo a rayas volado sobre la fachada del frente (corre por la cara, sin tapar
// al mercader: cuelga por encima de su cabeza).
function marketAwning(buf, P, fi, ctx) {
  const along = fi.face === 'E';
  const u0 = -0.15, u1 = (along ? (ctx.h - 1) : (ctx.w - 1)) + 0.15;
  const fixed = along ? (ctx.w - 1) : (ctx.h - 1), out = 0.95;
  const zTop = ctx.baseH + ctx.bodyH + 1, zFront = zTop - 5;
  const pt = (u, o, z) => along ? P(fixed + o, u, z) : P(u, fixed + o, z);
  const stripeA = '#c8693a', stripeB = '#e8c9a0', n = 6;
  for (let i = 0; i < n; i++) {
    const a = u0 + (u1 - u0) * i / n, b = u0 + (u1 - u0) * (i + 1) / n;
    fillPoly(buf, [pt(a, 0, zTop), pt(b, 0, zTop), pt(b, out, zFront), pt(a, out, zFront)], i % 2 ? stripeA : stripeB);
  }
  lineP(buf, pt(u0, out, zFront), pt(u1, out, zFront), '#5a3320');
  [u0 + 0.12, u1 - 0.12].forEach(u => lineP(buf, pt(u, out, 0), pt(u, out, zFront), '#6a4a2a'));   // postes
}

// ── Casa de mecenas (宅): cortina de puerta, tinaja de agua y farolillo rojo ──
function doorCurtain(buf, P, fi, ctx) {
  const z1 = ctx.baseH + ctx.bodyH * 0.5, z0 = ctx.baseH * 0.2;
  const indigo = '#46506e', indigoD = '#343c54', cream = '#d8cba8';
  const on = (u, z) => fi.face === 'E' ? P(ctx.w - 1, fi.cy + u, z) : P(fi.cx + u, ctx.h - 1, z);
  for (let i = 0; i < 5; i++) { const u0 = -0.32 + i * 0.135, u1 = u0 + 0.115;
    fillPoly(buf, [on(u0, z0), on(u1, z0), on(u1, z1), on(u0, z1)], i % 2 ? indigo : indigoD); }
  fillPoly(buf, [on(-0.36, z1), on(0.36, z1), on(0.36, z1 + 1.7), on(-0.36, z1 + 1.7)], cream);   // cenefa superior
}
function waterVat(buf, P, gx, gy) {
  const c = P(gx, gy, 0);
  fillEllipse(buf, c[0], c[1] - 3.4, 3.2, 3.8, '#4a5560');
  fillEllipse(buf, c[0] - 1, c[1] - 4.4, 1.1, 1.5, '#5d6a76');
  fillEllipse(buf, c[0], c[1] - 6.6, 2.6, 1.3, '#39424c');
  fillEllipse(buf, c[0], c[1] - 6.8, 1.9, 0.9, '#22282e');
}
function redLantern(buf, P, gx, gy, topZ) {
  lineP(buf, P(gx, gy, topZ), P(gx, gy, topZ - 3), '#3a2a18');
  const c = P(gx, gy, topZ - 6);
  fillEllipse(buf, c[0], c[1], 2.6, 3.2, '#b42a1c');
  fillEllipse(buf, c[0] - 0.8, c[1] - 0.9, 1.0, 1.4, '#d8503a');
  lineP(buf, [c[0] - 2.4, c[1]], [c[0] + 2.4, c[1]], '#7e1810');
  fillEllipse(buf, c[0], c[1] - 3.2, 1.3, 0.6, '#7e1810'); fillEllipse(buf, c[0], c[1] + 3.2, 1.3, 0.6, '#7e1810');
  fillPoly(buf, [[c[0] - 1, c[1] + 3.4], [c[0] + 1, c[1] + 3.4], [c[0] + 0.6, c[1] + 5], [c[0] - 0.6, c[1] + 5]], '#caa23a');   // borla
}

const DECOR_HALL = {
  // 宅: cortina de puerta + tinaja de agua + farolillo rojo → se lee como hogar.
  casa: (buf, P, ctx) => {
    const fi = frontInfo(ctx);
    doorCurtain(buf, P, fi, ctx);
    waterVat(buf, P, fi.flanks[0][0] + fi.out[0] * 0.7, fi.flanks[0][1] + fi.out[1] * 0.7);
    redLantern(buf, P, fi.flanks[1][0] + fi.out[0] * 0.55, fi.flanks[1][1] + fi.out[1] * 0.55, ctx.baseH + ctx.bodyH - 1);
  },
  // 市: toldo a rayas + mostrador con género a un lado + mercader centrado +
  // banderola de mercado. El mercader se pinta el ÚLTIMO → siempre visible.
  market: (buf, P, ctx) => {
    const fi = frontInfo(ctx);
    // banderola en un flanco, mostrador en el otro (ambos asomando al frente)
    marketFlag(buf, P, fi.flanks[1][0] + fi.out[0] * 1.1, fi.flanks[1][1] + fi.out[1] * 1.1, ctx.baseH + ctx.bodyH + 8);
    marketStall(buf, P, fi.flanks[0][0] + fi.out[0] * 1.0, fi.flanks[0][1] + fi.out[1] * 1.0);
    marketAwning(buf, P, fi, ctx);                                            // toldo encima del frente
    // El MERCADER ya no se hornea aquí: lo dibuja hac-folk como personaje real
    // (mismo estilo que los mecenas) parado al frente del mercado.
  },
  // 校場: estandartes de guerra flanqueando + panoplia de armas en el frente.
  instruccion: (buf, P, ctx) => {
    const fi = frontInfo(ctx);
    fi.flanks.forEach(([gx, gy]) => warBanner(buf, P, gx + fi.out[0], gy + fi.out[1], ctx.baseH + ctx.bodyH + 4));
    weaponRack(buf, P, fi.cx + fi.out[0] * 0.7, fi.cy + fi.out[1] * 0.7, fi.face);
  },
  // 太學: estelas de piedra inscritas flanqueando + placa sobre la puerta.
  academia: (buf, P, ctx) => {
    const fi = frontInfo(ctx);
    fi.flanks.forEach(([gx, gy]) => stele(buf, P, gx + fi.out[0], gy + fi.out[1], ctx.baseH + 10));
    plaque(buf, P, ctx, '#1f3a2a');
  },
  // 官署: tambores de audiencia flanqueando + placa sobre la puerta.
  cancilleria: (buf, P, ctx) => {
    const fi = frontInfo(ctx);
    fi.flanks.forEach(([gx, gy]) => audienceDrum(buf, P, gx + fi.out[0], gy + fi.out[1]));
    plaque(buf, P, ctx, '#1d2c44');
  },
};

// ── Jardines ───────────────────────────────────────────────────────────────
// Tiles PLANOS (sin tejado): suelo/agua que llena toda la huella + vegetación
// isométrica encima (loto, bambú, flores, piedras, puente, pabellón, sauce).
const GPAL = {
  grass:'#3f5a2c', grassD:'#2c4420',
  water:'#214a5e', waterLt:'#2f6a80', waterDk:'#163643',
  pad:'#2f6a34', padLt:'#3f8040',
  lotusP:'#e07090', lotusW:'#e8e0cc', lotusC:'#ffd890',
  wood:'#7a6038', woodLt:'#8a7048', woodDk:'#54401f',
  stone:'#6a665a', stoneLt:'#83806f',
  bamboo:'#4f7a32', bambooLf:'#5f9038',
  trunk:'#5a3a22', willow:'#4f6a28', willowDk:'#3f5620',
  soil:'#34281c'
};
function drawGarden(cfg){
  const { w, h, kind } = cfg;
  const ov = 0.5;                  // llega al borde de la huella completa
  const rimH = 3;                  // grosor del borde/orilla
  const head = 27;                 // hueco arriba para bambú/pabellón/sauce
  const W = Math.ceil((w + h - 2 + 4*ov) * TW/2) + 6;
  const OX = Math.round((h - 1 + 2*ov) * TW/2) + 3;
  const OY = rimH + head + 2;
  const H = OY + Math.ceil((w + h - 2 + 2*ov) * TH/2) + Math.ceil(TH/2) + 8;
  const buf = makeBuf(W,H);
  const P = (gx,gy,gz)=>[OX+(gx-gy)*TW/2, OY+(gx+gy)*TH/2 - gz];
  const R = rng((cfg.seed||1)*2654435761);
  const isWater = (kind==='water' || kind==='lake');
  const z = rimH;

  // ── Suelo: el AGUA va sobre ribera de CÉSPED (piedras alrededor); los demás
  // jardines llevan bordillo de piedra. ──
  const curb='#867d6f';
  const topBase = isWater ? GPAL.grass : curb;        // ribera de césped para el agua
  // El jardín de flores es una cama de mantillo VERDOSO (no marrón pelado).
  const ground  = isWater ? GPAL.grass : (kind==='flowers' ? mix(GPAL.soil,GPAL.grass,.5) : GPAL.grass);
  const sTex = isWater ? txGrass : txStone;
  const N=[-ov,-ov], E=[w-1+ov,-ov], S=[w-1+ov,h-1+ov], Wc=[-ov,h-1+ov];
  const Tp=p=>P(p[0],p[1],z), B=p=>P(p[0],p[1],0);
  fillPolyFn(buf,[B(Wc),B(S),Tp(S),Tp(Wc)], sTex(dark(topBase,.34)));   // canto/terraplén
  fillPolyFn(buf,[B(S),B(E),Tp(E),Tp(S)],   sTex(dark(topBase,.48)));
  fillPolyFn(buf,[Tp(N),Tp(E),Tp(S),Tp(Wc)], sTex(topBase));
  lineP(buf,Tp(S),Tp(Wc),dark(topBase,.5)); lineP(buf,Tp(E),Tp(S),dark(topBase,.5));
  lineP(buf,Tp(N),Tp(E),light(topBase,.12)); lineP(buf,Tp(N),Tp(Wc),light(topBase,.12));
  const cu=0.34;
  const iN=P(-ov+cu,-ov+cu,z), iE=P(w-1+ov-cu,-ov+cu,z), iS=P(w-1+ov-cu,h-1+ov-cu,z), iW=P(-ov+cu,h-1+ov-cu,z);
  // Suelo de césped/mantillo con textura verde (no plano); piedra solo para agua-curb.
  if (isWater || kind==='grass' || kind==='flowers' || kind==='bonsai') fillPolyFn(buf,[iN,iE,iS,iW], txGrass(ground));
  else fillPoly(buf,[iN,iE,iS,iW], ground);
  lineP(buf,iS,iW,dark(ground,.5)); lineP(buf,iE,iS,dark(ground,.5));
  lineP(buf,iN,iE,dark(topBase,.55)); lineP(buf,iN,iW,dark(topBase,.55));

  // ── Helpers de decoración (en coordenadas de rejilla) ──
  const pt=(gx,gy)=>P(gx,gy,z);
  // Hoja de nenúfar PEQUEÑA y proporcionada (con muesca en V).
  function pad(gx,gy,r){const c=pt(gx,gy), rw=r*TW/2, rh=r*TH/2;
    fillEllipse(buf,c[0],c[1], rw, rh, GPAL.pad);
    fillEllipse(buf,c[0],c[1]-rh*0.25, rw*0.58, rh*0.58, GPAL.padLt);
    fillPoly(buf,[[c[0],c[1]],[c[0]+rw*1.06,c[1]-rh*0.5],[c[0]+rw*1.06,c[1]+rh*0.5]], GPAL.water);}
  // Flor de loto de 6 pétalos, pequeña.
  function lotus(gx,gy,col){const c=pt(gx,gy), cy0=c[1]-1.5; col=col||GPAL.lotusP;
    for(let a=0;a<6;a++){const t=a/6*6.2832; fillEllipse(buf,c[0]+Math.cos(t)*2.1,cy0+Math.sin(t)*1.15,1.5,1.0,dark(col,.05));}
    fillEllipse(buf,c[0],cy0,1.9,1.2,col); fillEllipse(buf,c[0],cy0,1.0,0.7,light(col,.28));
    px(buf,Math.round(c[0]),Math.round(cy0),hexToRgb(GPAL.lotusC),255);}
  function nenufar(gx,gy){const c=pt(gx,gy);
    fillEllipse(buf,c[0],c[1], 4,2.3, GPAL.pad);
    fillEllipse(buf,c[0],c[1]-0.6, 2.1,1.3, GPAL.lotusW);
    px(buf,Math.round(c[0]),Math.round(c[1]-0.6),hexToRgb(GPAL.lotusC),255);}
  function flower(gx,gy,col){const c=pt(gx,gy);
    fillEllipse(buf,c[0],c[1]-1, 3.4,2.6, col);
    fillEllipse(buf,c[0],c[1]-1, 1.5,1.2, light(col,.4));}
  // Mata de follaje verde (hojas) para las camas de flores.
  function bush(gx,gy){const c=pt(gx,gy);
    fillEllipse(buf,c[0],c[1], 7,3.8, '#2c5222');
    fillEllipse(buf,c[0]-2.5,c[1]-1.5, 4.5,2.6, '#3a6a2c');
    fillEllipse(buf,c[0]+3,c[1]-0.6, 3.6,2.1, '#33602a');
    fillEllipse(buf,c[0]-0.5,c[1]-2.4, 2.6,1.6, '#467e34');}
  function stone(gx,gy,s){const c=pt(gx,gy);
    fillEllipse(buf,c[0],c[1], s, s*0.62, GPAL.stone);
    fillEllipse(buf,c[0]-s*0.3,c[1]-s*0.25, s*0.5, s*0.32, GPAL.stoneLt);}
  function fish(gx,gy){const c=pt(gx,gy);
    fillEllipse(buf,c[0],c[1], 3.4,1.5, '#d8801a');
    fillPoly(buf,[[c[0]-2.6,c[1]],[c[0]-4.6,c[1]-1.4],[c[0]-4.6,c[1]+1.4]], '#e8a838');  // cola
    px(buf,Math.round(c[0]+1.8),Math.round(c[1]-0.4),hexToRgb('#2a1810'),255);}          // ojo
  // Charca de contorno ORGÁNICO (no un círculo): orilla mojada, profundidad,
  // reflejo y ondas. El contorno ondula el radio según el ángulo.
  function pool(){
    const c=P(cx,cy,z), halfW=(iE[0]-iW[0])/2, halfH=(iS[1]-iN[1])/2, rx=halfW*0.70, ry=halfH*0.70, n=34;
    const mud=mix('#4e4330',GPAL.water,.4);
    const blob=(s)=>{ const a0=[]; for(let i=0;i<n;i++){ const a=i/n*6.2832;
      const wob=1+0.10*Math.sin(a*3+1.3)+0.055*Math.sin(a*5+0.6)+0.04*Math.sin(a*2-0.4);
      a0.push([c[0]+Math.cos(a)*rx*s*wob, c[1]+Math.sin(a)*ry*s*wob]); } return a0; };
    fillPoly(buf, blob(1.12), mud);                                            // orilla húmeda (barro)
    fillPoly(buf, blob(1.0), GPAL.water);                                       // agua
    fillEllipse(buf,c[0],c[1]+ry*0.10, rx*0.62, ry*0.60, dark(GPAL.water,.13)); // zona profunda
    fillEllipse(buf,c[0]-rx*0.24,c[1]-ry*0.30, rx*0.36, ry*0.24, GPAL.waterLt); // reflejo
    for(let i=0;i<9;i++){const t=0.22+R()*0.55, a=R()*6.2832, ex=Math.cos(a)*rx*t, ey=Math.sin(a)*ry*t;
      lineP(buf,[c[0]+ex-2,c[1]+ey],[c[0]+ex+2,c[1]+ey], light(GPAL.water,.16));}  // ondas
    return {c,rx,ry};
  }
  // Ribera: rocas en el BORDE del agua + matas de hierba en el césped. Se colocan
  // por ángulo y factor de radio sobre la charca P0={c,rx,ry} (f≈1 = orilla).
  function bank(P0, rocks, tufts){
    rocks.forEach(([a,f,s])=>{ const x=P0.c[0]+Math.cos(a)*P0.rx*f, y=P0.c[1]+Math.sin(a)*P0.ry*f;
      fillEllipse(buf,x,y+1, s, s*0.58, dark(GPAL.stone,.32));
      fillEllipse(buf,x,y,   s, s*0.62, GPAL.stone);
      fillEllipse(buf,x-s*0.3,y-s*0.28, s*0.5, s*0.3, GPAL.stoneLt); });
    tufts.forEach(([a,f])=>{ const x=P0.c[0]+Math.cos(a)*P0.rx*f, y=P0.c[1]+Math.sin(a)*P0.ry*f;
      for(let i=-1;i<=1;i++) lineP(buf,[x+i*1.6,y],[x+i*2.2,y-5], i?GPAL.bamboo:GPAL.bambooLf); }); }
  // Puente ISOMÉTRICO arqueado: el tablero sigue el suelo (gx,gy) y el arco va
  // en ALTURA (z); postes verticales + pasamanos. Apoya en ambas orillas.
  function bridge(gx0,gx1,gyc){
    const steps=12, dw=0.34, archH=5, rail=5;
    const dp=(t,dy)=>{ const gx=gx0+(gx1-gx0)*t, zz=z+Math.sin(t*Math.PI)*archH; return P(gx,gyc+dy,zz); };
    // sombra del puente sobre el agua
    for(let i=0;i<steps;i++){const t0=i/steps,t1=(i+1)/steps;
      fillPoly(buf,[pt(gx0+(gx1-gx0)*t0,gyc-dw),pt(gx0+(gx1-gx0)*t1,gyc-dw),pt(gx0+(gx1-gx0)*t1,gyc+dw),pt(gx0+(gx1-gx0)*t0,gyc+dw)], dark(GPAL.water,.12));}
    // tablero (tablones alternos) + junta
    for(let i=0;i<steps;i++){const t0=i/steps,t1=(i+1)/steps;
      fillPoly(buf,[dp(t0,-dw),dp(t1,-dw),dp(t1,dw),dp(t0,dw)], i%2?GPAL.wood:GPAL.woodLt);
      lineP(buf,dp(t1,-dw),dp(t1,dw),GPAL.woodDk);}
    // barandillas a ambos lados (postes + pasamanos)
    for(const dy of [-dw,dw]){ let prevTop=null;
      for(let i=0;i<=steps;i++){const t=i/steps, base=dp(t,dy), top=[base[0],base[1]-rail];
        if(i%2===0) lineP(buf,base,top,GPAL.woodDk);
        if(prevTop) lineP(buf,prevTop,top,GPAL.woodLt);
        prevTop=top;} }
  }
  function tuft(gx,gy){const c=pt(gx,gy);
    for(let i=-1;i<=1;i++)lineP(buf,[c[0]+i*1.6,c[1]],[c[0]+i*2.4,c[1]-4],GPAL.bambooLf);}
  function bamboo(gx,gy,ht){const b=pt(gx,gy);
    for(let i=-1;i<=1;i++){const x=b[0]+i*2.4;
      lineP(buf,[x,b[1]],[x+i*1.4,b[1]-ht],i?GPAL.bamboo:GPAL.bambooLf);
      for(let k=1;k<=3;k++)lineP(buf,[x-1,b[1]-ht*k/4],[x+1,b[1]-ht*k/4],GPAL.willowDk);}
    fillEllipse(buf,b[0]-2,b[1]-ht, 6,2.6, GPAL.bambooLf);
    fillEllipse(buf,b[0]+4,b[1]-ht+4, 5,2.2, GPAL.bamboo);}
  function willow(gx,gy){const b=pt(gx,gy);
    lineP(buf,b,[b[0],b[1]-15],GPAL.trunk); lineP(buf,[b[0]+1,b[1]],[b[0]+1,b[1]-15],GPAL.trunk);
    // copa en capas (más frondosa)
    fillEllipse(buf,b[0],b[1]-19, 12,6, GPAL.willowDk);
    fillEllipse(buf,b[0]-3,b[1]-21, 8,4.5, GPAL.willow);
    fillEllipse(buf,b[0]+5,b[1]-19, 7,4, GPAL.willow);
    // cortinas colgantes finas y curvadas (no llegan al suelo)
    for(let i=-5;i<=5;i++){const x=b[0]+i*2.1, ln=5+((i+5)%3)*2;
      lineP(buf,[x,b[1]-17],[x+(i>0?1.5:-1.5),b[1]-17+ln],GPAL.willowDk);}}
  function tree(gx,gy){const b=pt(gx,gy);
    lineP(buf,b,[b[0],b[1]-12],GPAL.trunk); lineP(buf,[b[0]+1,b[1]],[b[0]+1,b[1]-12],GPAL.trunk);
    fillEllipse(buf,b[0],b[1]-14, 9,5, '#3a5a26');
    [[-4,-15],[4,-16],[0,-19],[-2,-13],[5,-13]].forEach(([dx,dy])=>fillEllipse(buf,b[0]+dx,b[1]+dy,3,2.4,'#e8a0b8'));}
  function plank(g0,g1){const a=P(g0[0],g0[1],z+2), b=P(g1[0],g1[1],z+2);
    lineP(buf,[a[0],a[1]+1],[b[0],b[1]+1],GPAL.woodDk);
    lineP(buf,a,b,GPAL.wood); lineP(buf,[a[0],a[1]-1],[b[0],b[1]-1],GPAL.woodLt);
    lineP(buf,[a[0],a[1]-2],[b[0],b[1]-2],GPAL.wood);}
  function pavilion(gx,gy){const postH=11, s=0.42;
    [[-s,-s],[s,-s],[s,s],[-s,s]].forEach(([dx,dy])=>
      lineP(buf,P(gx+dx,gy+dy,z),P(gx+dx,gy+dy,z+postH),GPAL.trunk));
    const apex=P(gx,gy,z+postH+10), roof='#5b6068';
    const rn=P(gx-0.6,gy-0.6,z+postH),re=P(gx+0.6,gy-0.6,z+postH),
          rs=P(gx+0.6,gy+0.6,z+postH),rw=P(gx-0.6,gy+0.6,z+postH);
    fillPoly(buf,[rn,re,apex],dark(roof,.30));
    fillPoly(buf,[rn,rw,apex],dark(roof,.18));
    fillPoly(buf,[rw,rs,apex],light(roof,.10));
    fillPoly(buf,[rs,re,apex],dark(roof,.06));
    lineP(buf,rw,rs,light(roof,.3)); lineP(buf,rs,re,light(roof,.3));}

  // ── Composición por tipo (de atrás hacia delante) ──
  const cx=(w-1)/2, cy=(h-1)/2;
  if (kind==='bonsai') {
    // estrado con dos macetas de árbol enano (poda en nube)
    const pot='#7a3a22', potD='#522414', soil='#3a2a18', foliage='#3a6a30', foliageL='#4f8a3e';
    const macetas = [[cx-0.18, cy-0.14], [cx+0.2, cy+0.16]];
    macetas.forEach(([gx,gy],i)=>{
      const b=pt(gx,gy);
      // maceta troncocónica
      fillPoly(buf,[[b[0]-4,b[1]-2],[b[0]+4,b[1]-2],[b[0]+3,b[1]+2],[b[0]-3,b[1]+2]],pot);
      lineP(buf,[b[0]-4,b[1]-2],[b[0]+4,b[1]-2],potD);
      fillEllipse(buf,b[0],b[1]-2,3.4,1.4,soil);
      // tronco retorcido + copas en nube
      lineP(buf,[b[0],b[1]-2],[b[0]-1,b[1]-9-i*2],'#5a3a22');
      lineP(buf,[b[0]-1,b[1]-6],[b[0]+3,b[1]-8],'#5a3a22');
      fillEllipse(buf,b[0]-1,b[1]-10-i*2,4,2.4,foliage); fillEllipse(buf,b[0]-1,b[1]-11-i*2,2.6,1.6,foliageL);
      fillEllipse(buf,b[0]+4,b[1]-8,3,2,foliage); fillEllipse(buf,b[0]+4,b[1]-9,1.8,1.2,foliageL);
    });
    stone(cx+0.12, cy-0.22, 2.4);
  } else if (kind==='grass') {
    // jardín VERDE: matas de follaje, sendero de pasaderas, rocas, bambú y briznas
    for(let i=0;i<3;i++) bush(0.6+R()*(w-1.2), 0.6+R()*(h-1.2));
    // pasaderas pequeñas (no tapan el césped) por el eje largo
    const longH = h>=w, n = longH?h:w;
    for(let k=0;k<n;k++){const gx=longH?cx:k, gy=longH?k:cy; const c=pt(gx,gy);
      fillEllipse(buf,c[0],c[1], 5,2.8, '#7c7258'); fillEllipse(buf,c[0]-1,c[1]-0.5, 3,1.6, '#8c8268');}
    stone(0.2,0.2,5); stone(w-1.2,h-1.2,4.5); stone(w-1.3,0.4,3.4);
    bamboo(0,h-1,16); bamboo(w-1,0,13);
    for(let i=0;i<7;i++) tuft(R()*(w-1), R()*(h-1));
  } else if (kind==='flowers') {
    // cama VERDE: follaje (matas) por todo el parterre y flores encima + ciruelo
    const cols=['#c84068','#e0683a','#d8a830','#b85088','#e85060'];
    // 1) follaje verde de fondo (de atrás hacia delante)
    for(let gy=0; gy<h; gy++) for(let gx=0; gx<w; gx++){
      if(gx===w-1 && gy===0) continue;                 // hueco para el árbol
      bush(gx+(R()-0.5)*0.5, gy+(R()-0.5)*0.5);
    }
    // 2) flores sobre el follaje
    for(let gy=0; gy<h; gy++) for(let gx=0; gx<w; gx++){
      if(gx===w-1 && gy===0) continue;
      const jx=gx+(R()-0.5)*0.5, jy=gy+(R()-0.5)*0.5;
      flower(jx,jy,cols[Math.floor(R()*cols.length)%cols.length]);
      if(R()>0.45) flower(jx+0.25,jy+0.2,cols[Math.floor(R()*cols.length)]);
    }
    // 3) ciruelo en flor + bambú + briznas
    tree(w-1,0); bamboo(0,h-1,15);
    for(let i=0;i<4;i++) tuft(R()*(w-1), R()*(h-1));
  } else if (kind==='water') {
    // estanque en un claro de césped: ribera con rocas y matas + charca
    const P0=pool();
    bank(P0, [[2.5,1.0,3.4],[1.5,1.02,3.8],[0.6,1.0,3.0],[3.5,1.02,3.2],[4.5,1.0,2.6]],
         [[2.1,1.22],[1.0,1.24],[3.1,1.2],[0.2,1.22],[4.0,1.2]]);
    pad(cx-0.45,cy-0.05,0.46);  lotus(cx-0.45,cy-0.15,GPAL.lotusP);
    pad(cx+0.35,cy+0.25,0.48);  lotus(cx+0.35,cy+0.15,'#f08aa0');
    pad(cx+0.05,cy-0.4,0.4);    nenufar(cx-0.55,cy+0.4);
    fish(cx+0.45,cy-0.05); fish(cx-0.15,cy+0.45);
  } else if (kind==='lake') {
    // lago palaciego en jardín: sauce, ribera con rocas/matas, charca, puente y pabellón
    willow(0,0);                               // árbol en la orilla (detrás)
    const P0=pool();
    bank(P0, [[2.6,1.0,4.4],[1.7,1.02,4.0],[0.9,1.0,3.6],[0.3,1.03,3.2],[3.6,1.02,3.8],[4.5,1.0,3.0],[5.4,1.0,2.8]],
         [[2.3,1.2],[1.3,1.24],[0.6,1.22],[3.2,1.2],[4.1,1.22],[5.0,1.2]]);
    // loto en la mitad delantera, contenido en el agua
    pad(cx-0.7,cy+0.3,0.5);  lotus(cx-0.7,cy+0.2,GPAL.lotusP);
    pad(cx-0.1,cy+0.65,0.44); lotus(cx-0.1,cy+0.55,'#f08aa0');
    pad(cx+0.55,cy+0.45,0.48); lotus(cx+0.55,cy+0.35,GPAL.lotusP);
    nenufar(cx-0.9,cy+0.05); nenufar(cx+0.3,cy+0.8);
    fish(cx-0.3,cy+0.55); fish(cx+0.85,cy+0.15);
    bridge(-ov+cu+0.05, w-1+ov-cu-0.05, cy-0.6);   // puente que apoya en ambas orillas
    pavilion(w-1,0);                               // pabellón sobre el agua (esquina)
  }

  return { buf, ox: OX, oy: OY };
}

// ── Estructuras iso autónomas (muro pantalla, puerta floral) ─────────────
// Lienzo iso + prisma reutilizable (el prism de drawBuilding es interno).
function isoBuf(w,h,totalH){ const ovR=0.34;
  const W=Math.ceil((w+h-2+4*ovR)*TW/2)+6, OX=Math.round((h-1+2*ovR)*TW/2)+3, OY=Math.round(totalH)+2;
  const H=OY+Math.ceil((w+h-2+2*ovR)*TH/2)+Math.ceil(TH/2)+4;
  return { buf:makeBuf(W,H), P:(gx,gy,z)=>[OX+(gx-gy)*TW/2, OY+(gx+gy)*TH/2-z], OX, OY };
}
function isoPrism(buf,P,x0,y0,x1,y1,z0,z1,cTop,cL,cR,tex){
  const TX=tex==='wood'?txWoodV:tex==='stone'?txStone:null, f=(pts,col)=>TX?fillPolyFn(buf,pts,TX(col)):fillPoly(buf,pts,col);
  const B=(a,b)=>P(a,b,z0), T=(a,b)=>P(a,b,z1);
  f([B(x0,y1),B(x1,y1),T(x1,y1),T(x0,y1)],cL);   // cara sur (+y)
  f([B(x1,y1),B(x1,y0),T(x1,y0),T(x1,y1)],cR);   // cara este (+x)
  f([T(x0,y0),T(x1,y0),T(x1,y1),T(x0,y1)],cTop); // tapa
}
// Tejadito a cuatro aguas (cumbrera a lo largo del eje LARGO) sobre [0..w-1,0..h-1].
function isoHip(buf,P,w,h,rz,rh,tile){
  const ov=0.4, long=h>=w;
  const NW=P(-ov,-ov,rz),NE=P(w-1+ov,-ov,rz),SE=P(w-1+ov,h-1+ov,rz),SW=P(-ov,h-1+ov,rz);
  if(long){ const cxm=(w-1)/2, r0=P(cxm,-ov+0.4,rz+rh), r1=P(cxm,h-1+ov-0.4,rz+rh);
    fillPoly(buf,[NW,NE,r1,r0],dark(tile,.30)); fillPoly(buf,[NW,SW,r0],dark(tile,.16));
    fillPoly(buf,[NE,SE,r1],dark(tile,.04)); fillPoly(buf,[SW,SE,r1,r0],light(tile,.10));
    lineP(buf,r0,r1,dark(tile,.42)); lineP(buf,[r0[0],r0[1]-1],[r1[0],r1[1]-1],light(tile,.3));
  } else { const cym=(h-1)/2, r0=P(-ov+0.4,cym,rz+rh), r1=P(w-1+ov-0.4,cym,rz+rh);
    fillPoly(buf,[NW,SW,r1,r0],dark(tile,.30)); fillPoly(buf,[NW,NE,r0],dark(tile,.16));
    fillPoly(buf,[SW,SE,r1],dark(tile,.04)); fillPoly(buf,[NE,SE,r1,r0],light(tile,.10));
    lineP(buf,r0,r1,dark(tile,.42)); lineP(buf,[r0[0],r0[1]-1],[r1[0],r1[1]-1],light(tile,.3)); }
}
// Muro de los Espíritus (影壁): plinto + muro de ladrillo con panel + tejadillo.
function drawScreen(cfg){
  const {w,h}=cfg, baseH=4, bodyH=15, brick='#9a6a4a', tile='#5b6068';
  const {buf,P,OX,OY}=isoBuf(w,h, baseH+bodyH+9+8);
  isoPrism(buf,P,-0.28,-0.28,w-1+0.28,h-1+0.28, 0, baseH, PAL.stoneT, dark(PAL.stone,.06), PAL.stone,'stone');
  const z=baseH;
  isoPrism(buf,P,0,0,w-1,h-1, z, z+bodyH, light(brick,.05), dark(brick,.20), dark(brick,.07),'stone');
  const panel=(face,fix,a,b)=>{ const p0=z+3,p1=z+bodyH-2.5, pt2=(u,zz)=>face==='E'?P(fix,u,zz):P(u,fix,zz), mc=pt2((a+b)/2,(p0+p1)/2);
    fillPoly(buf,[pt2(a,p0),pt2(b,p0),pt2(b,p1),pt2(a,p1)], dark(brick,.34));
    fillPoly(buf,[pt2(a+0.16,p0+1),pt2(b-0.16,p0+1),pt2(b-0.16,p1-1),pt2(a+0.16,p1-1)], '#cdbd9a');
    fillEllipse(buf,mc[0],mc[1],4.5,5.5,'#8a3326'); fillEllipse(buf,mc[0],mc[1],2.6,3.4,'#c2563a'); fillEllipse(buf,mc[0],mc[1],1.2,1.8,'#e8b84a'); };
  if(h>=w) panel('E', w-1, 0.2, h-1-0.2); else panel('S', h-1, 0.2, w-1-0.2);
  isoPrism(buf,P,-0.14,-0.14,w-1+0.14,h-1+0.14, z+bodyH, z+bodyH+3, light(tile,.1), dark(tile,.16), dark(tile,.04));
  isoHip(buf,P,w,h, z+bodyH+3, 5, tile);
  return { buf, ox:OX, oy:OY };
}
// Puerta Floral (垂花門): dos pilares con cabeza de flor colgante + tejado ornado.
function drawGateArch(cfg){
  const {w,h}=cfg, postH=16, red='#9c3c22', redD='#6a2614', tile='#5b6068', wood='#6a4a2a';
  const {buf,P,OX,OY}=isoBuf(w,h, postH+16);
  const long=h>=w, ends = long ? [[0,0],[0,h-1]] : [[0,0],[w-1,0]];
  ends.forEach(([gx,gy])=>{
    isoPrism(buf,P,gx-0.22,gy-0.22,gx+0.22,gy+0.22, 0, 3, PAL.stoneT, dark(PAL.stone,.06), PAL.stone,'stone');
    isoPrism(buf,P,gx-0.16,gy-0.16,gx+0.16,gy+0.16, 3, postH, light(red,.05), redD, dark(red,.12));
    const c=P(gx,gy,postH); fillEllipse(buf,c[0],c[1]+2,3,2,'#caa84a'); fillEllipse(buf,c[0],c[1]+4.5,2,1.5,red); // 垂花
  });
  // dintel + friso entre pilares
  if(long){ isoPrism(buf,P,-0.1,-0.1,0.1,h-1+0.1, postH, postH+2.5, light(wood,.08), dark(wood,.2), dark(wood,.34));
    fillPoly(buf,[P(0.1,0,postH+0.4),P(0.1,h-1,postH+0.4),P(0.1,h-1,postH+2.2),P(0.1,0,postH+2.2)], mix('#3a8472','#000',.05)); }
  else { isoPrism(buf,P,-0.1,-0.1,w-1+0.1,0.1, postH, postH+2.5, light(wood,.08), dark(wood,.2), dark(wood,.34));
    fillPoly(buf,[P(0,0.1,postH+0.4),P(w-1,0.1,postH+0.4),P(w-1,0.1,postH+2.2),P(0,0.1,postH+2.2)], mix('#3a8472','#000',.05)); }
  isoHip(buf,P,w,h, postH+2.5, 9, tile);
  return { buf, ox:OX, oy:OY };
}
// Pieza 1×1 de MURO INTERIOR (orient 'x'/'y') o PORTÓN (gate=true), cohesionados.
function drawWallPiece(cfg){
  const orient=cfg.orient, gate=cfg.gate;
  const wallH=16, iwt=0.34, brick='#8a8070', tile=mix('#5b6068','#000',.02), red='#9c3c22', redD='#6a2614';
  const { buf, P, OX, OY } = isoBuf(1, 1, wallH + (gate ? 17 : 8));
  const aX = orient === 'x';
  const a = aX ? -0.5 : -iwt/2, c = aX ? 0.5 : iwt/2, b = aX ? -iwt/2 : -0.5, d = aX ? iwt/2 : 0.5;
  // cuerpo del muro (sillería)
  isoPrism(buf, P, a, b, c, d, 0, wallH, light(brick,.10), dark(brick,.20), dark(brick,.32), 'stone');
  if (gate) {
    // SOLO el vano (hueco oscuro recesado). Las HOJAS se dibujan dinámicamente en
    // la capa de animación (hac-folk) para que se abran/cierren al pasar un mecenas
    // sin tener que repintar el fondo. dz debe coincidir con GATE_DZ en hac-folk.
    const dz = wallH*0.66;
    if (aX) {
      fillPoly(buf,[P(-0.30,d,0),P(0.30,d,0),P(0.30,d,dz+0.4),P(-0.30,d,dz+0.4)], '#16100a');
      fillPoly(buf,[P(-0.26,d,0),P(0.26,d,0),P(0.26,d,dz),P(-0.26,d,dz)], '#241812');   // umbral/fondo del paso
    } else {
      fillPoly(buf,[P(c,-0.30,0),P(c,0.30,0),P(c,0.30,dz+0.4),P(c,-0.30,dz+0.4)], '#16100a');
      fillPoly(buf,[P(c,-0.26,0),P(c,0.26,0),P(c,0.26,dz),P(c,-0.26,dz)], '#241812');
    }
    // columnas rojas + tejadito a cuatro aguas (gatehouse)
    isoPrism(buf, P, a-.06, b-.06, c+.06, d+.06, wallH, wallH+3, light(tile,.1), dark(tile,.16), dark(tile,.04));
    isoHip(buf, P, 1, 1, wallH+3, 9, tile);
  } else {
    // coronación de teja + remate del muro
    isoPrism(buf, P, a-.1, b-.1, c+.1, d+.1, wallH, wallH+3, light(tile,.12), dark(tile,.16), dark(tile,.04));
    if (aX) lineP(buf, P(a,d,wallH+3), P(c,d,wallH+3), light(tile,.3));
    else    lineP(buf, P(c,b,wallH+3), P(c,d,wallH+3), light(tile,.3));
  }
  return { buf, ox: OX, oy: OY };
}

// Tile de suelo (rombo de hierba) con variante.
function drawTile(hex){
  const W=TW+2,H=TH+4,buf=makeBuf(W,H),OX=W/2,OY=2;
  const top=[OX,OY],right=[OX+TW/2,OY+TH/2],bot=[OX,OY+TH],left=[OX-TW/2,OY+TH/2];
  // costado (grosor) para dar volumen al césped
  fillPoly(buf,[left,bot,[bot[0],bot[1]+2],[left[0],left[1]+2]],dark(hex,.35));
  fillPoly(buf,[bot,right,[right[0],right[1]+2],[bot[0],bot[1]+2]],dark(hex,.5));
  fillPoly(buf,[top,right,bot,left],hex);
  lineP(buf,top,right,dark(hex,.18));lineP(buf,top,left,dark(hex,.18));
  return {buf,ox:OX,oy:OY};
}

// ── Generar ──────────────────────────────────────────────────────────────
fs.mkdirSync(IMG_DIR,{recursive:true});
const meta = {};
const _all = [];
// ox/oy se almacenan en píxeles de DISPOSITIVO (×S), igual que el tamaño del buf.
function save(id, r){ writePng(path.join(IMG_DIR, `${id}.png`), r.buf); meta[id]={ox:r.ox*S,oy:r.oy*S,w:r.buf.W,h:r.buf.H}; _all.push({id,buf:r.buf}); console.log(id, r.buf.W+'x'+r.buf.H); }

// Hoja de contactos ampliada para revisión (PREVIEW=<ruta> node tools/gen-iso-sprites.js)
function contactSheet(file){
  const S=4, pad=10, bg=[20,16,10];
  const items=_all.filter(a=>a.id.startsWith('bld-'));
  const maxH=Math.max(...items.map(a=>a.buf.H));
  const W=items.reduce((s,a)=>s+a.buf.W+pad,pad), H=maxH+2*pad;
  const out=makeBuf(W*S,H*S);
  for(let i=0;i<out.W*out.H;i++){const j=i*4;out.data[j]=bg[0];out.data[j+1]=bg[1];out.data[j+2]=bg[2];out.data[j+3]=255;}
  let x=pad;
  for(const a of items){
    const oy=pad+(maxH-a.buf.H);
    for(let y=0;y<a.buf.H;y++)for(let xx=0;xx<a.buf.W;xx++){
      const si=(y*a.buf.W+xx)*4, al=a.buf.data[si+3]; if(!al)continue;
      for(let dy=0;dy<S;dy++)for(let dx=0;dx<S;dx++){
        const X=(x+xx)*S+dx, Y=(oy+y)*S+dy, di=(Y*out.W+X)*4;
        out.data[di]=a.buf.data[si];out.data[di+1]=a.buf.data[si+1];out.data[di+2]=a.buf.data[si+2];out.data[di+3]=255;
      }
    }
    x+=a.buf.W+pad;
  }
  writePng(file,out); console.log('preview →',file);
}

// 4 rotaciones por edificio (rotación COMPLETA). La huella es [w,h] en rot
// pares y [h,w] en impares (coincide con HacBuild.footprintDe). La puerta gira
// por las 4 caras: rot0 +x (derecha, visible), rot1 +y (abajo, visible),
// rot2 -x (izquierda) y rot3 -y (arriba) caen en las caras TRASERAS → el
// edificio queda "de espaldas" (sin puerta visible, ventanas en ambas caras).
EDIFICIOS.forEach(e=>{
  const variants = [
    { w:e.w, h:e.h, door:'x'  },  // rot 0: puerta a la derecha (+x)
    { w:e.h, h:e.w, door:'y'  },  // rot 1: puerta abajo (+y)
    { w:e.w, h:e.h, door:null },  // rot 2: puerta a la izquierda (-x, de espaldas)
    { w:e.h, h:e.w, door:null }   // rot 3: puerta arriba (-y, de espaldas)
  ];
  variants.forEach((v,r)=>{
    const cfg = { ...e, ...v };
    if (e.stairs) {
      save('bld-'+e.id+'-'+r, drawBuilding(cfg, 'body'));
      save('bld-'+e.id+'-base-'+r, drawBuilding(cfg, 'base'));
    } else {
      save('bld-'+e.id+'-'+r, drawBuilding(cfg, 'all'));
    }
  });
});

// Compuestos (L/U/anillo): rota las alas por las 4 orientaciones y hornea.
COMPUESTOS.forEach(e=>{
  for (let r=0;r<4;r++){
    const bw = r%2 ? e.h : e.w, bh = r%2 ? e.w : e.h;
    const wings = e.wings.map(wg=>{
      const a=rotCell(wg.x0,wg.y0,e.w,e.h,r), b=rotCell(wg.x1,wg.y1,e.w,e.h,r);
      return { x0:Math.min(a[0],b[0]), y0:Math.min(a[1],b[1]), x1:Math.max(a[0],b[0]), y1:Math.max(a[1],b[1]),
               door: doorParam(rotDoorDir(wg.door,r)) };
    });
    save('bld-'+e.id+'-'+r, drawBuilding({ ...e, w:bw, h:bh, wings }));
  }
});

// Jardines: planos, sin puerta. Las rotaciones impares intercambian w/h
// (igual que la huella en HacBuild.footprintDe); la vegetación se recoloca sola.
const JARDINES = [
  { id:'bonsai',        w:1, h:1, kind:'bonsai',  seed:7  },
  { id:'jardin',        w:2, h:3, kind:'grass',   seed:11 },
  { id:'jardin-flores', w:2, h:4, kind:'flowers', seed:23 },
  { id:'estanque',      w:3, h:3, kind:'water',   seed:31 },
  { id:'lago',          w:4, h:4, kind:'lake',    seed:41 }
];
JARDINES.forEach(e=>{
  const variants = [ {w:e.w,h:e.h}, {w:e.h,h:e.w}, {w:e.w,h:e.h}, {w:e.h,h:e.w} ];
  variants.forEach((v,r)=> save('bld-'+e.id+'-'+r, drawGarden({ ...e, ...v, seed:(e.seed||1)+r })));
});

// Decoración 1×1 (mismo sprite para las 4 rotaciones: son simétricas).
DECOR.forEach(d=>{
  const r0 = drawDecor(d);
  for (let r = 0; r < 4; r++) save('bld-' + d.id + '-' + r, r0);
});

// Estructuras lineales (muro de espíritus, puerta floral): 4 rotaciones (w/h).
const SCREENS = [
  { id:'yingbi',     w:1, h:3, fn:drawScreen },
  { id:'chuihuamen', w:1, h:2, fn:drawGateArch }
];
SCREENS.forEach(e=>{
  const variants = [ {w:e.w,h:e.h}, {w:e.h,h:e.w}, {w:e.w,h:e.h}, {w:e.h,h:e.w} ];
  variants.forEach((v,r)=> save('bld-'+e.id+'-'+r, e.fn({ ...e, ...v })));
});

// Muro interior y portón (1×1): rot 0/2 = a lo largo de x, rot 1/3 = a lo largo de y.
[['muralla', false], ['porton', true]].forEach(([id, gate]) => {
  const sx = drawWallPiece({ orient: 'x', gate }), sy = drawWallPiece({ orient: 'y', gate });
  save('bld-' + id + '-0', sx); save('bld-' + id + '-1', sy);
  save('bld-' + id + '-2', sx); save('bld-' + id + '-3', sy);
});

save('tile-grass',  drawTile('#3a5a2c'));
save('tile-grass2', drawTile('#33512a'));

const metaJs = '/* Generado por tools/gen-iso-sprites.js — NO editar a mano. */\n' +
  'window.ISO_SPRITES_META = ' + JSON.stringify(meta, null, 0) + ';\n';
fs.writeFileSync(META_FILE, metaJs);
console.log('meta →', META_FILE);

if (process.env.PREVIEW) contactSheet(process.env.PREVIEW);
