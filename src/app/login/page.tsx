"use client";
import { useState } from "react";
import { createClient, hasSupabase } from "@/lib/supabase/client";
export default function LoginPage() {
  const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(false);
  async function submit(e: any) {
    e.preventDefault();
    if (!hasSupabase()) { setMsg("Supabase no está configurado. Puedes usar la app en modo local."); return; }
    setBusy(true); const { error } = await createClient().auth.signInWithPassword({ email, password }); setBusy(false);
    setMsg(error ? error.message : "¡Bienvenido! Entrando…"); if (!error) window.location.href = "/";
  }
  async function register() {
    if (!hasSupabase()) return setMsg("Configura NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY primero.");
    setBusy(true); const { error } = await createClient().auth.signUp({ email, password }); setBusy(false);
    setMsg(error ? error.message : "Revisa tu correo para confirmar la cuenta.");
  }
  return (
    <main className="grid min-h-screen place-items-center px-5">
      <div className="w-full max-w-sm">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-600 text-lg font-black text-black shadow-lg shadow-orange-900/40">EV</div>
        <h1 className="mt-5 text-center text-2xl font-extrabold tracking-tight">Estudio Viral</h1>
        <p className="mt-1 text-center text-sm text-slate-400">Inicia sesión para guardar tus series y usar la IA</p>
        <form onSubmit={submit} className="mt-7 space-y-3 rounded-2xl border border-white/10 bg-white/[.03] p-5">
          <input type="email" placeholder="correo@ejemplo.com" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" />
          <input type="password" placeholder="Contraseña" value={password} onChange={e => setPassword(e.target.value)} required autoComplete="current-password" />
          <button disabled={busy} className="w-full rounded bg-amber-500 py-2.5 font-bold text-black">{busy ? "Un momento…" : "Entrar"}</button>
          <button type="button" disabled={busy} onClick={register} className="w-full rounded-xl border border-white/10 py-2.5 text-sm text-slate-200 hover:bg-white/5">Crear cuenta</button>
          {msg && <p className="text-sm text-amber-300">{msg}</p>}
        </form>
        <a href="/" className="mt-5 block text-center text-sm text-slate-400 hover:text-white">Usar en modo local sin sesión →</a>
      </div>
    </main>
  );
}
