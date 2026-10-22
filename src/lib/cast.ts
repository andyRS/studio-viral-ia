// Elenco: normaliza los personajes que devuelve la IA, repara los que vienen sin fruta
// o con nombre genérico, y crea el elenco de la plantilla local. Sin dependencias de servidor.
import { FRUIT_CATALOG, type FruitInfo, type StyleKey } from "./knowledge";

export interface CastMember {
  name: string; role: string; fruit?: string; fruitEmoji?: string; headES?: string;
  visualES: string; visualEN: string; clothing: string; voice: string; speechStyle: string;
  subtitleColor: string; pronunciations: string[]; flowPrompt: string;
}

// Colores de reserva cuando dos personajes coinciden (hex sin #).
export const PALETTE = ["FF9A1F", "C08BFF", "5BC94A", "FF4D6D", "FFD23F", "4DD0E1", "B6F08A", "D9A066", "FF6B81", "F2C14E"];

export const isFruitStyle = (style?: string) => style !== "cine90";
const clean = (v: unknown) => String(v ?? "").trim();
export const norm = (v: unknown) => clean(v).toLocaleLowerCase("es").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9ñ ]+/g, " ").replace(/\s+/g, " ").trim();

const GENERIC_NAME = /^(el |la )?(protagonista|antagonista|personaje|rival|villano|villana|madre|padre|hija|hijo|hombre|mujer|chico|chica|joven|narrador)( principal| secundario| rival)?( \d+)?$/i;
export const isGenericName = (name: string) => !clean(name) || GENERIC_NAME.test(norm(name));

export function fruitInfo(fruit?: string): FruitInfo | undefined {
  const f = norm(fruit);
  if (!f) return undefined;
  // "coco joven" antes que "coco": se prueba primero la coincidencia más larga.
  return [...FRUIT_CATALOG].sort((a, b) => b.fruit.length - a.fruit.length).find(x => f.includes(norm(x.fruit)));
}

// Fruta según el rol y el nombre (p. ej. "Don Coco", "la madre trabajadora"), evitando repetir.
export function fruitForRole(text: string, used: Set<string>): FruitInfo {
  const t = norm(text);
  const byName = FRUIT_CATALOG.find(f => t.includes(norm(f.fruit)) && !used.has(f.fruit));
  if (byName) return byName;
  const scored = FRUIT_CATALOG.filter(f => !used.has(f.fruit))
    .map(f => ({ f, score: f.roles.filter(r => t.includes(norm(r))).length }))
    .sort((a, b) => b.score - a.score);
  return scored[0]?.f || FRUIT_CATALOG[0];
}

const FRUIT_NAMES: Record<string, string[]> = {
  "plátano": ["Platanito", "Platanín"], coco: ["Don Coco", "Coquito"], aguacate: ["Doña Aguacate", "Aguacatita"],
  chinola: ["Chinolita", "Chinola"], "limón": ["Limoncito", "Limona"], manzana: ["Julián Manzana", "Manzanita"],
  "piña": ["Doña Piña", "Piñita"], guayaba: ["Guayabita", "Guayaba"], mango: ["Manguito", "Mango"],
  fresa: ["Fresita", "Coquita"], "coco joven": ["Coquito", "Coquín"], "guanábana": ["Doña Guanábana", "Guanabita"],
};
function fruitName(fruit: string, used: Set<string>) {
  const options = FRUIT_NAMES[fruit] || [fruit[0].toUpperCase() + fruit.slice(1)];
  return options.find(n => !used.has(norm(n))) || `${options[0]} ${used.size + 1}`;
}

const FEMALE = /\b(madre|mama|hija|abuela|novia|muchacha|joven rica|señora|senora|doña|dona|esposa|suegra|vecina|amiga|hermana|ella|bonita|vendedora|chica|mujer|princesa)\b/;
const DIALECT_PRON: [RegExp, string][] = [
  [/tígue?re|tiguere/i, "tíguere = TÍ-gue-re, nunca tigre"],
  [/yipeta/i, "yipeta = yi-PE-ta"],
  [/\bvaina\b/i, "vaina = VAI-na, nunca baila"],
  [/piña/i, "Piña = PI-ña, nunca Pina"],
  [/cualto/i, "mi cualto = con L, nunca cuartos"],
  [/jevito|jevita/i, "jevito = je-VI-to"],
  [/guanábana/i, "guanábana = gua-NÁ-ba-na"],
];
export function dialectPronunciations(text: string) {
  return DIALECT_PRON.filter(([re]) => re.test(text)).map(([, p]) => p);
}

