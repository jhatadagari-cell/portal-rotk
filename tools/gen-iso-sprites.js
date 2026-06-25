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

// ── Raster RGBA (fondo transparente) ─────────────────────────────────────
function makeBuf(W,H){ return { W, H, data:new Uint8Array(W*H*4) }; }
function px(buf,x,y,rgb,a){ x|=0;y|=0; if(x<0||y<0||x>=buf.W||y>=buf.H)return; const i=(y*buf.W+x)*4; buf.data[i]=rgb[0];buf.data[i+1]=rgb[1];buf.data[i+2]=rgb[2];buf.data[i+3]=a==null?255:a; }
function fillPoly(buf,pts,hex){
  const rgb=hexToRgb(hex);
  let minY=Infinity,maxY=-Infinity;
  pts.forEach(p=>{minY=Math.min(minY,p[1]);maxY=Math.max(maxY,p[1]);});
  minY=Math.max(0,Math.floor(minY));maxY=Math.min(buf.H-1,Math.ceil(maxY));
  for(let y=minY;y<=maxY;y++){
    const xs=[];
    for(let i=0;i<pts.length;i++){const a=pts[i],b=pts[(i+1)%pts.length];
      if((a[1]<=y&&b[1]>y)||(b[1]<=y&&a[1]>y)){const t=(y-a[1])/(b[1]-a[1]);xs.push(a[0]+t*(b[0]-a[0]));}}
    xs.sort((p,q)=>p-q);
    for(let k=0;k+1<xs.length;k+=2){const x0=Math.max(0,Math.round(xs[k])),x1=Math.min(buf.W-1,Math.round(xs[k+1])-1);
      for(let x=x0;x<=x1;x++)px(buf,x,y,rgb,255);}
  }
}
function lineP(buf,a,b,hex){
  const rgb=hexToRgb(hex);
  let x0=Math.round(a[0]),y0=Math.round(a[1]),x1=Math.round(b[0]),y1=Math.round(b[1]);
  const dx=Math.abs(x1-x0),dy=Math.abs(y1-y0),sx=x0<x1?1:-1,sy=y0<y1?1:-1;let err=dx-dy;
  for(;;){px(buf,x0,y0,rgb,255);if(x0===x1&&y0===y1)break;const e2=2*err;if(e2>-dy){err-=dy;x0+=sx;}if(e2<dx){err+=dx;y0+=sy;}}
}

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
  wallL:'#6a4c2c', wall:'#553c22', wallD:'#3c2a18',
  beam:'#79532e', beamD:'#4f3620',
  stoneT:'#9a9183', stone:'#7c7468', stoneD:'#544e44',
  door:'#241a12'
};

