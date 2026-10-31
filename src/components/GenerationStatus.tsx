"use client";
import { useEffect, useState } from "react";
// Estado honesto de una generación: no hay etapas ni porcentajes reales (las rutas responden al final),
// así que solo se muestra qué se hace y cuánto tiempo lleva.
export default function GenerationStatus({ label, detail, children }: { label: string; detail?: string; children?: React.ReactNode }) {
  const [seg, setSeg] = useState(0);
  useEffect(() => { const t0 = Date.now(); const i = setInterval(() => setSeg(Math.round((Date.now() - t0) / 1000)), 1000); return () => clearInterval(i); }, []);
  const lleva = seg >= 5 ? ` · lleva ${Math.floor(seg / 60)}:${String(seg % 60).padStart(2, "0")}` : "";
  return <div className="generation-status" role="status" aria-live="polite"><span className="generation-indicator" aria-hidden="true" /><div className="min-w-0 flex-1"><strong>{label}<span className="font-normal opacity-70" aria-hidden="true">{lleva}</span></strong><p>{detail || "La solicitud está en curso. El resultado aparecerá cuando termine; no hay información de progreso por etapas."}{seg >= 90 ? " Está tardando más de lo normal: el servidor corta a los 3 minutos." : ""}</p>{children}</div></div>;
}
