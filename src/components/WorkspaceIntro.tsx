import type { ReactNode } from "react";

/** Shared presentation for the measurement and publishing desks. */
export default function WorkspaceIntro({ eyebrow, title, description, index, children }: {
  eyebrow: string; title: string; description: string; index: string; children?: ReactNode;
}) {
  return <header className="growth-intro">
    <div className="growth-intro-copy"><p className="studio-eyebrow">{eyebrow}</p><h2>{title}</h2><p>{description}</p></div>
    <div className="growth-intro-side"><span className="growth-intro-index" aria-hidden="true">{index}</span>{children}</div>
  </header>;
}

export function WorkspaceLoading({ label }: { label: string }) {
  return <section className="growth-workspace growth-loading" aria-busy="true" aria-label={label}>
    <p className="studio-eyebrow">{label}</p><p role="status">Cargando tu espacio…</p>
    <div aria-hidden="true"><span className="studio-skeleton" /><span className="studio-skeleton" /><span className="studio-skeleton" /></div>
  </section>;
}
