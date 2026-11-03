"use client";
import { useEffect, useState } from "react";
import { useData } from "@/lib/DataContext";
import { CAMBIO_MONTAJES, guardarMontaje, leerMontajes, olvidarMontaje, PC_MONTAJE, seguirMontaje, type MontajeGuardado } from "@/lib/montajesGuardados";

function Trabajo({ trabajo, cuenta }: { trabajo: MontajeGuardado; cuenta: string }) {
  const [estado, setEstado] = useState<any>(null);
  const [error, setError] = useState("");
  const [intento, setIntento] = useState(0);
  useEffect(() => {
    const abortar = new AbortController();
    async function seguir() {
      setError("");
      try {
        const dato=await seguirMontaje(trabajo,abortar.signal,setEstado);
        if(dato && !abortar.signal.aborted)try { if(trabajo.estado!==dato.estado)guardarMontaje(cuenta,{...trabajo,estado:dato.estado}); }catch{/* el seguimiento sigue visible */}
      } catch (e: any) { if (!abortar.signal.aborted) setError(e instanceof TypeError ? "No hay conexión con el servidor. El trabajo puede seguir allí: comprueba que el PC y «Montar en mi PC» sigan abiertos y pulsa Reconectar." : e?.message || "No hay conexión con el servidor. El trabajo puede seguir allí."); }
    }
    void seguir(); return () => abortar.abort();
  }, [trabajo, cuenta, intento]); // conserva el seguimiento al cambiar de módulo
  const porcentaje = typeof estado?.pct === "number" ? Math.max(0, Math.min(100, estado.pct)) : null;
  return <article className="recovered-job"><header><h3>{trabajo.titulo}</h3><span>{trabajo.base === PC_MONTAJE ? "Este PC" : "Nube"}</span></header>
    <p>{estado?.paso || "Consultando el progreso real…"}</p>
    {porcentaje !== null && <><div role="progressbar" aria-label={`Progreso de ${trabajo.titulo}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={porcentaje}><span style={{width:`${porcentaje}%`}} /></div><strong>{porcentaje}% · {error ? "última lectura recibida" : estado.estado}</strong></>}
    {error && <p role="alert">{error}</p>}{estado?.estado === "error" && <p role="alert">{estado.error || "El montaje falló."}</p>}
    {estado?.estado === "listo" && <div className="recovered-downloads"><a href={`${trabajo.base}/trabajos/${trabajo.id}/video`}>Descargar vídeo</a>{estado.segunda && <a href={`${trabajo.base}/trabajos/${trabajo.id}/video?v=2`}>Segunda versión</a>}{(estado.extras || []).map((x:any,k:number) => <a key={k} href={`${trabajo.base}/trabajos/${trabajo.id}/extra/${k}`}>{x.red || "Versión"} {x.parte || k+1}</a>)}</div>}
    {estado?.log?.length > 0 && <details><summary>Últimos pasos</summary><ol>{estado.log.slice(-5).map((x:string,k:number)=><li key={k}>{x}</li>)}</ol></details>}
    <footer><code>{trabajo.id}</code>{error && <button type="button" onClick={()=>setIntento(x=>x+1)}>Reconectar</button>}<button type="button" onClick={()=>{try { olvidarMontaje(cuenta,trabajo); } catch {setError("No se pudo retirar del panel.");}}}>Retirar del panel</button></footer>
    <small>Retirarlo del panel no cancela el proceso en el servidor.</small>
  </article>;
}

export default function MontajesActivos() {
  const {userId,mode}=useData(); const cuenta=userId || "local";
  const [lista,setLista]=useState<{cuenta:string; trabajos:MontajeGuardado[]}>({cuenta:"",trabajos:[]});
  const trabajos=lista.cuenta===cuenta && mode!=="cargando" ? lista.trabajos : [];
  const [identificador,setIdentificador]=useState(""); const [error,setError]=useState(""); const [buscando,setBuscando]=useState(false);
  useEffect(()=>{ const actualizar=()=>setLista({cuenta,trabajos:mode === "cargando" ? [] : leerMontajes(cuenta)}); actualizar(); setIdentificador("");setError(""); window.addEventListener(CAMBIO_MONTAJES,actualizar); window.addEventListener("storage",actualizar); return()=>{window.removeEventListener(CAMBIO_MONTAJES,actualizar);window.removeEventListener("storage",actualizar);};},[cuenta,mode]);
  async function recuperar(e:React.FormEvent) {
    e.preventDefault(); setError(""); const id=identificador.trim().toLowerCase();
    if(!/^[a-f0-9]{32}$/.test(id)){setError("Copia los 32 caracteres del trabajo que aparecen después de /trabajos/ en la ventana del PC.");return;}
    setBuscando(true);
    try { const r=await fetch(`${PC_MONTAJE}/trabajos/${id}?desde=-1`,{signal:AbortSignal.timeout(8000)}); if(!r.ok)throw new Error(r.status===404 ? "Ese trabajo no existe en este PC o ya caducó." : `No se pudo consultar (HTTP ${r.status}).`); const dato=await r.json(); guardarMontaje(cuenta,{id,base:PC_MONTAJE,titulo:"Montaje recuperado del PC",inicio:Date.now(),estado:dato.estado}); setIdentificador(""); }
    catch(e:any){setError(e instanceof TypeError || e?.name==="TimeoutError" ? "No encuentro el servidor. Mantén abierto «Montar en mi PC» y comprueba el permiso de acceso a la red local del navegador." : e?.message || "No encuentro el servidor. Mantén abierto «Montar en mi PC».");} finally{setBuscando(false);}
  }
  return <details className="montajes-recovery" open={trabajos.length>0 ? true : undefined}><summary><span>Montajes y progreso</span><strong>{trabajos.length ? `${trabajos.length} guardado(s)` : "Recuperar un montaje"}</strong></summary><div className="montajes-recovery-body"><p>Puedes cambiar de módulo o cerrar esta página después de subir los clips. Mantén el PC encendido y «Montar en mi PC» abierto. En la nube depende de que el servidor siga activo. Los resultados se conservan 30 minutos tras terminar.</p>
    {trabajos.map(t=><Trabajo key={`${cuenta}:${t.base}:${t.id}`} trabajo={t} cuenta={cuenta} />)}
    <form onSubmit={recuperar}><label htmlFor="recover-montaje-id">Recuperar un trabajo que ya está en este PC</label><div><input id="recover-montaje-id" value={identificador} onChange={e=>setIdentificador(e.target.value)} placeholder="Identificador de 32 caracteres" autoComplete="off" spellCheck={false} /><button disabled={buscando || mode === "cargando"} type="submit">{buscando ? "Buscando…" : "Recuperar progreso"}</button></div><small>Para montajes anteriores a esta función: copia el identificador de /trabajos/ en la ventana del PC.</small></form>{error && <p role="alert">{error}</p>}
  </div></details>;
}
