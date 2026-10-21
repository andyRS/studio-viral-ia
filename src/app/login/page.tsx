"use client";

import { useRef, useState, type FormEvent } from "react";
import { createClient, hasSupabase } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [msgType, setMsgType] = useState<"error" | "success">("success");
  const [busy, setBusy] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!hasSupabase()) {
      setMsgType("error");
      setMsg("Supabase no está configurado. Puedes usar la app en modo local.");
      return;
    }
    setBusy(true);
    setMsg("");
    try {
      const { error } = await createClient().auth.signInWithPassword({ email, password });
      setMsgType(error ? "error" : "success");
      setMsg(error ? error.message : "¡Bienvenido! Entrando…");
      if (!error) window.location.href = "/";
    } catch {
      setMsgType("error");
      setMsg("No se pudo completar el inicio de sesión. Inténtalo de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  async function register() {
    if (!formRef.current?.reportValidity()) return;
    if (!hasSupabase()) {
      setMsgType("error");
      setMsg("Supabase no está configurado. Puedes usar la app en modo local.");
      return;
    }
    setBusy(true);
    setMsg("");
    try {
      const { error } = await createClient().auth.signUp({ email, password });
      setMsgType(error ? "error" : "success");
      setMsg(error ? error.message : "Revisa tu correo para confirmar la cuenta.");
    } catch {
      setMsgType("error");
      setMsg("No se pudo crear la cuenta. Inténtalo de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  return <main className="grid min-h-screen place-items-center px-4 py-10 sm:px-6">
    <div className="w-full max-w-md">
      <div className="flex flex-col items-center text-center">
        <span className="studio-brand-mark !h-14 !w-14 !rounded-2xl !text-lg" aria-hidden="true"><span>EV</span></span>
        <p className="studio-eyebrow mt-5 text-[#FFBF65]">Creative Intelligence Studio</p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-white">Estudio Viral</h1>
        <p className="mt-2 max-w-sm text-sm leading-6 text-slate-300">Entra para guardar tus proyectos y acceder a las funciones de IA de tu cuenta.</p>
      </div>

      <form ref={formRef} onSubmit={submit} className="studio-panel mt-7 space-y-4 p-5 sm:p-6">
        <div><label htmlFor="login-email" className="field-label block">Correo electrónico</label><input id="login-email" type="email" placeholder="correo@ejemplo.com" value={email} onChange={event => setEmail(event.target.value)} required autoComplete="email" /></div>
        <div><label htmlFor="login-password" className="field-label block">Contraseña</label><input id="login-password" type="password" placeholder="Tu contraseña" value={password} onChange={event => setPassword(event.target.value)} required autoComplete="current-password" /></div>
        <div className="space-y-2 pt-1">
          <button type="submit" disabled={busy} className="min-h-11 w-full rounded-xl bg-[#FF9F1C] px-4 py-2.5 text-sm font-bold text-[#090D16] hover:brightness-110">{busy ? "Un momento…" : "Iniciar sesión"}</button>
          <button type="button" disabled={busy} onClick={register} className="min-h-11 w-full rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold text-slate-100 hover:bg-white/10">Crear cuenta</button>
        </div>
        {msg && <p role={msgType === "error" ? "alert" : "status"} className={`rounded-xl border p-3 text-sm ${msgType === "error" ? "border-rose-400/25 bg-rose-400/10 text-rose-200" : "border-emerald-400/25 bg-emerald-400/10 text-emerald-200"}`}>{msg}</p>}
      </form>
      <a href="/" className="mt-5 block rounded-lg py-2 text-center text-sm font-semibold text-slate-300 hover:text-white">Continuar en modo local sin sesión →</a>
    </div>
  </main>;
}
