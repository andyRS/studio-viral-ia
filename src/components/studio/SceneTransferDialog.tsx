"use client";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { isProtected, type Outline } from "@/lib/outline";

/** Integration boundary: the data agent applies and records this intent on the latest outline. */
export type SceneTransferRequest = {
  sceneId: string;
  sourceSequenceId: string;
  targetSequenceId: string;
  /** Stable destination anchor, or null to append. Never an array index. */
  beforeSceneId: string | null;
};
export type ConfirmSceneTransfer = (request: SceneTransferRequest) => Promise<void>;

export default function SceneTransferDialog({ outline, sceneId, onClose, onConfirm, busy = false }: {
  outline: Outline; sceneId: string; onClose: () => void; onConfirm?: ConfirmSceneTransfer; busy?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const [targetId, setTargetId] = useState("");
  const [beforeId, setBeforeId] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [mounted, setMounted] = useState(false);
  const submitting = useRef(false);
  const origin = outline.acts.flatMap(act => act.sequences.map(sequence => ({ act, sequence }))).find(item => item.sequence.scenes.some(scene => scene.id === sceneId));
  const scene = origin?.sequence.scenes.find(item => item.id === sceneId);
  const sequences = origin?.act.sequences.filter(sequence => sequence.id !== origin.sequence.id) || [];
  const destination = sequences.find(sequence => sequence.id === targetId);
  const locked = !scene || isProtected(outline, sceneId) || !!destination?.locked || !!destination?.scenes.some(item => item.locked);
  const anchorMissing = !!beforeId && !destination?.scenes.some(item => item.id === beforeId);
  const allowed = !!onConfirm && !!origin && !!destination && !locked && !anchorMissing && !busy && !pending;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    setMounted(true);
    return () => { if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, []);
  useEffect(() => { if (mounted) dialog.current?.showModal(); }, [mounted]);

  async function confirm() {
    if (!allowed || !onConfirm || !origin || !destination || submitting.current) return;
    submitting.current = true; setPending(true); setError("");
    try {
      await onConfirm({ sceneId, sourceSequenceId: origin.sequence.id, targetSequenceId: destination.id, beforeSceneId: beforeId || null });
      onClose();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "No se pudo trasladar la escena. Puedes volver a intentarlo.");
      setPending(false);
    } finally { submitting.current = false; }
  }

  if (!mounted) return null;
  return createPortal(<dialog ref={dialog} className="scene-transfer" aria-labelledby={titleId} aria-describedby={descriptionId}
    onCancel={event => { if (submitting.current) event.preventDefault(); else onClose(); }}>
    <header className="transfer-header"><div><p className="studio-eyebrow">DIRECCIÓN / CAMBIAR DE SECUENCIA</p><h2 id={titleId}>Encuentra su nuevo lugar.</h2><p id={descriptionId}>Elige una secuencia del mismo acto y revisa dónde quedaría la escena.</p></div><button type="button" className="sd-iconbtn" aria-label="Cerrar selector de destino" disabled={pending} onClick={onClose}>✕</button></header>
    <div className="transfer-body">
      <section className="transfer-source" aria-label="Escena de origen"><span className="transfer-step">01 / ORIGEN</span><p>{origin?.act.title || "Acto no disponible"} <span> / {origin?.sequence.title || "Secuencia no disponible"}</span></p><h3>{scene?.heading || "La escena ya no está disponible"}</h3><p>{scene?.summary}</p><div className="transfer-source-chips"><span>{scene?.tomas?.length || 0} tomas asociadas</span><span>{scene?.script?.length ? "Con guion" : "Sin guion"}</span><span>{scene && isProtected(outline, sceneId) ? "🔒 Bloqueada" : "Escena editable"}</span></div></section>
      <div className="transfer-destination"><span className="transfer-step">02 / DESTINO</span>
        <label htmlFor={`${titleId}-sequence`}>Secuencia de destino</label>
        <select id={`${titleId}-sequence`} value={targetId} disabled={pending || !scene || isProtected(outline, sceneId)} onChange={event => { setTargetId(event.target.value); setBeforeId(""); setError(""); }}>
          <option value="">Elegir secuencia…</option>{sequences.map(sequence => <option key={sequence.id} value={sequence.id} disabled={sequence.locked || sequence.scenes.some(item => item.locked)}>{sequence.title}{sequence.locked ? " · bloqueada" : sequence.scenes.some(item => item.locked) ? " · contiene escenas bloqueadas" : ` · ${sequence.scenes.length} escenas`}</option>)}
        </select>
        {!sequences.length && <p className="transfer-note">Este acto necesita otra secuencia para ofrecer un destino.</p>}
        {destination ? <>
          <label htmlFor={`${titleId}-position`}>Ubicación dentro de la secuencia</label><select id={`${titleId}-position`} value={beforeId} disabled={pending || locked} onChange={event => { setBeforeId(event.target.value); setError(""); }}><option value="">Al final de la secuencia</option>{destination.scenes.map(item => <option key={item.id} value={item.id}>Antes de {item.heading}</option>)}</select>
          <div className="transfer-preview" aria-label="Vista previa del destino"><div className="transfer-preview-heading"><strong>{destination.title}</strong><span>VISTA PREVIA</span></div><ol>{(() => {
            const preview = [...destination.scenes];
            if (scene && !anchorMissing) preview.splice(beforeId ? preview.findIndex(item => item.id === beforeId) : preview.length, 0, scene);
            return preview.map(item => <li key={item.id} data-incoming={item.id === sceneId}><span aria-hidden="true">{item.id === sceneId ? "↳" : "—"}</span><div><strong>{item.heading}</strong><small>{item.id === sceneId ? "Tu escena aparecería aquí" : `${item.tomas?.length || 0} tomas`}</small></div></li>);
          })()}</ol></div>
        </> : <div className="transfer-empty"><span aria-hidden="true">↗</span><h3>Una nueva posición, la misma escena.</h3><p>Selecciona el destino para ver sus escenas y el punto de inserción.</p></div>}
      </div>
    </div>
    <footer className="transfer-footer"><div>
      {!onConfirm ? <p className="transfer-note">Vista previa: el traslado entre secuencias aún no está disponible.</p>
        : locked ? <p className="transfer-note">Desbloquea el origen y el destino antes de trasladar.</p>
        : anchorMissing ? <p className="transfer-note">El destino cambió. Elige de nuevo la ubicación.</p>
        : <p className="transfer-note">Revisa el orden y confirma el traslado.</p>}
      {error && <p role="alert" className="transfer-error">{error}</p>}{pending && <p role="status" className="transfer-note">Trasladando la escena…</p>}
    </div><div className="transfer-footer-actions"><button type="button" className="studio-secondary-action" disabled={pending} onClick={onClose}>Cancelar</button><button type="button" className="studio-primary-action" disabled={!allowed} onClick={() => void confirm()}>{pending ? "Trasladando…" : "Confirmar traslado →"}</button></div></footer>
  </dialog>, document.body);
}
