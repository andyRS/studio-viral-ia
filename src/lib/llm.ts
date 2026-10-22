// Modelos de respaldo si el principal está saturado (503) o sin cuota (429).
// Se pueden cambiar con LLM_FALLBACK_MODELS="modelo1,modelo2".
const GEMINI_FALLBACKS = "gemini-3.6-flash,gemini-3.5-flash-lite";
// Si el modelo principal está saturado, pasar pronto a uno de respaldo operativo.
const RETRY_WAITS_MS = [1500];
// Las rutas de IA tienen maxDuration = 180 s en Vercel: no se empieza otro intento
// pasado BUDGET y ninguna llamada sigue abierta pasado HARD_LIMIT.
export const LLM_BUDGET_MS = 140000;
const LLM_HARD_LIMIT_MS = 165000;
const MAX_OUTPUT_TOKENS = 32768;
const sleep = (ms:number) => new Promise(r => setTimeout(r, ms));

// Error de disponibilidad (saturado, sin cuota, lento): quien llama puede caer a la plantilla local.
export class LLMUnavailableError extends Error {}

async function callGemini(key:string, model:string, system:string, user:string, json=false, timeoutMs?:number):Promise<string>{
  const fallbacks = (process.env.LLM_FALLBACK_MODELS || GEMINI_FALLBACKS).split(",").map(s => s.trim()).filter(Boolean);
  const models = Array.from(new Set([model, ...fallbacks]));
  const body = JSON.stringify({systemInstruction:{parts:[{text:system}]},contents:[{role:"user",parts:[{text:user}]}],generationConfig:{temperature:0.7,maxOutputTokens:MAX_OUTPUT_TOKENS,...(json?{responseMimeType:"application/json"}:{})}});
  let last = ""; const start = Date.now();
  const budget = Math.min(LLM_BUDGET_MS, timeoutMs || LLM_BUDGET_MS);
  const hardLimit = Math.min(LLM_HARD_LIMIT_MS, timeoutMs || LLM_HARD_LIMIT_MS);
  for (const m of models) {
    // Un reintento corto por modelo evita bloquear la creación durante minutos.
    const waits = m === model ? RETRY_WAITS_MS : [1500];
    for (let attempt = 0; attempt <= waits.length; attempt++) {
      if (Date.now() - start >= budget) throw new LLMUnavailableError(`Gemini no respondió a tiempo (${last || "sin respuesta"}).`);
      const ctrl = new AbortController();
      const remaining = hardLimit - (Date.now() - start);
      // Un episodio completo tarda 20-60 s en responder: no cortarlo antes de tiempo.
      const attemptLimit = m === model ? 80000 : 90000;
      const timer = setTimeout(() => ctrl.abort(), Math.max(1000, Math.min(attemptLimit, remaining)));
      let r: Response;
      try { r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent`, { method: "POST", headers: { "x-goog-api-key": key, "Content-Type": "application/json" }, body, signal: ctrl.signal }); }
      catch (e: any) { if (e?.name === "AbortError") { last = `${m} tardó demasiado en responder`; break; } last = `${m}: ${e?.message || "error de red"}`; continue; }
      finally { clearTimeout(timer); }
      if (r.ok) {
        const j = await r.json(); const answer = (j.candidates?.[0]?.content?.parts || []).map((p:any) => p.text || "").join("\n");
        if (answer.trim()) return answer;
        last = `${m} devolvió una respuesta vacía`; continue;
      }
      const detail = await r.text();
      if (r.status === 503 || r.status === 500 || r.status === 429) {
        last = r.status === 429 ? `${m} sin cuota o con demasiadas peticiones` : `${m} saturado`;
        if (attempt < waits.length) await sleep(waits[attempt]);
        continue;
      }
      if (r.status === 404) { last = `${m} no existe`; break; }
      throw new Error(`Gemini error ${r.status}: ${detail}`);
    }
  }
  throw new LLMUnavailableError(`Gemini no está disponible ahora mismo (${last}).`);
}

export async function callLLM(system:string, user:string, options?:{json?:boolean;timeoutMs?:number}):Promise<string>{
  const key=process.env.LLM_API_KEY; const provider=(process.env.LLM_PROVIDER||"anthropic").toLowerCase();
  const model=process.env.LLM_MODEL||(provider==="openai"?"gpt-4o-mini":provider==="gemini"?"gemini-3.5-flash-lite":"claude-sonnet-5-5");
  if(!key) throw new LLMUnavailableError("Falta LLM_API_KEY en el servidor.");
  if(provider==="gemini") return callGemini(key, model, system, user, options?.json === true, options?.timeoutMs);
  if(provider==="openai"){
    const r=await fetch("https://api.openai.com/v1/chat/completions",{method:"POST",headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json"},body:JSON.stringify({model,messages:[{role:"system",content:system},{role:"user",content:user}],temperature:0.8,max_tokens:MAX_OUTPUT_TOKENS,...(options?.json?{response_format:{type:"json_object"}}:{})})});
    if(r.status===429||r.status===503) throw new LLMUnavailableError(`OpenAI no disponible (${r.status}).`);
    if(!r.ok) throw new Error(`OpenAI error ${r.status}: ${await r.text()}`);
    const j=await r.json(); return j.choices?.[0]?.message?.content||"";
  }
  const r=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"x-api-key":key,"anthropic-version":"2023-06-01","Content-Type":"application/json"},body:JSON.stringify({model,max_tokens:MAX_OUTPUT_TOKENS,system,messages:[{role:"user",content:user}]})});
  if(r.status===429||r.status===529||r.status===503) throw new LLMUnavailableError(`Anthropic no disponible (${r.status}).`);
  if(!r.ok) throw new Error(`Anthropic error ${r.status}: ${await r.text()}`);
  const j=await r.json(); return (j.content||[]).map((b:any)=>b.text||"").join("\n");
}
export function templateMetricRecommendations(metrics:any[]){
  const m=metrics||[]; const best=[...m].sort((a:any,b:any)=>(b.views||0)-(a.views||0))[0];
  return [`Repite la fórmula ganadora: ${best?.formula||"conflicto + cliffhanger"} en el próximo episodio.`,`Usa ganchos de 2 líneas en 0-3s como: ${best?.hook||"conflicto directo"}.`,`Mantén duración cercana a ${best?.duration||90}s, que es tu mejor retención.`];
}
export function templateViralAnalysis(body:any){
  return {hook:"Conflicto en 0-2s",scenes:["Gancho","Escalada","Revelación con objeto","Cliffhanger"],timeJumps:["Días después..."],twist:"Revelación inesperada",closing:"Continuará...",formulaName:"Fórmula importada - "+new Date().toISOString().slice(0,10)};
}
export function templateDropshipping(body:any){
  const name=body?.product?.name||"el producto";
  return {angles:[`Antes y después con ${name}`,`Error común que ${name} resuelve`,`Testimonio en 15s`,`Comparación vs alternativa cara`,`Unboxing + resultado en 3 días`],scripts:[1,2,3].map(i=>({duration:"15-30s",script:`Problema: ¿cansado de este problema? Producto: mira ${name}. Resultado: así queda. CTA: pídelo hoy, enlace en el perfil. (versión ${i})`})),seedancePrompt:`Usa Seedance 2.5. Video vertical 9:16 de producto, problema → producto → resultado, luz natural, manos reales, sin texto en pantalla, voz en español latino neutro.`,landing:{headline:`Transforma tu día con ${name}`,benefits:["Fácil de usar","Resultado visible rápido","Ideal para el hogar dominicano"],socialProof:"Más de 500 clientes felices en RD ⭐⭐⭐⭐⭐",faq:[{q:"¿Cuánto tarda el envío?",a:"3-7 días laborables."},{q:"¿Puedo pagar contra entrega?",a:"Sí, en zonas seleccionadas."}],cta:"¡Comprar ahora!"}};
}
