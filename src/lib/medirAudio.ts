"use client";
// Duración real de un clip y de su voz, medida en el navegador (sin subir nada ni gastar créditos):
// se decodifica el audio y se buscan el primer y el último tramo con energía de voz (ventanas de 20 ms).
// El montaje con Whisper (subtitular.py) vuelve a medir palabra por palabra; esto sirve para planificar.
import type { Medicion } from "./tiempos";

export function vozEnMuestras(datos: Float32Array, frecuencia: number, ventana = 0.02): { inicio: number | null; fin: number | null } {
  const paso = Math.max(1, Math.round(frecuencia * ventana));
  const rms: number[] = [];
  for (let i = 0; i < datos.length; i += paso) { let s = 0; const f = Math.min(datos.length, i + paso); for (let j = i; j < f; j++) s += datos[j] * datos[j]; rms.push(Math.sqrt(s / Math.max(1, f - i))); }
  const max = Math.max(0, ...rms);
  if (max < 0.01) return { inicio: null, fin: null };
  // Umbral relativo al pico (y nunca por debajo de -40 dB): el ambiente queda por debajo, la voz por encima.
  const umbral = Math.max(max * 0.18, 0.01);
  // La voz debe sostenerse ≥ 100 ms para contar (evita golpes sueltos).
  const sostenida = (k: number) => rms.slice(k, k + 5).filter(x => x >= umbral).length >= 4;
  let a = -1, b = -1;
  for (let k = 0; k < rms.length; k++) if (sostenida(k)) { a = k; break; }
  for (let k = rms.length - 1; k >= 0; k--) if (rms[k] >= umbral && (k < 4 || sostenida(k - 4))) { b = k; break; }
  if (a < 0 || b < 0) return { inicio: null, fin: null };
  return { inicio: Math.round(a * ventana * 100) / 100, fin: Math.round((b + 1) * ventana * 100) / 100 };
}

export async function medirClip(file: File): Promise<Medicion> {
  const Ctx: typeof AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
  const ctx = new Ctx();
  try {
    const buf = await ctx.decodeAudioData(await file.arrayBuffer());
    const canal = buf.getChannelData(0);
    const { inicio, fin } = vozEnMuestras(canal, buf.sampleRate);
    return { video: Math.round(buf.duration * 100) / 100, vozInicio: inicio, vozFin: fin };
  } finally { void ctx.close(); }
}
