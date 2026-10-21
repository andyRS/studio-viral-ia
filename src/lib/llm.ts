import { MANUAL_VIRAL } from "./knowledge";
export async function callLLM(system:string, user:string):Promise<string>{
  const key=process.env.LLM_API_KEY; const provider=(process.env.LLM_PROVIDER||"anthropic").toLowerCase();
  const model=process.env.LLM_MODEL||(provider==="openai"?"gpt-4o-mini":provider==="gemini"?"gemini-3.5-flash-lite":"claude-sonnet-5-5");
  if(!key) throw new Error("Falta LLM_API_KEY en variables de entorno. Configúrala en .env.local o usa el modo plantilla local.");
  if(provider==="gemini"){
    const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,{method:"POST",headers:{"x-goog-api-key":key,"Content-Type":"application/json"},body:JSON.stringify({systemInstruction:{parts:[{text:system}]},contents:[{role:"user",parts:[{text:user}]}],generationConfig:{temperature:0.8,maxOutputTokens:16000}})});
    if(r.status===429) throw new Error("Límite gratuito de Gemini alcanzado. Se reinicia cada día a medianoche (hora del Pacífico); inténtalo más tarde.");
    if(!r.ok) throw new Error(`Gemini error ${r.status}: ${await r.text()}`);
    const j=await r.json(); return (j.candidates?.[0]?.content?.parts||[]).map((p:any)=>p.text||"").join("\n");
  }
  if(provider==="openai"||provider==="gemini"){
    // Gemini usa su endpoint compatible con OpenAI (clave gratis de Google AI Studio).
    const url=provider==="gemini"?"https://generativelanguage.googleapis.com/v1beta/openai/chat/completions":"https://api.openai.com/v1/chat/completions";
    const r=await fetch(url,{method:"POST",headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json"},body:JSON.stringify({model,messages:[{role:"system",content:system},{role:"user",content:user}],temperature:0.8,max_tokens:16000})});
    if(r.status===429) throw new Error("Se alcanzó el límite gratuito del modelo por hoy o por minuto. Espera un momento o mañana se reinicia.");
    if(!r.ok) throw new Error(`${provider==="gemini"?"Gemini":"OpenAI"} error ${r.status}: ${await r.text()}`);
    const j=await r.json(); return j.choices?.[0]?.message?.content||"";
  }
  const r=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"x-api-key":key,"anthropic-version":"2023-06-01","Content-Type":"application/json"},body:JSON.stringify({model,max_tokens:16000,system,messages:[{role:"user",content:user}]})});
  if(!r.ok) throw new Error(`Anthropic error ${r.status}: ${await r.text()}`);
  const j=await r.json(); return (j.content||[]).map((b:any)=>b.text||"").join("\n");
}
import { buildPlatformAdaptations, BASE_FORMULA } from "./platforms";
// Plantillas locales (sin IA). Las usan las rutas /api cuando falta
// LLM_API_KEY y TAMBIÉN el cliente en «modo sin login», porque las rutas de
// IA están protegidas con sesión (401). Misma salida, cero llamada al LLM.
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
export function templateEpisode(input:any){
  const chars=input.characters||[]; const duration=input.duration||90; const blocks=Math.max(2,Math.round(duration/15));
  const colores:any={}; chars.forEach((c:any)=>colores[c.name]=String(c.subtitleColor||"FFFFFF").replace("#","").toUpperCase());
  const scriptBlocks=Array.from({length:blocks},(_,i)=>({block:i+1,time:`${i*15}-${(i+1)*15}s`,scene:i===0?"Gancho con conflicto":"Escena "+(i+1),dialogue: chars.slice(0,2).map((c:any)=>({speaker:c.name,text:i===0?`¡Tú me escondiste la verdad, ${chars[1]?.name||""}!`:`Esto no se queda así.`}))}));
  const allPron:string[]=Array.from(new Set(chars.flatMap((c:any)=>c.pronunciations||[])));
  const prompts=scriptBlocks.map((b:any)=>`Usa Seedance 2.5. Animación 3D cinematográfica vertical 9:16. Personajes: ${chars.map((c:any)=>`${c.name}: ${c.visualES}, ropa: ${c.clothing}`).join("; ")}. cabeza de fruta en cada toma, nunca cara humana. Tomas: [0-5s plano general, 5-10s plano medio, 10-15s primer plano]. Diálogos: ${b.dialogue.map((d:any)=>`${d.speaker}: "${d.text}"`).join(" ")} PRONUNCIACIÓN OBLIGATORIA: ${allPron.join("; ")||"tíguere TÍ-gue-re nunca tigre; mi cualto con L nunca cuartos"}. VOCES: español latino neutro, cada palabra completa, nunca acento inglés, sincronización de labios solo para quien habla, sin subtítulos ni texto en pantalla.`);
  const dolaPrompt=`Usa Seedance 2.5. (Dola AI 60s) ${prompts.join(" ")} Duración total 60 segundos, ritmo sin pausas.`;
  const guionJson={colores,gancho:[`¡${chars[0]?.name||"Protagonista"} descubre la traición!`,"Y nadie esperaba lo que pasó después..."],cierre:"Continuará...",clips:scriptBlocks.map((b:any)=>b.dialogue.map((d:any)=>[d.speaker,d.text]))};
  const platformAdaptations=buildPlatformAdaptations({...input,hook:guionJson.gancho}); return {mode:"plantilla-local",baseFormula:BASE_FORMULA,platformAdaptations,platform_adaptations:platformAdaptations,scriptBlocks,prompts,dolaPrompt,dialogueRules:"Palabras dominicanas completas con acentos: tíguere, yipeta, jevito, vaina, mi cualto. NUNCA pa', vamo', e', ta'.",hook:guionJson.gancho,coverText:guionJson.gancho[0],description:`${input.theme||"Nuevo episodio"} 🔥 No te pierdas este capítulo. #Frutinovelas #RepublicaDominicana #TikTokRD`,hashtags:["#Frutinovelas","#RD","#Microdrama","#Viral"],guionJson};
}
export async function generateEpisode(input:any){
  if(!process.env.LLM_API_KEY) return templateEpisode(input);
  const system=EPISODE_RULES+"\n\n"+MANUAL_VIRAL;
  const raw=await callLLM(system, JSON.stringify(input));
  try{ const parsed=JSON.parse(raw.replace(/```json|```/g,"").trim()); if(!parsed.platformAdaptations||parsed.platformAdaptations.length!==4){ const t=templateEpisode(input); parsed.platformAdaptations=t.platformAdaptations; parsed.baseFormula=t.baseFormula; } parsed.platform_adaptations=parsed.platformAdaptations; if(parsed.guionJson?.colores) for(const k of Object.keys(parsed.guionJson.colores)) parsed.guionJson.colores[k]=String(parsed.guionJson.colores[k]).replace("#","").toUpperCase(); return parsed }catch{ return {...templateEpisode(input), raw} }
}

