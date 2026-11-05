import {conAspecto,refreshPrompts} from "./production";
import type {StyleKey} from "./knowledge";
const nombre=(c:any)=>String(c?.name || "").trim().toLocaleLowerCase();
export function siguienteParteJson(episodios:any[]){
  return Math.max(0,...episodios.map((e,i)=>Number.isInteger(Number(e.output?.partNumber)) && Number(e.output.partNumber)>0 ? Number(e.output.partNumber) : i+1))+1;
}
export function elencoContinuacionJson(episodios:any[],maestros:any[]){
  const mapa=new Map<string,any>();
  for(const e of episodios)for(const c of e.output?.cast || [])if(nombre(c))mapa.set(nombre(c),c);
  for(const c of maestros)if(nombre(c))mapa.set(nombre(c),c);
  return Array.from(mapa.values());
}
export function prepararContinuacionJson(datos:any,maestros:any[],style:StyleKey,aspecto:"16:9"|"9:16"){
  const campos=["name","role","fruit","fruitEmoji","headES","visualES","visualEN","clothing","voice","subtitleColor","speechStyle","pronunciations","flowPrompt"];
  const cast=(datos.episode?.cast || datos.characters || []).map((c:any)=>{
    const m=maestros.find(x=>nombre(x)===nombre(c));
    return m ? {...c,...Object.fromEntries(campos.filter(k=>m[k]!==undefined).map(k=>[k,m[k]]))} : c;
  });
  return {episodio:conAspecto(refreshPrompts({...datos.episode,cast},style),aspecto),nuevos:(datos.characters || []).filter((c:any)=>!maestros.some(x=>nombre(x)===nombre(c)))};
}
