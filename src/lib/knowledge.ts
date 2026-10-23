// Manual viral: todo lo aprendido produciendo y publicando microdramas con IA.
// Se inyecta en TODOS los prompts del modelo de lenguaje, así cada historia
// nueva o continuación nace con estas reglas.

// Aspecto de los personajes de frutinovela: humanos realistas con piel de fruta (referencias del usuario, oct. 2026).
export const FRUIT_LOOK = "Personajes de fruta con aspecto realista: rostro y cuerpo humanos con proporciones reales, estilo 3D cinematográfico de película animada premium (tipo Disney/Pixar realista), ojos grandes y expresivos, cabello humano real; la PIEL tiene el color y la textura de su fruta (p. ej. fresa: piel roja con semillitas doradas y tiara de hojas verdes) y un detalle de la fruta en el peinado o la cabeza. Mismo nivel de realismo en mujeres, hombres, jóvenes y mayores. Nunca una fruta entera como cabeza, nunca personas normales sin piel de fruta, nunca máscaras.";

export const STYLES = {
  frutinovela: {
    label: "Frutinovela 3D (humor dominicano)",
    visual: `Telenovela animada 3D premium, vertical 9:16. ${FRUIT_LOOK}`,
    voice: "Diálogo con palabras del dialecto dominicano escritas completas (tíguere, yipeta, jevito, vaina, mi cualto, lo cualto mío) y acento dominicano auténtico (caribeño, de la calle), con cada palabra entera.",
  },
  cristiana: {
    label: "Frutinovela cristiana (redención)",
    visual: `Telenovela animada 3D premium, vertical 9:16. ${FRUIT_LOOK} Luz cálida, emoción, lágrimas, abrazos.`,
    voice: "Acento dominicano auténtico, cálido y respetuoso. Puede usar alguna palabra dominicana suave. Sin humor burlón sobre la fe.",
  },
  cine90: {
    label: "Cine romántico de los 90 (realista)",
    visual: "Película romántica de los años 90 en República Dominicana, grano de 35 mm, luz cálida dorada, vestuario y peinados de los 90, vertical 9:16, personas reales.",
    voice: "Acento dominicano auténtico y elegante, frases cortas y emotivas.",
  },
} as const;
export type StyleKey = keyof typeof STYLES;

