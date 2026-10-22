export type Platform = "Instagram"|"Facebook"|"TikTok"|"YouTube Shorts";
import type { PlatformAdaptation } from "./platforms";
export type { PlatformAdaptation } from "./platforms";
export type Niche = "frutinovelas"|"cine90"|"cristiano"|"dropshipping";
export interface Account { id:string; name:string; platform:Platform; niche:Niche; audience:string; idealDuration:string }
export interface Series { id:string; title:string; description:string; accountId?:string }
export interface Character { id:string; seriesId:string; name:string; imageUrl?:string; visualES:string; visualEN:string; clothing:string; subtitleColor:string; speechStyle:string; pronunciations:string[];
  referenceVersion?:number; referenceApprovedAt?:string; referenceHistory?:{version:number; imageUrl:string; approvedAt:string}[];
  fruit?:string;        // "plátano", "aguacate"… (obligatorio en frutinovela/cristiana)
  fruitEmoji?:string;   // 🍌 🥑 🥥 …
  role?:string;         // protagonista, rival, madre…
  headES?:string;       // descripción fija de la cabeza de fruta
  voice?:string;        // "mujer mayor, voz cálida y temblorosa"
  flowPrompt?:string;   // prompt de ficha para Flow
}
// Una escena = una imagen de Flow + un clip de 8 s con un solo personaje hablando.
export interface Scene { n:number; durationSec:8; setting:string; imagePromptFlow:string; animationPrompt:string; speaker:string; line:string; emotion:string;
  // Ficha de escena (estructura del prompt maestro): todo opcional para episodios anteriores.
  title?:string; goal?:string; shot?:string; characters?:string[]; sfx?:string; music?:string; transition?:string; nextLink?:string;
  references?:string[];  // fichas que el usuario debe seleccionar en Flow/Pavo (fuera del prompt)
}
export interface Formula { id:string; name:string; category:string; content:string; structure:string[] }
export interface Episode { id:string; title:string; theme:string; duration:number; status:string; createdAt:string; previousSummary?:string; accountId?:string; seriesId?:string; formulaId?:string; versions:any[]; output?:any; baseFormula?:any; platformAdaptations?:PlatformAdaptation[]; platform_adaptations?:PlatformAdaptation[]; scenes?:Scene[] }
export interface ProductionCard { id:string; episodeId:string; title:string; stage:"Idea"|"Guion"|"Clips generados"|"Montaje"|"Publicado" }
export interface ClipCheck { id:string; episodeId:string; clipIndex:number; facesConsistent:boolean; fullPhrases:boolean; pronunciationOk:boolean; noWatermark:boolean; fruitHeads:boolean; approved?:boolean; referenceSignature?:string; notes?:string }
export interface Cost { id:string; episodeId:string; tool:"Higgsfield"|"Dola"|"Otro"; credits:number; costUsd:number }
export interface CalendarEntry { id:string; accountId?:string; episodeId?:string; date:string; title:string; platform?:string }
export interface Metric { id:string; episodeId?:string; accountId?:string; episodeTitle:string; platform:string; date:string; views:number; avgWatch:number; interactions:number; followers:number; formula:string; hook:string; duration:number; shares?:number; saves?:number; oneMinViews?:number; estRevenue?:number; completion?:number; searches?:number; viewedVsSwiped?:number; retention?:number; externalId?:string; permalink?:string; skipRate?:number; reach?:number; accountName?:string; thumb?:string; capturedAt?:string }
export interface ViralAnalysis { id:string; sourceUrl?:string; transcript:string; notes:string; structure:any; formulaId?:string; createdAt?:string }
export interface Product { id:string; name:string; link:string; photos:string[]; costPrice:number; salePrice:number; angles?:string[]; scripts?:any[]; seedancePrompt?:string; landing?:any }
export interface ProductTest { id:string; productId:string; views:number; sales:number; revenue:number; isWinner:boolean; testedAt?:string }