export const EPISODE_RULES="Eres guionista de frutinovelas dominicanas. REGLAS DEL GENERADOR (modulo 4): divide el guion en bloques de 15 segundos con tiempos. Cada prompt (uno por bloque) va COMPLETAMENTE EN ESPANOL y empieza con \"Usa Seedance 2.5.\"; incluye las descripciones fijas (visualES y clothing) de cada personaje que aparece, la frase cabeza de fruta en cada toma, nunca cara humana, la lista de tomas con tiempos, los dialogos entre comillas, una seccion PRONUNCIACION OBLIGATORIA con las pronunciaciones de los personajes que hablan, y una seccion VOCES: espanol latino neutro, cada palabra completa, nunca acento ingles, sincronizacion de labios solo para quien habla, sin subtitulos ni texto en pantalla. dolaPrompt: un solo prompt de 60 segundos para Dola AI con el mismo formato. Dialogos con palabras del dialecto dominicano escritas completas y con acentos correctos (tiguere, yipeta, jevito, vaina, mi cualto), NUNCA contracciones cortadas (pa', vamo', e', ta'). guionJson = {colores:{HABLANTE: hex sin #}, gancho:[linea1, linea2], cierre:\"Continuara...\", clips:[[[HABLANTE, texto],...] por bloque]} usando exactamente los mismos nombres de hablante que en colores. REGLA 4B OBLIGATORIA: construye primero la historia con la FORMULA BASE (Instagram): conflicto/estatus visible en segundo 0-1 sin presentaciones, gancho texto 2 lineas en primeros 3s, revelacion mediante un objeto (entrada, carta, celular, prueba de embarazo), escalada rapida + giro/cliffhanger, estetica cinematografica y primeros planos de reacciones, cierre Continuara... + ¿Parte 2? en comentarios. DESPUES genera platformAdaptations: 4 fichas DISTINTAS (nunca el mismo texto/archivo), cada una con platform, recommendedDuration, editingChanges, coverText, title, description, hashtags, bestTime, frequency, cta, metricsToWatch, checklist, fileName: 1) Instagram Reels 30-60s cortes 2-4s, portada cara primer plano + 1 frase intriga, descripcion corta con pregunta + Comenta PARTE 2, 3-5 hashtags nicho, etiqueta Informacion de IA, metricas compartidos/guardados/seguidores. 2) Facebook 60-90s dialogo sin pausas, subida nativa nunca desde Instagram, gancho visible 5-8s, descripcion emotiva/debate ¿Quien tiene la culpa?, 3 grupos FB dominicanos sugeridos con frase para cada uno, 1/dia 7-10pm RD, metricas tiempo promedio/vistas 1 min/ingresos estimados. 3) TikTok 1-3 min (>1 min monetiza), Anteriormente... 5-8s si es continuacion, tarjetas de tiempo + narrador solo en ultima frase, portada PARTE X grande + titulo serie, descripcion con keywords frutinovela/telenovela de frutas/drama dominicano + 3-5 hashtags, playlist por serie, 1-2/dia, respuestas en video a comentarios, metricas % completo/nuevos seguidores/busquedas. 4) YouTube Shorts hasta 3 min ideal 45-90s, final que empalma con el inicio para bucle, titulo keywords + #shorts max 60 caracteres, sin marcas de agua archivo limpio, vincular siguiente parte con video relacionado, metricas visto vs deslizado/retencion. Responde SOLO JSON valido con claves: scriptBlocks, prompts, dolaPrompt, dialogueRules, hook, coverText, description, hashtags, guionJson, baseFormula, platformAdaptations.";
