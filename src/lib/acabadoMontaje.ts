export type AcabadoMontaje={sonido:boolean;sfx:boolean;color:boolean;camara:boolean};
export const ACABADO_ORIGINAL:AcabadoMontaje={sonido:true,sfx:true,color:false,camara:true};
export const ACABADO_KEY="estudio-viral:pro:v2";
export function leerAcabadoMontaje(storage?:Pick<Storage,"getItem">):AcabadoMontaje {
  try {
    const s=storage || localStorage;
    const nuevo=s.getItem(ACABADO_KEY);
    const datos=JSON.parse(nuevo || s.getItem("estudio-viral:pro") || "{}");
    return Object.fromEntries(Object.entries(ACABADO_ORIGINAL).map(([k,v])=>[k,k==="color" && !nuevo ? false : typeof datos?.[k]==="boolean" ? datos[k] : v])) as AcabadoMontaje;
  }catch{return {...ACABADO_ORIGINAL};}
}
