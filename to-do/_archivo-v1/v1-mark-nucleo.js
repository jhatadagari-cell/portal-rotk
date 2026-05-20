// Script de un solo uso: marca con `v1: true` las fichas (CHARS) y batallas
// (BATTLES) del núcleo v1.0 en assets/js/data.js. Idempotente: si ya está
// marcado, no inyecta de nuevo.
const fs = require('fs');
const path = 'assets/js/data.js';
const src = fs.readFileSync(path, 'utf8');

const NUCLEO_CHARS = new Set([
  // rank-1 (13)
  'Cao Cao','Liu Bei','Sun Quan','Zhuge Liang','Guan Yu','Lü Bu','Zhou Yu',
  'Sima Yi','Zhang Jiao','Dong Zhuo','Sun Jian','Sun Ce','Cao Pi',
  // rank-2 (48)
  'Zhao Yun','Zhang Fei','Diao Chan','Yuan Shao','Xun Yu','Guo Jia','Pang Tong',
  'Huang Gai','Zhang Zhao','Lu Su','Lü Meng','Ma Chao','Huang Zhong','Lu Xun',
  'Zhang Liao','Xiahou Dun','Wei Yan','Meng Huo','Jiang Wei','Deng Ai',
  'Sima Zhao','Cao Rui','Huangfu Song','Wang Yun','Jia Xu','Lady Bian',
  'Sun Shangxiang','Da Qiao','Xiao Qiao','Liu Shan','Sima Shi','Sima Yan',
  'Chen Gong','Tian Feng','Xu You','Li Ru','Han Xiandi','Xun You','Fa Zheng',
  'Yang Hu','Sun Hao','Zhen Ji','Cao Mao','Cao Shuang','Jia Chong','Cao Huan',
  'Lu Kang','Du Yu',
]);

const NUCLEO_BATTLES = new Set([
  'huang-jin','si-shui-hu-lao','wan','xiapi','guandu','changban','chi-bi',
  'jiangling','tong-pass','hefei','dingjunshan','mai-cheng','yiling','jieting',
  'wuzhang',
]);

// Parser de profundidad para saber si estamos dentro de CHARS o BATTLES.
const lines = src.split('\n');
let context = null; // 'CHARS' | 'BATTLES' | null
let depth = 0;      // profundidad del array actual (1 = dentro del array top)
const out = [];

let injectedChars = 0, injectedBattles = 0, alreadyMarked = 0;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  out.push(line);

  // Detectar inicio de array top-level
  if (/^const CHARS\s*=\s*\[/.test(line)) { context = 'CHARS'; depth = 1; continue; }
  if (/^const BATTLES\s*=\s*\[/.test(line)) { context = 'BATTLES'; depth = 1; continue; }
  if (/^const PERIODS\s*=\s*\[/.test(line) || /^const FAQS\s*=\s*\[/.test(line)) {
    context = null; depth = 0; continue;
  }

  if (context && depth === 1) {
    // Identificar `en: "X",` (CHARS) o `id: "Y",` (BATTLES) en una entrada
    // del array de profundidad 1 (es decir, dentro del objeto de un personaje
    // o batalla, no dentro de un array anidado como `eras` o `participants`).
    if (context === 'CHARS') {
      const m = line.match(/^(\s+)en:\s*"([^"]+)"/);
      if (m && NUCLEO_CHARS.has(m[2])) {
        // Comprobar que las próximas líneas no incluyan ya `v1:`
        let next = i+1;
        let already = false;
        while (next < lines.length && !/^\s*\},?\s*$/.test(lines[next])) {
          if (/^\s*v1:\s*/.test(lines[next])) { already = true; break; }
          next++;
        }
        if (!already) {
          out.push(`${m[1]}v1: true,`);
          injectedChars++;
        } else {
          alreadyMarked++;
        }
      }
    } else if (context === 'BATTLES') {
      const m = line.match(/^(\s+)id:\s*"([^"]+)"/);
      if (m && NUCLEO_BATTLES.has(m[2])) {
        let next = i+1;
        let already = false;
        while (next < lines.length && !/^\s*\},?\s*$/.test(lines[next])) {
          if (/^\s*v1:\s*/.test(lines[next])) { already = true; break; }
          next++;
        }
        if (!already) {
          out.push(`${m[1]}v1: true,`);
          injectedBattles++;
        } else {
          alreadyMarked++;
        }
      }
    }
  }
}

fs.writeFileSync(path, out.join('\n'));

// Verificar
delete require.cache[require.resolve('../' + path)];
const ctx = {};
new Function('ctx', out.join('\n') + '\nctx.CHARS=CHARS;ctx.BATTLES=BATTLES;')(ctx);
const charsV1 = ctx.CHARS.filter(c => c.v1).length;
const battlesV1 = ctx.BATTLES.filter(b => b.v1).length;

console.log(`Inyectados: ${injectedChars} fichas + ${injectedBattles} batallas. Ya marcadas: ${alreadyMarked}.`);
console.log(`Verificación tras leer el archivo: CHARS con v1=true → ${charsV1}/${ctx.CHARS.length}.`);
console.log(`                                  BATTLES con v1=true → ${battlesV1}/${ctx.BATTLES.length}.`);

// Reportar fichas/batallas SIN v1 para confirmar que coinciden con apéndice esperado
const sinV1Chars = ctx.CHARS.filter(c => !c.v1).map(c => c.en);
const sinV1Battles = ctx.BATTLES.filter(b => !b.v1).map(b => b.id);
console.log(`\nFichas FUERA del núcleo (${sinV1Chars.length}): ${sinV1Chars.join(', ')}`);
console.log(`\nBatallas FUERA del núcleo (${sinV1Battles.length}): ${sinV1Battles.join(', ')}`);
