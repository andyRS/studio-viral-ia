"use client";
export default function GenerationStatus({ label, detail, children }: { label: string; detail?: string; children?: React.ReactNode }) {
  return <div className="generation-status" role="status" aria-live="polite"><span className="generation-indicator" aria-hidden="true" /><div className="min-w-0 flex-1"><strong>{label}</strong><p>{detail || "La solicitud está en curso. El resultado aparecerá cuando termine; no hay información de progreso por etapas."}</p>{children}</div></div>;
}
