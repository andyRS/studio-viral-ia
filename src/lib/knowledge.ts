// Manual viral: todo lo aprendido produciendo y publicando microdramas con IA.
// Se inyecta en TODOS los prompts del modelo de lenguaje, así cada historia
// nueva o continuación nace con estas reglas.

export const STYLES = {
  frutinovela: {
    label: "Frutinovela 3D (humor dominicano)",
    visual: "Telenovela animada 3D premium estilo Pixar, vertical 9:16. Todos los personajes tienen la cabeza entera de una fruta con cara expresiva, nunca cara humana.",
    voice: "Diálogo con palabras del dialecto dominicano escritas completas (tíguere, yipeta, jevito, vaina, mi cualto, lo cualto mío) y acento latino neutro.",
  },
  cristiana: {
    label: "Frutinovela cristiana (redención)",
    visual: "Telenovela animada 3D premium estilo Pixar, vertical 9:16. Personajes con cabeza de fruta, nunca cara humana. Luz cálida, emoción, lágrimas, abrazos.",
    voice: "Español latino neutro, cálido y respetuoso. Puede usar alguna palabra dominicana suave. Sin humor burlón sobre la fe.",
  },
  cine90: {
    label: "Cine romántico de los 90 (realista)",
    visual: "Película romántica de los años 90 en República Dominicana, grano de 35 mm, luz cálida dorada, vestuario y peinados de los 90, vertical 9:16, personas reales.",
    voice: "Español latino neutro, elegante, frases cortas y emotivas.",
  },
} as const;
export type StyleKey = keyof typeof STYLES;

export const MANUAL_VIRAL = `
MANUAL VIRAL (aprendido con resultados reales: 110 mil vistas en Instagram con cine de los 90, frutinovela cristiana que rompió el estancamiento en TikTok)

1. FÓRMULA BASE (Instagram, probada): conflicto o juego de estatus visible en el segundo 0-1, sin presentaciones; gancho de texto de 2 líneas en los primeros 3 segundos; revelación mediante un objeto (entrada, carta, celular, prueba de embarazo, foto); escalada rápida; giro final o cliffhanger; cierre "Continuará..." y pedir "¿Parte 2?" en comentarios.
2. LO QUE MÁS ENGANCHA: emoción universal (madre negada, amor prohibido por clase social, traición, deuda, secreto familiar); ironía dramática (el público sabe algo que el personaje no); bomba de tiempo ("llega en dos semanas", "tienes hasta el domingo"); identidad dominicana (barrio, colmado, yipeta, Nueva York, remesas, Punta Cana).
3. FORMATO DE 1-3 MINUTOS (TikTok/Facebook): "Anteriormente..." si es continuación; pocas escenas con diálogo sin pausas; tarjetas de tiempo ("Días después...", "Esa misma noche...", "Mientras tanto..."); chat de WhatsApp en pantalla cuando ayude; narrador SOLO en la última frase para dejar la intriga.
4. CRISTIANO: pecado u orgullo -> caída -> regreso a Dios o a la familia -> frase final del narrador -> "Escribe AMÉN". Nada sexual ni burlón.
5. LO QUE NO SE HACE: escenas sexuales o sugerentes (los generadores las bloquean y Meta/TikTok no las monetizan); vestidos de tirantes; personajes de marcas o famosos; contracciones cortadas (pa', vamo', e', ta') porque la voz se traba.
6. PROMPTS DE VIDEO: SIEMPRE en español y empezando con "Usa Seedance 2.5."; descripción fija de cada personaje en cada prompt; lista de tomas con tiempos; diálogos entre comillas exactas con acentos correctos; sección PRONUNCIACIÓN OBLIGATORIA (tíguere = TÍ-gue-re nunca tigre; mi cualto con L nunca cuartos; Piña = PI-ña nunca Pina; yipeta = yi-PE-ta); sección VOCES: español latino neutro, cada palabra completa, nunca acento inglés, sincronización de labios solo para quien habla, sin subtítulos ni texto en pantalla. Pocos movimientos de cámara: planos medios y primeros planos de quien habla.
7. CONTINUIDAD: los personajes conservan exactamente su descripción, ropa y forma de hablar en todos los episodios; cada episodio retoma el cliffhanger del anterior en los primeros segundos y termina con un cliffhanger nuevo más fuerte.
8. CUANDO ALGO FUNCIONA: repetir la misma estructura 3-5 veces cambiando solo la historia.
9. LO QUE EXPLOTA ES UNA PARTE 1 NUEVA que se entiende sola: cada continuación cae alrededor de un 85 % (Navidad: 140 mil -> 22,9 mil -> 3,2 mil -> 1,8 mil). Prioriza historias nuevas y completas antes que alargar una serie.
10. NARRADOR SOLO EN LA ÚLTIMA FRASE: "Lo que X no sabe... es que...".
11. FACEBOOK Y TIKTOK NECESITAN COMO MÍNIMO 60 SEGUNDOS: si el episodio queda corto, se añade la tarjeta "Continuará..." de 3 s.
`.trim();