// ── Dibujo de un edificio ────────────────────────────────────────────────
// cfg: { w, h, roof, baseH, bodyH, roofH, stories, bodyH2, roofH2 }
function drawBuilding(cfg) {
  const { w, h, roof } = cfg;
  const baseH = cfg.baseH ?? 5;
  const bodyH = cfg.bodyH ?? 14;
  const roofH = cfg.roofH ?? 13;
  const ovB = 0.22, ovR = 0.3;     // voladizos de base y alero

  const totalH = baseH + bodyH + roofH + (cfg.stories ? cfg.bodyH2 + cfg.roofH2 + 3 : 0) + 6;
  const W = Math.ceil((w + h - 2 + 4 * ovR) * TW / 2) + 6;
  const OX = Math.round((h - 1 + 2 * ovR) * TW / 2) + 3;
  const OY = Math.round(totalH) + 2;
  const H = OY + Math.ceil((w + h - 2 + 2 * ovR) * TH / 2) + Math.ceil(TH / 2) + 4;
  const buf = makeBuf(W, H);

  const P = (gx, gy, gz) => [OX + (gx - gy) * TW / 2, OY + (gx + gy) * TH / 2 - gz];

  // Prisma con bounds float [x0,y0]..[x1,y1] y voladizo `ov`, entre z0 y z1.
  function prism(x0, y0, x1, y1, ov, z0, z1, cTop, cL, cR, edge) {
    const N=[x0-ov,y0-ov], E=[x1+ov,y0-ov], S=[x1+ov,y1+ov], Wc=[x0-ov,y1+ov];
    const T=p=>P(p[0],p[1],z1), B=p=>P(p[0],p[1],z0);
    fillPoly(buf,[B(Wc),B(S),T(S),T(Wc)],cL);
    fillPoly(buf,[B(S),B(E),T(E),T(S)],cR);
    fillPoly(buf,[T(N),T(E),T(S),T(Wc)],cTop);
    if(edge){lineP(buf,T(S),T(Wc),edge);lineP(buf,T(E),T(S),edge);}
  }

  // Tejado a 4 aguas con alero volado, fascia, limatesas, cursos de teja y
  // aleros levantados.
  function hipRoof(x0, y0, x1, y1, zEave, rh, c) {
    const roofL=light(c,.18), roofR=dark(c,.06), roofBack=dark(c,.32);
    const eave=light(c,.36), ridge=dark(c,.40), fascia=dark(c,.55);
    const courseL=dark(c,.10), courseR=dark(c,.22);   // líneas de teja
    const lerp=(a,b,t)=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
    const dx=x1-x0, dy=y1-y0;
    const N=P(x0-ovR,y0-ovR,zEave), E=P(x1+ovR,y0-ovR,zEave), S=P(x1+ovR,y1+ovR,zEave), Wc=P(x0-ovR,y1+ovR,zEave);
    const cx=(x0+x1)/2, cy=(y0+y1)/2;
    let r0,r1;
    // Inset de cumbrera: más corto en edificios alargados (caballete largo).
    const insL = (dx>=dy ? (dx>dy?0.12:0.2) : (dy>dx?0.12:0.2));
    if(dx>=dy){ r0=P(x0+insL*dx,cy,zEave+rh); r1=P(x1-insL*dx,cy,zEave+rh); if(dx===0){r0=P(cx,cy,zEave+rh);r1=r0;} }
    else      { r0=P(cx,y0+insL*dy,zEave+rh); r1=P(cx,y1-insL*dy,zEave+rh); }
    // Cursos de teja paralelos al alero sobre un faldón cuadrilátero
    // (borde alero ea-eb abajo, cumbrera ra-rb arriba).
    const courseQuad=(ea,eb,ra,rb,col)=>{ for(const t of [.22,.44,.66,.86]) lineP(buf,lerp(ea,ra,t),lerp(eb,rb,t),col); };
    const courseHip =(ba,bb,ap,col)=>{ for(const t of [.3,.6,.85]) lineP(buf,lerp(ba,ap,t),lerp(bb,ap,t),col); };

    const drop=p=>[p[0],p[1]+2];
    fillPoly(buf,[Wc,S,drop(S),drop(Wc)],fascia);
    fillPoly(buf,[S,E,drop(E),drop(S)],fascia);

    if(dx>=dy){
      fillPoly(buf,[r0,r1,E,N],roofBack);
      fillPoly(buf,[r0,N,Wc],roofBack);
      fillPoly(buf,[r1,E,S],roofR);
      fillPoly(buf,[r0,r1,S,Wc],roofL);
      // cursos sobre faldón sur (grande) e hip este.
      courseQuad(Wc,S,r0,r1,courseL);
      courseHip(E,S,r1,courseR);
      // limatesas (aristas de los hips frontales).
      lineP(buf,r0,Wc,ridge); lineP(buf,r1,S,ridge); lineP(buf,r1,E,ridge);
    } else {
      fillPoly(buf,[r0,r1,S,E],roofR);
      fillPoly(buf,[r0,E,N],roofBack);
      fillPoly(buf,[r1,S,Wc],roofL);
      fillPoly(buf,[r0,r1,Wc,N],roofBack);
      courseQuad(E,S,r0,r1,courseR);
      courseHip(Wc,S,r1,courseL);
      lineP(buf,r0,E,ridge); lineP(buf,r1,S,ridge); lineP(buf,r1,Wc,ridge);
    }
    // Cumbrera engrosada, alero resaltado y aleros levantados.
    lineP(buf,r0,r1,ridge); lineP(buf,[r0[0],r0[1]-1],[r1[0],r1[1]-1],ridge);
    lineP(buf,S,Wc,eave); lineP(buf,E,S,eave);
    [S,Wc,E].forEach(p=>{ fillPoly(buf,[[p[0]-1,p[1]],[p[0]+1,p[1]],[p[0],p[1]-3]],eave); });
  }

  let z = 0;
  prism(0,0,w-1,h-1, ovB, z, z+baseH, PAL.stoneT, dark(PAL.stone,.06), PAL.stone, PAL.stoneD);
  z += baseH;

  // door: 'x' = puerta en la cara +x (derecha/SE); 'y' = cara +y (izq/SW);
  // null = sin puerta (ventanas en ambas caras). La otra cara lleva ventanas.
  function body(x0,y0,x1,y1, zc, bh, door) {
    prism(x0,y0,x1,y1, 0, zc, zc+bh, PAL.wall, PAL.wallD, PAL.wallL, PAL.beamD);
    // Pilares en las aristas frontales.
    [[x1,y1],[x1,y0],[x0,y1]].forEach(([gx,gy])=>{
      lineP(buf,P(gx,gy,zc),P(gx,gy,zc+bh),PAL.beam);
      lineP(buf,[P(gx,gy,zc)[0]+1,P(gx,gy,zc)[1]],[P(gx,gy,zc+bh)[0]+1,P(gx,gy,zc+bh)[1]],PAL.beamD);
    });
    const wy0=Math.round(zc+bh*0.32), wy1=Math.round(zc+bh*0.72), dh=Math.round(bh*0.62);
    // Cara +x (derecha): puerta o ventanas.
    if(door==='x'){
      const gm=(y0+y1)/2;
      fillPoly(buf,[P(x1,gm-0.35,zc),P(x1,gm+0.35,zc),P(x1,gm+0.35,zc+dh),P(x1,gm-0.35,zc+dh)],PAL.door);
    } else {
      for(let gy=y0; gy<y1; gy++)
        fillPoly(buf,[P(x1,gy+0.3,wy0),P(x1,gy+0.7,wy0),P(x1,gy+0.7,wy1),P(x1,gy+0.3,wy1)],dark(PAL.wall,.45));
    }
    // Cara +y (izquierda-frontal): puerta o ventanas.
    if(door==='y'){
      const xm=(x0+x1)/2;
      fillPoly(buf,[P(xm-0.35,y1,zc),P(xm+0.35,y1,zc),P(xm+0.35,y1,zc+dh),P(xm-0.35,y1,zc+dh)],PAL.door);
    } else {
      for(let gx=x0; gx<x1; gx++)
        fillPoly(buf,[P(gx+0.3,y1,wy0),P(gx+0.7,y1,wy0),P(gx+0.7,y1,wy1),P(gx+0.3,y1,wy1)],dark(PAL.wall,.45));
    }
  }

  body(0,0,w-1,h-1, z, bodyH, cfg.door);
  hipRoof(0,0,w-1,h-1, z+bodyH, roofH, roof);

  // Pagoda: segundo cuerpo MÁS PEQUEÑO (inset) y su propio alero (sin puerta).
  if (cfg.stories) {
    const z2 = z + bodyH + roofH - 1;
    const ins = 0.55;
    body(ins, ins, w-1-ins, h-1-ins, z2, cfg.bodyH2, null);
    hipRoof(ins, ins, w-1-ins, h-1-ins, z2+cfg.bodyH2, cfg.roofH2, light(roof,.04));
  }

  return { buf, ox: OX, oy: OY };
}