export function flowPromptFor(c: Pick<CastMember, "name" | "fruit" | "headES" | "clothing" | "role" | "visualES" | "visualEN">, style: StyleKey) {
  if (!isFruitStyle(style)) {
    return `Photorealistic 1990s Dominican romance film character sheet, full body, standing, neutral grey background, vertical 9:16, 35mm film grain, warm light. ${c.visualEN || c.visualES}. Outfit: ${c.clothing}. Real human, natural skin, no text.`;
  }
  const trait = c.role ? `${c.role}` : "expresiva";
  return `Personaje 3D estilo Pixar premium, cuerpo entero, de pie, fondo gris neutro, vertical 9:16. Su cabeza es entera una ${c.fruit}: ${c.headES}. ${c.clothing}. Expresión: ${trait}. Cuerpo humano con manos. Nunca cara humana. Sin texto.`;
}

// Normaliza el elenco. Si al de frutas le falta la fruta o tiene un nombre genérico, la asigna
// en el código según el rol y completa cabeza, emoji, color y ficha de Flow.
export function normalizeCast(list: unknown, style: StyleKey, opts: { taken?: CastMember[] } = {}): CastMember[] {
  const rows = Array.isArray(list) ? list.filter(r => r && typeof r === "object") : [];
  const taken = opts.taken || [];
  const usedFruits = new Set<string>(taken.map(c => fruitInfo(c.fruit)?.fruit || "").filter(Boolean));
  const usedNames = new Set<string>(taken.map(c => norm(c.name)));
  const usedColors = new Set<string>(taken.map(c => c.subtitleColor.replace("#", "").toUpperCase()));
  const fruitStory = isFruitStyle(style);
  return rows.map((row: any, i) => {
    const role = clean(row.role) || (i === 0 ? "protagonista" : "");
    let name = clean(row.name);
    const context = `${name} ${role} ${clean(row.visualES)} ${clean(row.speechStyle)}`;
    let fruit: FruitInfo | undefined;
    if (fruitStory) {
      fruit = fruitInfo(row.fruit) || fruitInfo(name);
      if (!fruit || usedFruits.has(fruit.fruit) && !fruitInfo(row.fruit)) fruit = fruitForRole(context, usedFruits);
      usedFruits.add(fruit.fruit);
      if (isGenericName(name)) name = fruitName(fruit.fruit, usedNames);
    } else if (isGenericName(name)) {
      name = ["Elena", "Rafael", "Doña Carmen", "Julián", "Marisol", "Don Ernesto"][i % 6];
    }
    if (usedNames.has(norm(name))) name = `${name} ${i + 1}`;
    usedNames.add(norm(name));

    const fruitName_ = fruitStory ? clean(row.fruit) && fruitInfo(row.fruit) ? clean(row.fruit) : fruit!.fruit : undefined;
    const headES = fruitStory ? (clean(row.headES) || fruit!.head) : undefined;
    const female = FEMALE.test(norm(context));
    const clothing = clean(row.clothing) || (female ? "blusa de manga larga y falda por debajo de la rodilla" : "camisa de manga larga y pantalón de tela");
    let hex = clean(row.subtitleColor).replace("#", "").toUpperCase();
    if (!/^[0-9A-F]{6}$/.test(hex)) hex = fruit?.color || PALETTE[i % PALETTE.length];
    if (usedColors.has(hex)) hex = PALETTE.find(p => !usedColors.has(p)) || hex;
    usedColors.add(hex);

    const hair = fruitStory && female ? " Cabello humano realista sobre la cabeza de fruta." : "";
    const visualES = fruitStory
      ? `Cabeza entera de ${fruitName_}: ${headES}.${hair} Cuerpo humano con manos; nunca cara humana.`
      : clean(row.visualES) || "Persona dominicana de los 90 con rasgos naturales.";
    const voice = clean(row.voice) || (female ? "mujer, voz cálida y expresiva" : "hombre, voz firme y cercana");
    const pronunciations = Array.from(new Set([
      ...(Array.isArray(row.pronunciations) ? row.pronunciations.map(clean).filter(Boolean) : []),
      ...dialectPronunciations(name),
    ]));
    const member: CastMember = {
      name, role: role || "personaje", fruit: fruitName_, fruitEmoji: fruitStory ? (clean(row.fruitEmoji) || fruit!.emoji) : undefined, headES,
      visualES, visualEN: clean(row.visualEN), clothing, voice, speechStyle: clean(row.speechStyle) || voice,
      subtitleColor: `#${hex}`, pronunciations, flowPrompt: "",
    };
    member.flowPrompt = clean(row.flowPrompt) && /nunca cara humana|real human/i.test(row.flowPrompt) ? clean(row.flowPrompt) : flowPromptFor(member, style);
    return member;
  });
}

