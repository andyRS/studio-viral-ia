"use client";
// Aviso estándar cuando una ruta de IA responde 401/503 (protegidas con
// sesión): el módulo no se rompe, explica y enlaza a /login. En modo sin
// login cada módulo ofrece además su plantilla local SOLO en cliente.
export default function AiAuthNotice({ onLocalTemplate }: { onLocalTemplate?: () => void }) {
  return (
    <div className="mt-3 rounded bg-red-900/40 border border-red-700 p-3 text-sm">
      <p>🔒 <b>Inicia sesión para usar la IA.</b> Las rutas de IA están protegidas: sin sesión devuelven 401.</p>
      <div className="flex gap-3 mt-2 flex-wrap">
        <a href="/login" className="underline text-amber-300 font-bold">Ir a iniciar sesión →</a>
        {onLocalTemplate && <button onClick={onLocalTemplate} className="underline text-slate-200">Usar modo plantilla local (solo en este dispositivo, sin IA)</button>}
      </div>
    </div>
  );
}