// ── Catálogo a hornear (espejo de hac-build.js) ──────────────────────────
const EDIFICIOS = [
  { id:'pabellon', w:1, h:2, roof:'#a85a32', bodyH:14, roofH:12 },
  { id:'pagoda',   w:2, h:2, roof:'#b54a2a', bodyH:15, roofH:12, stories:true, bodyH2:12, roofH2:11 },
  { id:'galeria',  w:1, h:3, roof:'#9a6a3a', bodyH:13, roofH:11 },
  { id:'ala',      w:2, h:3, roof:'#aa5530', bodyH:16, roofH:13 },
  { id:'salon',    w:3, h:3, roof:'#c0532a', bodyH:19, roofH:18 }
];

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
function save(id, r){ writePng(path.join(IMG_DIR, `${id}.png`), r.buf); meta[id]={ox:r.ox,oy:r.oy,w:r.buf.W,h:r.buf.H}; _all.push({id,buf:r.buf}); console.log(id, r.buf.W+'x'+r.buf.H); }

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
  variants.forEach((v,r)=> save('bld-'+e.id+'-'+r, drawBuilding({ ...e, ...v })));
});
save('tile-grass',  drawTile('#3a5a2c'));
save('tile-grass2', drawTile('#33512a'));

const metaJs = '/* Generado por tools/gen-iso-sprites.js — NO editar a mano. */\n' +
  'window.ISO_SPRITES_META = ' + JSON.stringify(meta, null, 0) + ';\n';
fs.writeFileSync(META_FILE, metaJs);
console.log('meta →', META_FILE);

if (process.env.PREVIEW) contactSheet(process.env.PREVIEW);
