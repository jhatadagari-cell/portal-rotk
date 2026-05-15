// chronicles.js — fuente de datos de crónicas para el lector de Eras.
// Añadir aquí los entries de cualquier personaje para que aparezcan automáticamente
// en el lector cuando el año del evento coincida con entry.y1.
const CHRONICLES = [
  {
    char: "Cao Cao",
    zh: "曹操",
    fc: "#1e5abf",
    href: "assets/Periods/cao-cao.html",
    entries: [
      { id: "cronica-origenes",    y1: 155, y2: 155, zh: "譙郡曹氏",    n: "El nieto del eunuco"         },
      { id: "cronica-varas",       y1: 174, y2: 174, zh: "五色棒",      n: "Las varas de cinco colores"  },
      { id: "cronica-xu-shao",     y1: 177, y2: 177, zh: "治世能臣",    n: "El juicio de Xu Shao"        },
      { id: "cronica-qiduyu",      y1: 184, y2: 184, zh: "騎都尉",      n: "El Caballero de Yingchuan"   },
      { id: "cronica-jinan",       y1: 185, y2: 188, zh: "濟南相",      n: "El canciller de Jinan"       },
      { id: "cronica-magnicidio",  y1: 189, y2: 189, zh: "刺董卓",      n: "El magnicidio fallido"       },
      { id: "cronica-vino-ciruelas", y1: 200, y2: 200, zh: "煮酒論英雄", n: "El vino y las ciruelas"     },
      { id: "cronica-cartas",      y1: 200, y2: 200, zh: "焚書",        n: "La quema de las cartas"      },
      { id: "cronica-hua-rong",    y1: 208, y2: 208, zh: "華容道",      n: "El paso de Hua Rong"         },
      { id: "cronica-guan-yu",     y1: 219, y2: 219, zh: "厚葬關羽",    n: "El entierro de Guan Yu"      },
    ]
  }
];
