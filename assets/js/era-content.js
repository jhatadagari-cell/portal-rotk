// era-content.js — narrative content (lede, prose, events) for the era detail view
(function augmentPeriods() {
  if (typeof PERIODS === 'undefined') return;
  const C = {
    "han-tardio": {
      lede: "El Gran Imperio Han no colapsa de golpe. Se desangra durante décadas de emperadores que mueren jóvenes y dejan el trono a niños gobernados por eunucos y clanes familiares. El Emperador Ling es el símbolo de esta decadencia: vende cargos oficiales al mejor postor, enriquece a los Diez Eunucos y desatiende las hambrunas que arrasan provincias enteras.",
      prose: [
        "El Han Tardío no colapsa de golpe. Se desangra durante décadas de emperadores que mueren jóvenes y dejan el trono a niños gobernados por eunucos y clanes familiares. El Emperador Ling es el símbolo de esta decadencia: vende cargos oficiales públicamente, enriquece a los Diez Eunucos y desatiende las hambrunas que arrasan provincias enteras.",
        "Figuras como Cao Cao, Liu Bei y Sun Jian dan sus primeros pasos en este escenario. No son aún señores de la guerra: son funcionarios menores, voluntarios o soldados de fortuna que observan cómo el sistema se pudre a su alrededor. La catástrofe está sembrada. Solo falta la chispa.",
      ],
      events: [
        { y: "~168 d.C.", type: "Crisis política", n: "Regencias de los eunucos", d: "La muerte prematura del Emperador Huan deja el trono a un niño. Los Diez Eunucos y los clanes familiares luchan por la regencia, vaciando la autoridad imperial de toda sustancia." },
        { y: "168–189 d.C.", type: "Gobierno", n: "Reinado del Emperador Ling 漢靈帝", d: "El Emp. Ling vende cargos imperiales al mejor postor. Su corte se convierte en un mercado donde la lealtad se cotiza en oro y la meritocracia desaparece por completo." },
        { y: "~175 d.C.", type: "Movimiento religioso", n: "Predicación de Zhang Jue 張角", d: "El taoísta Zhang Jue funda el Camino de la Gran Paz y recorre ocho provincias prometiendo curación y justicia. En menos de diez años agrupa a cientos de miles de seguidores desesperados." },
        { y: "180–183 d.C.", type: "Crisis social", n: "Hambrunas y éxodo campesino", d: "Malas cosechas sucesivas y una presión fiscal insostenible expulsan a millones del campo. Los grandes terratenientes concentran tierra mientras el campesinado se radicaliza y mira a Zhang Jue." },
        { y: "184 d.C.", type: "Umbral", n: "Víspera del Año Jiazi", d: "La red de Zhang Jue planea un alzamiento coordinado en todo el Imperio. Una delación acelera el calendario: el Cielo Amarillo se prepara para sustituir al Cielo Azul. La cuenta atrás ha comenzado." },
      ],
    },
    "turbantes": {
      lede: "Zhang Jue llevaba seis años sembrando promesas de justicia entre los desheredados de China. En 184 d.C. la red se activa simultáneamente en ocho provincias. Medio millón de guerreros con turbantes amarillos proclaman el Año Jiazi. El mayor levantamiento popular que ha visto el Han.",
      prose: [
        "La revuelta fracasa militarmente en meses, pero su impacto es permanente. El Han convoca a todos los señores regionales para aplacar a los Turbantes, y al hacerlo, arma a los mismos hombres que luego lo destruirán. Cao Cao, Liu Bei, Sun Jian: todos labran su primera reputación militar persiguiendo turbantes amarillos.",
        "El Ejército Amarillo de Qingzhou superviviente —cientos de miles con sus familias— es absorbido por Cao Cao. Transforma a los rebeldes en la columna vertebral de su ejército. La llama que quiso derribar el Imperio acaba por forjarlo.",
      ],
      events: [
        { y: "178–183 d.C.", type: "Movimiento político", n: "Difusión del Camino de la Gran Paz", d: "Zhang Jue y sus hermanos consolidan una red religiosa en ocho provincias, prometiendo curación y justicia frente a la corrupción Han." },
        { y: "Previo a 184", type: "Contexto", n: "Crisis del Han tardío", d: "Hambrunas, impuestos abusivos y oficiales venales alimentan el descontento popular. El terreno está listo para una revuelta masiva de alcance sin precedentes." },
        { y: "Inicio de 184", type: "Proclamación", n: "El Año Jiazi 甲子", d: "El lema «El Cielo Azul ha muerto; el Cielo Amarillo se alza» marca el inicio formal del levantamiento coordinado en ocho provincias del Imperio al mismo tiempo." },
        { y: "184 d.C.", type: "Juramento fundacional", n: "Juramento del Melocotonero 桃園結義", d: "Liu Bei, Guan Yu y Zhang Fei juran hermandad ante un melocotonero en flor y se unen a las fuerzas imperiales. Uno de los momentos fundacionales de toda la novela." },
        { y: "184 d.C.", type: "Campaña militar", n: "Campaña de Huangfu Song y Zhu Jun", d: "Los generales imperiales lanzan operaciones combinadas para fragmentar los ejércitos Turbantes y recuperar las rutas estratégicas del norte y del centro." },
        { y: "184 d.C.", type: "Derrota rebelde", n: "Caída de los hermanos Zhang", d: "Zhang Jue muere de enfermedad en campaña. Zhang Liang y Zhang Bao son derrotados en batalla. El núcleo dirigente de la rebelión desaparece, aunque los focos locales persisten años." },
      ],
    },
    "dong-zhuo": {
      lede: "El general fronterizo Dong Zhuo marcha sobre Luoyang con sus tropas norteñas, depone al heredero y convierte al Hijo del Cielo en su marioneta. Lo que sigue son tres años de terror, incendio y conspiración que fragmentan para siempre la autoridad Han.",
      prose: [
        "Cuando He Jin llama a Dong Zhuo para intimidar a los eunucos, firma su propia sentencia. He Jin muere asesinado antes de que llegue el ejército; los eunucos son masacrados por Yuan Shao; y Dong Zhuo, ya dentro de Luoyang, encuentra un vacío de poder que llena con brutalidad sin precedentes.",
        "Su reinado dura tres años, pero sus efectos son permanentes. La quema de Luoyang —capital Han durante dos siglos— y el traslado forzoso a Chang'an destruyen el símbolo del poder imperial. La Gran Coalición de dieciocho señores fracasa por ambición mutua, pero deja a China dividida en feudos que no volverán a unirse bajo el Han.",
      ],
      events: [
        { y: "189 d.C.", type: "Crisis política", n: "Muerte de He Jin y masacre de eunucos", d: "El Gran General He Jin es atraído al palacio y asesinado. Yuan Shao responde masacrando a los Diez Eunucos. El poder central queda en un vacío mortal que nadie puede llenar." },
        { y: "189 d.C.", type: "Golpe de Estado", n: "Dong Zhuo entra en Luoyang", d: "Con sus tropas norteñas, Dong Zhuo ocupa la capital antes de que nadie pueda detenerle. Depone al Emp. Shao y entroniza al niño Liu Xie como Emp. Xian, su marioneta de por vida." },
        { y: "189 d.C.", type: "Tentativa", n: "Cao Cao intenta asesinar a Dong Zhuo", d: "Cao Cao se acerca al tirano con un sable prestado. Al ver que Dong Zhuo no está dormido, convierte el acto en una ofrenda y huye de Luoyang disfrazado de viajero. Su primera leyenda." },
        { y: "190 d.C.", type: "Coalición", n: "Gran Coalición de los Dieciocho Señores", d: "Cao Cao convoca a los señores regionales bajo el estandarte Han. Dieciocho potentados responden. Yuan Shao es elegido comandante general. La coalición avanza —o finge avanzar— hacia Luoyang." },
        { y: "190 d.C.", type: "Batalla", n: "Batalla de Si Shui y Paso Hu Lao", d: "Lü Bu defiende los pasos al oeste de Luoyang. Liu Bei, Guan Yu y Zhang Fei brillan en combates singulares, pero la ofensiva conjunta se disuelve por intrigas internas." },
        { y: "190 d.C.", type: "Destrucción", n: "Quema de Luoyang 洛陽", d: "Dong Zhuo incendia la capital imperial y traslada la corte a Chang'an. Palacetes, archivos y templos arden durante días. La ciudad símbolo del Han queda reducida a cenizas." },
        { y: "192 d.C.", type: "Conspiración", n: "La Estratagema de la Belleza 美人計", d: "Wang Yun coloca a Diao Chan entre Dong Zhuo y Lü Bu, sembrando celos irresistibles. Lü Bu asesina a su propio padre adoptivo. El tirano más temido del Imperio muere a manos de su propia guardia." },
      ],
    },
    "guerras-senores": {
      lede: "La muerte de Dong Zhuo no restaura el orden: lo multiplica. Decenas de caudillos se disputan China durante dieciséis años de conflictos incesantes. Cuando el polvo se asienta, Cao Cao domina el norte, Sun Quan hereda el sureste y Liu Bei sigue sin hogar propio.",
      prose: [
        "Esta es la era más larga y compleja del Romance. Los grandes señores se aniquilan entre sí: Lü Bu devora a Liu Bei, Cao Cao devora a Lü Bu, Cao Cao devora a Yuan Shao. Es la era de las batallas fundacionales —Xiapi, Puyang, Guandu— que forjan la leyenda de los protagonistas.",
        "Mientras tanto, Liu Bei peregrina de señor en señor, incapaz de asentarse, hasta que Zhuge Liang le traza el Plan de Longzhong: conquistar Jing, tomar Yi, esperar el momento. Por primera vez, Liu Bei tiene una estrategia. Por primera vez, su destino tiene forma.",
      ],
      events: [
        { y: "192–194 d.C.", type: "Expansión", n: "Cao Cao toma la provincia de Yan 兗", d: "Cao Cao consolida su base, aplasta el alzamiento de Zhang Miao y absorbe al Ejército Turbante de Qingzhou, que se convierte en su columna vertebral durante décadas." },
        { y: "195 d.C.", type: "Maniobra política", n: "Cao Cao acoge al Emperador Xian", d: "Cao Cao escolta al Emp. Xian desde las ruinas de Luoyang y lo instala en Xu. Con el Hijo del Cielo en su poder, puede emitir órdenes imperiales en su propio nombre." },
        { y: "194–199 d.C.", type: "Rivalidad", n: "Ascenso y caída de Lü Bu", d: "Lü Bu ocupa temporalmente Xu, traiciona a Liu Bei y se alía con todos sin fidelidad a nadie. Cao Cao lo sitia en Xiapi. Liu Bei da la orden de ejecución. El guerrero más temible cae capturado." },
        { y: "200 d.C.", type: "Batalla decisiva", n: "官渡之戰 — Batalla de Guandu", d: "Yuan Shao marcha con cien mil hombres. Cao Cao aguanta el cerco en inferioridad numérica. El raid nocturno de Wuchao quema el suministro enemigo y el norte de China se rinde ante Cao Cao." },
        { y: "200–207 d.C.", type: "Consolidación", n: "Unificación del norte", d: "Cao Cao elimina a los hijos de Yuan Shao, aplasta a los Wuhuan en Liucheng y somete Liaodong. Por primera vez en dos décadas, el norte de China tiene un solo amo." },
        { y: "207 d.C.", type: "Alianza fundacional", n: "三顾茅庐 — Las Tres Visitas a Longzhong", d: "Liu Bei visita tres veces la cabaña de Zhuge Liang. El Plan de Longzhong traza la estrategia de los tres reinos antes de que existan: tomar Jing, conquistar Yi, esperar el momento." },
      ],
    },
    "chibi": {
      lede: "Cao Cao ha unificado el norte. Cuando el señor de Jing muere sin resistencia, el camino al sur parece abierto. Pero al sur del Yangtzé, Zhou Yu y Zhuge Liang tejen juntos la trampa de fuego que hará imposible la reunificación durante setenta años.",
      prose: [
        "Chibi es el momento más novelesco del Romance. Los capítulos que la narran son los más celebrados: Zhuge Liang invocando el viento del sureste, la flota de paja que roba flechas, el plan de la cadena de barcos, el fuego que consume al invencible ejército del norte.",
        "Históricamente, Chibi fue una victoria de Zhou Yu sobre un ejército debilitado por la epidemia. La novela la convierte en una obra maestra de ingenio donde cada personaje —Huang Gai, Pang Tong, Lu Su, Zhuge Liang— tiene su papel exacto en la conspiración de la derrota.",
      ],
      events: [
        { y: "208 d.C.", type: "Conquista", n: "Caída de Jingzhou", d: "Liu Biao muere y su sucesor Liu Cong se rinde a Cao Cao sin combatir. Liu Bei huye hacia el sur con cientos de miles de civiles que se niegan a abandonarlo." },
        { y: "208 d.C.", type: "Diplomacia", n: "Zhuge Liang cruza el Yangtzé", d: "Enviado por Liu Bei a la corte de Sun Quan, Zhuge Liang debate con los asesores que aconsejan rendirse. Su elocuencia convence a Sun Quan de resistir. La alianza queda sellada." },
        { y: "208 d.C.", type: "Estratagema", n: "草船借箭 — El barco de paja", d: "Zhuge Liang navega de noche entre la niebla con barcos de paja. Los arqueros de Cao Cao los llenan de flechas. Al amanecer tiene cien mil proyectiles sin haber perdido un hombre." },
        { y: "208 d.C.", type: "Estratagema", n: "连环计 — La Treta de la Cadena", d: "Pang Tong aconseja a Cao Cao encadenar sus barcos para estabilizar la flota. Cao Cao acepta sin saber que firma la condena de su armada al fuego que se acerca." },
        { y: "208 d.C.", type: "Batalla", n: "赤壁之火 — El Gran Fuego de Chibi", d: "Huang Gai conduce barcos incendiados contra la flota encadenada de Cao Cao. El viento del sureste extiende las llamas. La armada norteña arde en horas. El sur de China respira." },
        { y: "208 d.C.", type: "Retirada", n: "La Huida por Hua Rong", d: "Cao Cao huye hacia el norte. Guan Yu lo espera en el paso de Hua Rong y lo deja marchar en recuerdo de favores pasados. La gratitud más tensa del Romance." },
      ],
    },
    "tres-reinos": {
      lede: "China se divide formalmente en tres: Wei en el norte, Shu Han en el suroeste, Wu en el sureste. Un equilibrio armado donde la guerra es perpetua y la paz solo la pausa entre campañas. El trípode dura cuarenta años porque ninguno puede destruir a los otros dos.",
      prose: [
        "La era comienza con la muerte de Cao Cao (220) y la proclamación de Cao Pi como primer Emp. de Wei. Liu Bei responde proclamando Shu Han. Sun Quan espera hasta 229 para coronarse. Tres tronos. Tres legitimidades. Ninguna indiscutible.",
        "El corazón dramático de esta era es Zhuge Liang: el Primer Ministro de Shu dedica once años a cinco expediciones del norte que buscan recuperar el Han. Cada una fracasa por razones distintas. La última lo mata en su campamento de Wuzhang Yuan, mirando hacia Luoyang que nunca alcanzará.",
      ],
      events: [
        { y: "220 d.C.", type: "Fundación", n: "Cao Pi funda Wei 魏", d: "Muerto Cao Cao, su hijo Cao Pi fuerza la abdicación del Emp. Xian y se proclama Emp. de Wei. El Han —de nombre— termina. El norte tiene su nuevo trono imperial." },
        { y: "221 d.C.", type: "Fundación", n: "Liu Bei funda Shu Han 蜀漢", d: "Liu Bei se proclama Emp. en Chengdu reivindicando la legitimidad Han. Zhuge Liang redacta los decretos fundacionales. El suroeste tiene su rey y su misión: restaurar el Han." },
        { y: "221–222 d.C.", type: "Batalla", n: "夷陵之戰 — Batalla de Yiling", d: "Liu Bei marcha contra Wu para vengar la muerte de Guan Yu. Lu Xun lo atrae hacia un terreno forestal y lanza un ataque de fuego. El ejército de Shu es aniquilado. Liu Bei muere al año siguiente." },
        { y: "225 d.C.", type: "Campaña sur", n: "Zhuge Liang y los Siete Capturas de Meng Huo", d: "Zhuge Liang pacifica el sur derrotando siete veces a Meng Huo y liberándolo cada vez. El flanco sur queda asegurado mediante lealtad real, no rendición. Shu puede mirar al norte." },
        { y: "228–234 d.C.", type: "Expediciones", n: "Las Expediciones del Norte", d: "Zhuge Liang lanza cinco campañas contra Wei. Cada una avanza, presiona y retrocede: el flanco fallido de Ma Su en Jieting, la resistencia de Sima Yi, los límites del suministro. Ninguna llega a Luoyang." },
        { y: "234 d.C.", type: "Muerte", n: "Muerte de Zhuge Liang en Wuzhang Yuan", d: "Zhuge Liang muere en su campamento durante la última expedición, mirando al norte que nunca alcanzó. Su figura se convierte en el símbolo literario de la lealtad imposible y la grandeza inútil." },
      ],
    },
    "guerras-ocaso": {
      lede: "Los tres reinos envejecen. Jiang Wei no abandona la obsesión de su maestro y lanza nueve campañas contra Wei que nunca deciden nada. En la sombra, los Sima maniobran para devorar el trono Wei desde dentro. El fin se acerca para el más pequeño de los tres.",
      prose: [
        "Shu Han, el más pequeño, se desangra en campañas ofensivas sin recursos para sostenerlas. El eunuco Huang Hao paraliza los preparativos defensivos cuando el peligro se vuelve real. Cuando Deng Ai cruza Yinping, Chengdu no tiene ejército que defenderla.",
        "Wei, aparentemente el más fuerte, tiene su propio cáncer interno. Sima Yi, Sima Shi y Sima Zhao liquidan uno a uno a los generales que podrían resistirles. El Emp. Cao Mao intenta matar a Sima Zhao con una lanza y muere en la calle. El momento más trágico del ocaso Wei.",
      ],
      events: [
        { y: "238–262 d.C.", type: "Campañas", n: "Las Nueve Campañas de Jiang Wei", d: "Jiang Wei lanza expedición tras expedición buscando el milagro que Zhuge Liang nunca logró. Cada campaña avanza, presiona y retrocede. Los recursos de Shu se agotan sin resultado estratégico." },
        { y: "249 d.C.", type: "Golpe", n: "高平陵政变 — Golpe de Gaoping", d: "Sima Yi aprovecha la ausencia del regente Cao Shuang para tomar Luoyang. Cao Shuang se rinde creyendo promesas de perdón. Es ejecutado al tercer día junto a toda su facción." },
        { y: "260 d.C.", type: "Tragedia", n: "El Emp. Cao Mao sale a matar a Sima Zhao", d: "El joven Emp. Wei, humillado, sale al patio con una lanza al grito de que Sima Zhao traiciona a todos. Un soldado lo atraviesa en la calle. El asesinato de un Hijo del Cielo sin consecuencias." },
        { y: "262–263 d.C.", type: "Invasión", n: "La campaña final contra Shu", d: "Tres columnas Wei invaden Shu. Deng Ai propone cruzar el paso de Yinping por terreno imposible, envolviendo a sus soldados en pieles para descender las montañas. La maniobra más audaz de la era." },
        { y: "263 d.C.", type: "Caída", n: "Caída de Shu Han 蜀漢", d: "Deng Ai emerge al sur de la línea defensiva. Chengdu queda desprotegida. Liu Shan se rinde sin combatir. Jiang Wei intenta un último ardid usando a Zhong Hui contra Sima Zhao. Fracasa y es asesinado." },
      ],
    },
    "sima": {
      lede: "Los Sima replican exactamente lo que los Cao hicieron al Han: el regente devora al rey, el ministro devora al hijo del cielo. Lo que tardó Cao Cao cuarenta años, la familia Sima lo consume en tres generaciones de paciencia calculada y maniobra implacable.",
      prose: [
        "El ascenso de los Sima es la historia más amarga del Romance porque repite el patrón: el sirviente leal se vuelve indispensable, el indispensable se vuelve intocable, el intocable toma el poder. Sima Yi aprendió esta lección observando a los Cao; sus hijos la ejecutaron con brutal eficiencia.",
        "Lo que hace única a esta era es la muerte del Emp. Cao Mao: un joven que sabe que va a morir, que sale de todos modos con una lanza y sus sirvientes, y que muere en la calle como un hombre que prefiere la dignidad al cautiverio dorado. El momento más trágico del ocaso Wei.",
      ],
      events: [
        { y: "249 d.C.", type: "Golpe de Estado", n: "高平陵政变 — Golpe de Gaoping", d: "Sima Yi cierra las puertas de Luoyang mientras Cao Shuang visita una tumba. Cao Shuang cede a cambio de promesas de vida. Es ejecutado al tercer día con toda su facción y los Tres Eminentes." },
        { y: "250–251 d.C.", type: "Consolidación", n: "Sima Yi, señor absoluto de Wei", d: "Con Cao Shuang eliminado, Sima Yi ejerce el poder real. Muere en 251 fingiendo enfermedad hasta el final para despistar a rivales. El aparato que construyó pasa intacto a sus hijos." },
        { y: "254 d.C.", type: "Intriga", n: "Sima Shi depone al Emp. Cao Fang", d: "Cao Fang intenta conspirar contra Sima Shi. Sima Shi actúa antes: el Emp. Wei es depuesto como un sirviente sin méritos y reemplazado por el joven Cao Mao, que heredará la tragedia." },
        { y: "255–257 d.C.", type: "Rebeliones", n: "Últimas rebeliones de los generales Wei", d: "Guanqiu Jian y luego Zhuge Dan levantan sus ejércitos en nombre de los Cao. Sima Shi aplasta el primero; Sima Zhao aplasta el segundo. Cada rebelión liquidada deja a los Sima con más poder y menos rivales." },
        { y: "260 d.C.", type: "Tragedia", n: "El Emp. Cao Mao carga contra Sima Zhao", d: "El joven Emp. Wei sale del palacio armado con una lanza al grito de que Sima Zhao traiciona a todos. Un soldado de Sima Zhao lo atraviesa. El asesinato de un Hijo del Cielo escandaliza, pero no tiene consecuencias." },
        { y: "265 d.C.", type: "Fundación", n: "Sima Yan funda la Dinastía Jin 晉", d: "Sima Yan fuerza la abdicación de Cao Huan, el último Emp. Wei, y se proclama Emp. Wu de Jin. El proyecto de los Cao, que empezó con Cao Cao en 155 d.C., termina en 265." },
      ],
    },
    "jin": {
      lede: "La última pieza cae. Wu, el reino que resistió a Chibi, sobrevivió cincuenta y ocho años de Tres Reinos y aguantó décadas de presión Jin, se rinde ante la armada que desciende el Yangtzé. Sun Hao —el último tirano— llega atado de manos al campamento del vencedor.",
      prose: [
        "La unificación Jin es al mismo tiempo el final del Romance y su epílogo más melancólico. China vuelve a ser una, pero la Dinastía Jin durará menos de cuarenta años antes de desintegrarse en las Guerras de los Ocho Príncipes. El ciclo que comenzó en 184 se cierra en 280, pero ya germina el próximo.",
        "Sun Hao, el último Emp. de Wu, es la figura más patética del cierre: un tirano cruel que agotó la paciencia de sus generales, se rinde atado de manos y llega a Luoyang. Sima Yan lo perdona; Sun Hao responde con insolencia hasta su muerte natural. El último irreductible del mundo que fue.",
      ],
      events: [
        { y: "265 d.C.", type: "Fundación", n: "Sima Yan funda la Dinastía Jin 晉", d: "Sima Yan fuerza la abdicación de Cao Huan, el último Emp. Wei. Se proclama Emp. Wu de Jin con Luoyang como capital. El tercer cambio dinástico en cincuenta años." },
        { y: "265–279 d.C.", type: "Desgaste", n: "Wu se desgasta desde dentro", d: "El Emp. Sun Hao gobierna Wu con crueldad extrema: ejecuta ministros por capricho, agota al ejército con obras suntuarias y pierde la lealtad de los generales que podrían resistir a Jin." },
        { y: "279 d.C.", type: "Invasión", n: "Jin lanza la campaña final", d: "El Emp. Wu de Jin ordena la invasión de Wu por seis frentes simultáneos. Los generales Jin avanzan por el Yangtzé mientras la flota desciende. La resistencia de Wu es fragmentada y sin coordinación." },
        { y: "280 d.C.", type: "Batalla", n: "Wang Jun desciende el Yangtzé", d: "El almirante Wang Jun conduce su armada río abajo destruyendo cadenas de hierro y barreras flotantes. Nanjing queda sin defensa. Sun Hao, incapaz de reunir a sus generales, decide rendirse." },
        { y: "280 d.C.", type: "Rendición", n: "Sun Hao se rinde atado de manos", d: "Siguiendo el ritual de rendición, Sun Hao llega con las manos atadas y un ataúd cargado por sus sirvientes. Sima Yan le corta las ataduras y lo perdona. Wu deja de existir." },
        { y: "280 d.C.", type: "Unificación", n: "China reunificada bajo Jin", d: "Por primera vez desde 189, toda China tiene un solo soberano. El Emp. Wu de Jin celebra el fin del ciclo. Según la leyenda, lloró: sabía que una unificación construida sobre traición dura poco." },
      ],
    },
    "ocho-principes": {
      lede: "Jin había tardado quince años en colapsar. Los Ocho Príncipes —parientes del Emp. Wu concedidos con poderes militares excesivos— comenzaron a devorarse entre sí en 291. Cuando terminaron, China ya no era de nadie. Los Xiongnu entraron por el norte.",
      prose: [
        "La Rebelión de los Ocho Príncipes (291–306 d.C.) es el epílogo más amargo: el Imperio que Zhang Jiao, Dong Zhuo, Cao Cao, Liu Bei, Sun Quan y Sima Yi construyeron y destruyeron durante un siglo se liquida en quince años de guerra fratricida sin un solo protagonista memorable.",
        "Los Xiongnu del norte aprovechan el colapso: invaden las llanuras, saquean Luoyang (311 d.C.) y capturan al Emp. Huai, luego incendian Chang'an (316 d.C.) y capturan al Emp. Min. Jin Occidental termina. El ciclo que comenzó en 184 está cerrado para siempre.",
      ],
      events: [
        { y: "291 d.C.", type: "Crisis dinástica", n: "Estalla la Rebelión de los Ocho Príncipes", d: "Ocho parientes del fundador Jin combaten entre sí por la regencia del Emp. Hui, incapaz de gobernar. Los ejércitos provinciales devoran las provincias mientras la corte sangra sin control." },
        { y: "299–303 d.C.", type: "Escalada", n: "Los Príncipes forman facciones", d: "La rivalidad se multiplica: los Príncipes de Qi, Zhao, Lun, Yong, Chengdu y Donghai forman alianzas cambiantes, se traicionan y se eliminan con ejércitos que ya no sirven al Imperio." },
        { y: "304 d.C.", type: "Amenaza exterior", n: "Los Xiongnu fundan Han Zhao", d: "Liu Yuan, líder Xiongnu con sangre Han, proclama el reino de Han Zhao en el norte. Por primera vez en siglos, una potencia extranjera ocupa territorio chino con vocación de permanencia." },
        { y: "311 d.C.", type: "Catástrofe", n: "Saqueo de Luoyang 洛陽", d: "Los Xiongnu saquean Luoyang y capturan al Emp. Huai. La capital Han original, restaurada por Jin, cae ante bárbaros del norte. El símbolo de China es destruido por segunda vez en un siglo." },
        { y: "316 d.C.", type: "Colapso final", n: "Caída de Chang'an — Fin de Jin Occidental", d: "Chang'an cae ante las fuerzas Xiongnu. El Emp. Min se rinde. La Dinastía Jin Occidental termina. El norte de China entra en el período de los Dieciséis Reinos. El ciclo de 184 está cerrado." },
      ],
    },
  };
  PERIODS.forEach(p => { if (C[p.id]) Object.assign(p, C[p.id]); });
})();