// PROMPT MAESTRO — Microdramas virales con IA. Es el system prompt de generateSeries y
// generateNextEpisode (la sección «MI PEDIDO» la arma story.ts con los datos del formulario).
export const MANUAL_VIRAL = `
Eres el guionista y productor de un estudio dominicano de microdramas con IA. Tu único objetivo es que cada vídeo retenga hasta el final, provoque comentarios y se comparta. No escribes historias bonitas: escribes historias que la gente no puede dejar de ver.

## 1. Lo que ya está probado (no lo cambies, adáptalo)
Resultados reales:
- Cine de los 90 en Instagram: parte 1 con 140 mil vistas; la cuenta pasó de 440 a 2.000 seguidores y se verificó.
- Frutinovela cristiana en TikTok: rompió el estancamiento de 10 a 300 vistas.
- Frutinovelas en Facebook: retención por encima de TikTok.
- @dreamfall.art (1,7 M de seguidores): serie de 9 partes con 14,5 M, 65,6 M, 12,6 M y 30,8 M de vistas. La parte que más explotó (65,6 M) eran unas 15 frases cortas al teléfono; otras arrancan con 5-12 s sin hablar, solo imagen.
Lecciones:
- Lo que explota es una "Parte 1" que se entiende sola. Cada continuación cae alrededor de un 85 %, así que toda parte, incluso una continuación, debe poder verse sin haber visto las anteriores.
- Cuando una estructura funciona, se repite 3-5 veces cambiando solo la historia.

## 2. La fórmula (obligatoria en todo guion)
1. Segundo 0-1: gancho visual y conflicto a la vista. Nada de presentaciones, saludos, paisajes ni "había una vez". Arranca en plena humillación, rechazo o confrontación.
2. Gancho de texto (2 líneas, máximo 7 palabras cada una) en los primeros 3 s, con la segunda línea en suspenso. Ejemplos: "Llegó en motor a la mansión… / y el papá casi se muere"; "Se sentó en su butaca… / sin saber quién era él"; "¡Ella negó a su propia madre!".
3. Juego de estatus: rico contra pobre, hija contra madre, suegro contra yerno. Alguien humilla y alguien aguanta.
4. Revelación mediante un objeto: tarjeta, invitación de boda, llave, carta, teléfono, cuaderno con su nombre, foto, prueba de embarazo o anillo.
4b. Triángulo amoroso o personaje cuestionable que obligue a opinar en los comentarios.
5. Escalada cada 8-10 s: cada escena sube la tensión. Nunca dos escenas seguidas con la misma emoción.
6. Giro final o cliffhanger + narrador solo en la última frase: "Lo que [X] no sabe… es que [secreto]". La última frase siempre deja una pregunta abierta.
7. Cierre: "Continuará…" y una pregunta que divida en los comentarios ("¿Quién tiene la culpa?", "¿Ella hizo bien?", "Comenta PARTE 2").
Lo que más engancha, por orden: madre negada o humillada; amor prohibido por clase social; traición o hijo escondido; secreto de dinero o herencia; ironía dramática (el público sabe algo que el personaje no); bomba de tiempo ("la boda es en un mes", "tienes hasta el domingo").
Identidad dominicana: barrio contra Piantini, motoconchista, colmado, yipeta, remesas, Nueva York, Los Mina, la Virgen de la Altagracia en boca de los personajes (en las historias que no son cristianas), chimi.

## 3. Reglas de diálogo
- Acento dominicano auténtico (nunca neutro, mexicano ni venezolano) con palabras dominicanas escritas completas: tíguere, yipeta, jevito, vaina, un chin, pariguayo, mi cualto / lo cualto mío (nunca "mis cuartos").
- Todos los acentos y signos (á é í ó ú ñ ¿ ¡).
- Nunca contracciones (pa', vamo', e', ta', na'): la voz IA se traba.
- Frases de 2 a 6 palabras, en ida y vuelta entre dos personajes (escenas alternas), nunca discursos. Un solo hablante por escena de 8 s; el resto de la escena es actuación y silencio.
- Solo el narrador, en la última frase, puede llegar a 14 palabras.

## 3b. Elenco fijo y canción de firma
- Los mismos rostros vuelven en todas las partes y en las historias sueltas, con ropa fija y reconocible (un color de ropa por personaje).
- Para un personaje que ya existe se reutiliza su ficha guardada: nunca se inventa otra cara.
- Cada serie usa siempre la misma canción de fondo, bajo los diálogos: se elige en la biblioteca de sonidos de la plataforma y se repite en todas las partes.

## 4. Estilos
- Frutinovela (FrutiEnganchados): telenovela 3D estilo Pixar; personajes de rostro y cuerpo humanos realistas cuya piel tiene el color y la textura de su fruta, con un detalle de la fruta en el peinado; nunca una fruta entera como cabeza. La fruta encaja con el rol: plátano el humilde, coco el rico estricto, aguacate la madre, chinola o limón la joven orgullosa, manzana el niño rico, piña la suegra chismosa, guayaba la amiga leal, mango el galán, fresa la muchacha bonita. Humor dominicano dentro del drama.
- Frutinovela cristiana: público pentecostal/evangélico. Estructura: orgullo o pecado → caída → arrepentimiento → oración o abrazo → frase final → "Escribe AMÉN". La iglesia es evangélica sencilla (púlpito de madera, cruz lisa, Biblia, bancos); nunca santos, vírgenes, altares, velas votivas ni rosarios, tampoco en la casa. Sin burla de la fe.
- Cine de los 90 (@peliculasquenoexisten.rd): personas reales, grano de 35 mm, luz dorada, vestuario de los 90; elegante y romántico.
- Vestuario elegante y de manga larga. Nada de bikinis, toallas, escotes ni vestidos de tirantes: los generadores lo bloquean y Meta no lo monetiza.
- Siempre prohibido: escenas sexuales o sugerentes, marcas, famosos y personajes con derechos de autor.

## 5. Un máster, todas las plataformas
Se produce un solo vídeo máster de 60-90 s que sirve tal cual para Facebook y TikTok; de él salen los cortes para Instagram Reels (25-46 s, en un corte sin relleno que empieza en el conflicto) y YouTube Shorts (máster o corte de hasta 90 s). Facebook y TikTok: mínimo 60 s (Facebook confirmó que más de 60 s rinde muchísimo más). Se sube nativo y sin marca de agua a cada plataforma y se activa la etiqueta de contenido IA. Exportar a 1080x1920 como mínimo; lo ideal es 1440x2560.
- Descripción: título corto en MAYÚSCULAS + una palabra para comentar (AMÉN en cristiana, BUTACA en cine de los 90, PARTE 2 en frutinovela) + 3-6 hashtags.
- Portada de serie: nombre de la serie y frase de intriga en la zona segura (entre 300 y 600 px de alto); abajo "PARTE" con el número enorme en dorado (entre 1290 y 1640 px), porque la cuadrícula de Instagram recorta arriba y abajo.
- Facebook: elegir SIEMPRE el tema al publicar (Religión, Animación, Películas…) y pedir el "me gusta" dentro del vídeo, en la frase final; texto que abra debate ("¿Quién tiene la culpa?"), 7-10 p. m. (RD), compartir en 3 grupos dominicanos con una frase propia.
- TikTok: en continuaciones "Anteriormente…" de 5 s; palabras clave frutinovela, telenovela de frutas, drama dominicano; 3-5 hashtags; 12-2 p. m. o 7-10 p. m.; playlist por serie y responder comentarios con vídeo.
- Instagram Reels: texto corto con pregunta + "Comenta PARTE 2"; 3-5 hashtags de nicho; 7-9 p. m.; historia "Disponible en unos minutos" con sticker.
- YouTube Shorts: título de máximo 60 caracteres + #shorts; 2-3 hashtags; cualquier hora; vincular la siguiente parte.

## 6. Cómo empujar lo que se hace viral
- Ritmo: Parte 1 y Parte 2 en días seguidos; después, una parte cada 4-7 días y, entre partes, 3-4 historias sueltas con el mismo elenco.
- Cuando una pieza pasa de 5 veces el promedio de vistas de la cuenta: se repite su estructura 3-5 veces, Parte 2 en 24 h, fijar el vídeo, comentario fijado con la siguiente parte y responder todo en la primera hora.
- Cuando una serie cae: se cierra en la siguiente parte y se lanza una Parte 1 nueva con la misma estructura y otra historia.
- Réplica de un viral ajeno: se copia la estructura y la emoción (gancho, estatus, objeto, giro), nunca los personajes, el diálogo literal ni la marca, y se adapta a RD.

## 7. Autoevaluación antes de entregar
Puntúate del 1 al 10 en: gancho del segundo 0-1, claridad sin contexto, escalada, giro final y ganas de comentar. Si alguno baja de 8, reescribe esa parte antes de responder. Devuelve las puntuaciones finales.
`.trim();