// ---------- ELENCO DE FRUTAS (frutinovela y cristiana) ----------
// Catálogo fruta -> rol típico, emoji, color de subtítulo (hex sin #) y cabeza por defecto.
// Lo usan las reglas que lee la IA y el código que repara o crea el elenco sin IA.
export interface FruitInfo { fruit: string; emoji: string; color: string; roles: string[]; head: string }
export const FRUIT_CATALOG: FruitInfo[] = [
  { fruit: "plátano", emoji: "🍌", color: "FFE14D", roles: ["humilde", "motoconchista", "protagonista", "pobre", "trabajador", "novio"], head: "plátano verde alargado y curvo, cáscara lisa con pintas marrones, tallito arriba como copete, ojos grandes y brillantes, boca amplia y expresiva" },
  { fruit: "coco", emoji: "🥥", color: "D9A066", roles: ["rico", "papá", "padre", "estricto", "jefe", "millonario"], head: "coco redondo marrón con fibras peludas, tres puntitos como cejas fruncidas, ojos serios, bigote de fibra, sombrero panamá" },
  { fruit: "aguacate", emoji: "🥑", color: "5BC94A", roles: ["madre", "mamá", "trabajadora", "vendedora", "abuela"], head: "aguacate verde oscuro con piel rugosa, ojos cálidos y cansados, mejillas suaves, boca dulce y temblorosa" },
  { fruit: "chinola", emoji: "🍋", color: "FFD23F", roles: ["joven", "orgullosa", "hija", "rebelde", "estudiante"], head: "chinola amarilla redonda con piel lisa y brillante, ojos grandes delineados, boca con gesto orgulloso" },
  { fruit: "limón", emoji: "🍋", color: "FFD23F", roles: ["joven", "orgullosa", "ácida", "celosa"], head: "limón verde brillante con puntas redondeadas, ojos pícaros, boca fruncida y ácida" },
  { fruit: "manzana", emoji: "🍎", color: "FF4D6D", roles: ["niño rico", "arrogante", "hijo rico", "rival"], head: "manzana roja brillante con tallo y una hoja verde, ojos altivos, sonrisa arrogante" },
  { fruit: "piña", emoji: "🍍", color: "F2C14E", roles: ["chismosa", "suegra", "vecina", "señora"], head: "piña dorada con escamas en rombo y corona de hojas verdes como peinado, ojos curiosos, boca exagerada de chisme" },
  { fruit: "guayaba", emoji: "🍐", color: "FF6B81", roles: ["amiga", "leal", "confidente", "hermana"], head: "guayaba verde clara redondeada con piel lisa, ojos alegres, sonrisa leal" },
  { fruit: "mango", emoji: "🥭", color: "FF9A1F", roles: ["galán", "enamorado", "conquistador"], head: "mango ovalado rojo y amarillo con piel brillante, hojita arriba, ojos seductores, sonrisa de galán" },
  { fruit: "fresa", emoji: "🍓", color: "FF4D6D", roles: ["muchacha bonita", "novia", "princesa", "bonita"], head: "fresa roja brillante con semillitas doradas y corona de hojas verdes, ojos grandes con pestañas, boca rosada" },
  { fruit: "coco joven", emoji: "🥥", color: "B6F08A", roles: ["niño", "hijo", "nieto", "pequeño"], head: "coco verde tierno y redondo, piel lisa, ojos enormes e inocentes, boca pequeña" },
  { fruit: "guanábana", emoji: "🍈", color: "B6F08A", roles: ["abuela", "anciana", "sabia"], head: "guanábana verde con espinitas suaves, ojos sabios con arrugas, sonrisa tierna" },
];
export const NARRATOR_COLOR = "FFFFFF";

export const FRUIT_CAST_RULES = `
REGLAS DEL ELENCO DE FRUTAS (obligatorias):
- Todo personaje tiene la cabeza ENTERA de una fruta con cara expresiva (ojos y boca integrados en la fruta), cuerpo humano con ropa y manos. NUNCA cara humana.
- La fruta encaja con el personaje: plátano = el humilde del barrio, el motoconchista; coco = el rico, el papá estricto (sombrero panamá); aguacate = la madre trabajadora; chinola o limón = la joven orgullosa; manzana = el niño rico y arrogante; piña = la señora chismosa o la suegra; guayaba = la amiga leal; mango = el galán; fresa = la muchacha bonita.
- Nombres dominicanos con la fruta: Platanito, Coquita, Don Coco, Doña Aguacate, Manguito, Guayabita, Julián Manzana, Doña Piña. Nunca "Protagonista", "Antagonista" ni nombres solo humanos.
- Las mujeres tienen cabello humano realista sobre la cabeza de fruta. Nada de vestidos de tirantes: siempre manga larga. No usar personajes de marcas.
- La ropa de cada personaje es FIJA en toda la serie.
- Colores de subtítulo (hex sin #) por fruta: plátano FFE14D, coco D9A066, aguacate 5BC94A, chinola FFD23F, manzana FF4D6D, piña F2C14E, guayaba FF6B81, mango FF9A1F, fresa FF4D6D, coco joven B6F08A, narrador FFFFFF. Si dos personajes coinciden en color, usa otro distinto.
`.trim();

export const CHRISTIAN_RULES = `
REGLAS CRISTIANAS (público pentecostal/evangélico):
- La iglesia es evangélica sencilla: púlpito de madera, cruz lisa sin cristo, Biblia, bancos.
- PROHIBIDO poner santos, vírgenes, altares, velas votivas, rosarios o cuadros religiosos, ni en la iglesia ni en la casa.
- Estructura: pecado u orgullo -> caída -> regreso a Dios o a la familia -> frase final del narrador -> "Escribe AMÉN".
`.trim();
export const CHRISTIAN_SCENE_GUARD = "sin imágenes de santos ni de la Virgen, sin altares";