// ¿Hace falta pedirle a la IA que repare el elenco? (antes de que lo arregle el código)
export function castNeedsRepair(list: unknown, style: StyleKey) {
  const rows = Array.isArray(list) ? list : [];
  if (rows.length < 2) return true;
  return rows.some((r: any) => isGenericName(r?.name) || (isFruitStyle(style) && !fruitInfo(r?.fruit) && !fruitInfo(r?.name)));
}

// Elenco por defecto de la plantilla local, según palabras de la idea.
export function templateCast(idea: string, style: StyleKey): CastMember[] {
  const t = norm(idea);
  if (!isFruitStyle(style)) {
    return normalizeCast([
      { name: "Elena", role: "protagonista", visualES: "Mujer de 28 años, cabello castaño ondulado de los 90, mirada intensa", visualEN: "28-year-old Dominican woman, wavy brown 90s hair, intense eyes", clothing: "blusa blanca de manga larga y falda larga beige", voice: "mujer joven, voz suave y emotiva" },
      { name: "Rafael", role: "galán", visualES: "Hombre de 32 años, bigote fino, peinado hacia atrás", visualEN: "32-year-old Dominican man, thin mustache, slicked-back hair", clothing: "camisa de lino crema y pantalón de pinzas", voice: "hombre, voz grave y pausada" },
      { name: "Doña Carmen", role: "madre", visualES: "Mujer de 60 años, moño gris, gesto severo", visualEN: "60-year-old Dominican woman, grey bun, stern look", clothing: "vestido azul marino de manga larga y collar de perlas", voice: "mujer mayor, voz firme" },
    ], style);
  }
  const rows: any[] = [];
  const has = (...w: string[]) => w.some(x => t.includes(x));
  if (has("moto", "barrio", "pobre", "humilde", "platano")) rows.push({ role: "protagonista humilde, motoconchista", fruit: "plátano", clothing: "camisa de cuadros de manga larga, jeans y casco de motor en la mano", voice: "hombre joven, voz alegre y de barrio" });
  if (has("rica", "rico", "piantini", "millonari", "papa", "padre")) rows.push({ role: "papá rico y estricto", fruit: "coco", clothing: "guayabera blanca de manga larga, pantalón de lino y sombrero panamá", voice: "hombre mayor, voz grave y autoritaria" });
  if (has("rica", "muchacha", "novia", "enamora")) rows.push({ role: "muchacha bonita de familia rica", fruit: "fresa", clothing: "blusa rosada de manga larga y falda midi blanca", voice: "mujer joven, voz dulce y decidida" });
  if (has("madre", "mama", "vende", "dulce", "abuela")) rows.push({ role: "madre trabajadora", fruit: "aguacate", clothing: "blusa floreada de manga larga, delantal y pañuelo en el cabello", voice: "mujer mayor, voz cálida y temblorosa" });
  if (has("hija", "niega", "verguenza", "colegio", "orgull")) rows.push({ role: "hija joven y orgullosa", fruit: "chinola", clothing: "uniforme escolar: camisa blanca de manga larga y falda azul marino", voice: "mujer joven, voz orgullosa que se quiebra" });
  if (has("iglesia", "dios", "pastor", "fe")) rows.push({ role: "amiga leal de la iglesia", fruit: "guayaba", clothing: "blusa lila de manga larga y falda larga gris", voice: "mujer, voz serena y tierna" });
  if (has("chisme", "vecina", "suegra")) rows.push({ role: "vecina chismosa", fruit: "piña", clothing: "bata de casa de manga larga y rolos en el cabello", voice: "mujer mayor, voz chillona y exagerada" });
  // Mínimo 3 personajes: completa con protagonista, rival y amiga si la idea no da pistas.
  const defaults = [
    { role: "protagonista humilde", fruit: "plátano", clothing: "camisa de cuadros de manga larga y jeans", voice: "hombre joven, voz alegre" },
    { role: "rival rico y arrogante", fruit: "manzana", clothing: "camisa polo de manga larga y reloj dorado", voice: "hombre joven, voz presumida" },
    { role: "amiga leal", fruit: "guayaba", clothing: "blusa verde de manga larga y jeans", voice: "mujer joven, voz alegre y sincera" },
  ];
  for (const d of defaults) { if (rows.length >= 3) break; if (!rows.some(r => r.fruit === d.fruit)) rows.push(d); }
  return normalizeCast(rows.slice(0, 6), style);
}