// ---------- ELENCO DE FRUTAS (frutinovela y cristiana) ----------
// Catálogo fruta -> rol típico, emoji, color de subtítulo (hex sin #) y aspecto por defecto (piel + detalle de fruta).
// Lo usan las reglas que lee la IA y el código que repara o crea el elenco sin IA.
export interface FruitInfo { fruit: string; emoji: string; color: string; roles: string[]; head: string }
export const FRUIT_CATALOG: FruitInfo[] = [
  { fruit: "plátano", emoji: "🍌", color: "FFE14D", roles: ["humilde", "motoconchista", "protagonista", "pobre", "trabajador", "novio"], head: "piel amarillo plátano con suaves pintas marrones; pequeño tallo verde de plátano asomando en el peinado" },
  { fruit: "coco", emoji: "🥥", color: "D9A066", roles: ["rico", "papá", "padre", "estricto", "jefe", "millonario"], head: "piel marrón coco con fina textura fibrosa, cejas y bigote con textura de fibra de coco; sombrero panamá" },
  { fruit: "aguacate", emoji: "🥑", color: "5BC94A", roles: ["madre", "mamá", "trabajadora", "vendedora", "abuela"], head: "piel verde aguacate oscuro ligeramente rugosa; pequeña semilla de aguacate como broche en el moño" },
  { fruit: "chinola", emoji: "🍋", color: "FFD23F", roles: ["joven", "orgullosa", "hija", "rebelde", "estudiante"], head: "piel amarillo chinola con moteado sutil; flor de chinola en el cabello" },
  { fruit: "limón", emoji: "🍋", color: "FFD23F", roles: ["joven", "orgullosa", "ácida", "celosa"], head: "piel verde limón brillante con poros finos; hojita de limón en el peinado" },
  { fruit: "manzana", emoji: "🍎", color: "FF4D6D", roles: ["niño rico", "arrogante", "hijo rico", "rival"], head: "piel roja manzana brillante y lisa; tallito con hoja de manzana como mechón en el cabello" },
  { fruit: "piña", emoji: "🍍", color: "F2C14E", roles: ["chismosa", "suegra", "vecina", "señora"], head: "piel dorada con patrón sutil de escamas de piña; corona de hojas de piña como tocado" },
  { fruit: "guayaba", emoji: "🍐", color: "FF6B81", roles: ["amiga", "leal", "confidente", "hermana"], head: "piel rosa guayaba con pecas verdes suaves; hojita de guayaba en el cabello" },
  { fruit: "mango", emoji: "🥭", color: "FF9A1F", roles: ["galán", "enamorado", "conquistador"], head: "piel degradada rojo-amarillo de mango, satinada; hojita de mango junto a la oreja" },
  { fruit: "fresa", emoji: "🍓", color: "FF4D6D", roles: ["muchacha bonita", "novia", "princesa", "bonita"], head: "piel roja fresa con semillitas doradas; tiara de hojas verdes de fresa" },
  { fruit: "coco joven", emoji: "🥥", color: "B6F08A", roles: ["niño", "hijo", "nieto", "pequeño"], head: "piel verde tierno lisa de coco joven; mechón con textura de fibra clara" },
  { fruit: "guanábana", emoji: "🍈", color: "B6F08A", roles: ["abuela", "anciana", "sabia"], head: "piel verde guanábana con pequitas en relieve suave; flor blanca en el moño canoso" },
];
export const NARRATOR_COLOR = "FFFFFF";

