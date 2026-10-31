// Biblia extendida del personaje: lo que nunca cambia entre escenas y episodios (rostro, cuerpo, paleta, voz),
// variantes de vestuario permitidas, relaciones y un candado de identidad. Va a la IA del proyecto largo
// y, en la fase 4, a los prompts de imagen y vídeo.
export type CharacterBible = {
  rasgos?: string;          // rasgos invariables: rostro, edad, complexión, cicatrices, pelo
  vestuario?: string[];     // variantes permitidas («túnica de lino gris del exilio», «manto real de Babilonia»)
  paleta?: string;          // colores propios del personaje
  negativo?: string;        // lo que nunca debe aparecer («barba larga», «ropa moderna»)
  voz?: string;             // timbre, idioma y acento
  relaciones?: string;      // «hermano de…», «enemigo de…»
  candado?: boolean;        // identidad bloqueada: la IA no puede proponer cambios de aspecto
  versiones?: { at: string; nota: string }[];
};

export const normBible = (b: any): CharacterBible => ({
  rasgos: String(b?.rasgos || ""), vestuario: Array.isArray(b?.vestuario) ? b.vestuario.map(String).filter(Boolean) : [],
  paleta: String(b?.paleta || ""), negativo: String(b?.negativo || ""), voz: String(b?.voz || ""), relaciones: String(b?.relaciones || ""),
  candado: !!b?.candado, versiones: Array.isArray(b?.versiones) ? b.versiones.slice(-20) : [],
});

// Una línea compacta por personaje para la IA.
export function bibliaTexto(c: any): string {
  if (!c?.name) return "";
  const b = normBible(c.bible);
  return [
    c.name, c.role && `papel: ${c.role}`, (b.rasgos || c.visualES) && `rasgos fijos: ${b.rasgos || c.visualES}`,
    c.clothing && `vestuario base: ${c.clothing}`, b.vestuario?.length ? `variantes de vestuario permitidas: ${b.vestuario.join(" | ")}` : "",
    b.paleta && `paleta: ${b.paleta}`, (b.voz || c.speechStyle) && `voz: ${b.voz || c.speechStyle}`, b.relaciones && `relaciones: ${b.relaciones}`,
    b.negativo && `nunca: ${b.negativo}`, b.candado ? "IDENTIDAD BLOQUEADA: no cambiar su aspecto" : "",
  ].filter(Boolean).join(" · ");
}
