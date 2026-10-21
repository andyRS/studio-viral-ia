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
`.trim();