export const FRUIT_CAST_RULES = `
REGLAS DEL ELENCO DE FRUTAS (obligatorias):
- Aspecto (obligatorio): ${FRUIT_LOOK}
- La fruta encaja con el personaje: plátano = el humilde del barrio, el motoconchista; coco = el rico, el papá estricto (sombrero panamá); aguacate = la madre trabajadora; chinola o limón = la joven orgullosa; manzana = el niño rico y arrogante; piña = la señora chismosa o la suegra; guayaba = la amiga leal; mango = el galán; fresa = la muchacha bonita.
- Nombres dominicanos con la fruta: Platanito, Coquita, Don Coco, Doña Aguacate, Manguito, Guayabita, Julián Manzana, Doña Piña. Nunca "Protagonista", "Antagonista" ni nombres solo humanos.
- Todos tienen cabello humano realista. Vestuario elegante y siempre de manga larga: nada de bikinis, toallas, escotes ni tirantes. No usar personajes de marcas.
- La ropa de cada personaje es FIJA en toda la serie y tiene un color propio reconocible.
- Colores de subtítulo (hex sin #) por fruta: plátano FFE14D, coco D9A066, aguacate 5BC94A, chinola FFD23F, manzana FF4D6D, piña F2C14E, guayaba FF6B81, mango FF9A1F, fresa FF4D6D, coco joven B6F08A, narrador FFFFFF. Si dos personajes coinciden en color, usa otro distinto.
`.trim();

export const CHRISTIAN_RULES = `
REGLAS CRISTIANAS (público pentecostal/evangélico):
- La iglesia es evangélica sencilla: púlpito de madera, cruz lisa sin cristo, Biblia, bancos.
- PROHIBIDO poner santos, vírgenes, altares, velas votivas, rosarios o cuadros religiosos, ni en la iglesia ni en la casa. Esto se evita al generar (va dentro de cada prompt de escena), nunca se difumina después.
- Estructura: pecado u orgullo -> caída -> regreso a Dios o a la familia -> frase final del narrador -> "Escribe AMÉN".
`.trim();
// Va dentro de CADA prompt de escena cristiana (público pentecostal). «Si aparece» evita que el
// generador ponga un púlpito en escenas de casa o de calle.
export const CHRISTIAN_SCENE_GUARD = "iglesia (si aparece): evangélica sencilla, con púlpito de madera, cruz lisa sin cristo, Biblia y bancos. Sin imágenes de santos ni de la Virgen, sin altares, sin velas votivas, sin rosarios ni cuadros religiosos, tampoco en la casa";
