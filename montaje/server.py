"""Servidor de montaje para Estudio Viral.

POST /montar  (multipart/form-data)
  guion: archivo guion.json (formato de subtitular.py)
  clips: los clips en orden (varios campos "clips")
  musica: (opcional) música de fondo en MP3/WAV/M4A, p. ej. creada en Muse; va bajo las voces
  anterior: (opcional) vídeo final o último clip de la parte anterior: abre con «Anteriormente...»
  Cabecera: Authorization: Bearer <MONTAJE_TOKEN>
         o  Authorization: Ticket <exp>.<firma>  (pase temporal que firma la app en Vercel)
Devuelve: video/mp4 con gancho, subtítulos de colores, tarjetas y cierre (espera hasta el final).

Montaje en segundo plano, con progreso en vivo (lo que usa la app):
  POST /trabajos            mismos campos y cabecera que /montar -> {"id": "..."} al instante
  GET  /trabajos/{id}?desde=N  espera hasta 20 s a que haya progreso nuevo ->
       {"estado": "en cola|montando|listo|error", "pct": 0-100, "paso": "...", "log": [...], "seq": N, "error": "..."}
  GET  /trabajos/{id}/video  el vídeo terminado (se borra 30 min después de terminar)
  El id es aleatorio (128 bits) y hace de llave: no caduca a los 15 min como el pase de la app.

Solo en el PC (modo local):
  GET  /              página «Herramientas del PC»: comprimir un vídeo para revisarlo o mandarlo
  POST /comprimir     (multipart: video, calidad=revisar|ligero|redes|mejorar; cabecera X-Montaje-Local) -> mp4
                      (también lo usa la app: Crear > Herramientas)
  POST /quitar-marca  (multipart: video, zonas=[{x,y,w,h}] en píxeles, metodo=borrar|difuminar|tapar|recortar) -> mp4
                      metodo=borrar_ia -> {"id"}: la IA (LaMa) redibuja el fondo; progreso y vídeo en /trabajos/{id}

GET /salud -> {"ok": true, "local": false, "gpu": "", "musica": true}
  "musica": este servidor monta la música de fondo (versiones anteriores la ignoraban sin avisar).

Modo local (MONTAJE_LOCAL=1, en el PC del usuario con local/iniciar.ps1):
  escucha solo en 127.0.0.1, no pide token y solo acepta peticiones de la app con la cabecera
  X-Montaje-Local (eso obliga al navegador a una comprobación CORS que otras webs no pasan).
"""
import asyncio, hashlib, hmac, json, os, shutil, subprocess, sys, tempfile, threading, time, uuid
from typing import List, Optional
from fastapi import FastAPI, File, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse
from starlette.background import BackgroundTask

app = FastAPI(title="Montaje Estudio Viral")
app.add_middleware(CORSMiddleware, allow_origins=os.environ.get("ALLOWED_ORIGINS", "*").split(","), allow_methods=["*"], allow_headers=["*"])
TOKEN = os.environ.get("MONTAJE_TOKEN", "")
LOCAL = os.environ.get("MONTAJE_LOCAL") == "1"


@app.middleware("http")
async def red_local(request, call_next):
    # Chrome pide permiso explícito para que una web pública hable con 127.0.0.1 (Private Network Access).
    response = await call_next(request)
    if LOCAL:
        response.headers["Access-Control-Allow-Private-Network"] = "true"
    return response


def _gpu() -> str:
    if not LOCAL:
        return ""
    try:
        return subprocess.run(["nvidia-smi", "--query-gpu=name", "--format=csv,noheader"], capture_output=True, text=True, timeout=5).stdout.strip().splitlines()[0]
    except Exception:
        return ""


GPU = _gpu()
HERE = os.path.dirname(os.path.abspath(__file__))
MAX_CLIPS = 24
MAX_CLIP_BYTES = 200 * 1024 * 1024
MAX_TOTAL_BYTES = 2 * 1024 * 1024 * 1024
MAX_SCRIPT_BYTES = 1024 * 1024
MAX_MUSIC_BYTES = 40 * 1024 * 1024
MAX_LOGO_BYTES = 8 * 1024 * 1024

async def save_upload(upload: UploadFile, path: str, limit: int) -> int:
    written = 0
    with open(path, "wb") as target:
        while chunk := await upload.read(1024 * 1024):
            written += len(chunk)
            if written > limit:
                raise HTTPException(413, "Archivo demasiado grande para el montaje")
            target.write(chunk)
    return written

def autorizado(authorization: str) -> bool:
    if not TOKEN:
        return False
    if hmac.compare_digest(authorization, f"Bearer {TOKEN}"):
        return True
    # Pase temporal: la app (con sesión iniciada) firma "montaje:<exp>" con el mismo
    # MONTAJE_TOKEN, así el token real nunca llega al navegador.
    if authorization.startswith("Ticket "):
        exp, _, firma = authorization[7:].partition(".")
        if not exp.isdigit() or int(exp) < time.time():
            return False
        esperada = hmac.new(TOKEN.encode(), f"montaje:{exp}".encode(), hashlib.sha256).hexdigest()
        return hmac.compare_digest(firma, esperada)
    return False

@app.get("/salud")
def salud():
    # «carpeta»: desde dónde corre el montaje del PC (para ver si es la copia actualizada).
    return {"ok": True, "local": LOCAL, "gpu": GPU, "musica": True, "musica_modo": True, "anterior": True, "recorte": True, "portada": True, "pavo_720": True, "comprimir": LOCAL, "mejorar": LOCAL, "quitar_marca": LOCAL, "logo_propio": True, "dos_logos": True, "borrar_ia": LOCAL, "velocidad": True, "resumen": True, "pantallas": True, **({"carpeta": os.path.dirname(HERE)} if LOCAL else {})}


# ---------- Trabajos en segundo plano ----------
# Un montaje a la vez (la CPU es pequeña); los demás esperan «en cola».
TRABAJOS: dict = {}
CUPO = threading.Semaphore(1)
RETENER_SEGUNDOS = 30 * 60


def _avisar(job, **cambios):
    with job["cond"]:
        job.update(cambios)
        job["seq"] += 1
        job["cond"].notify_all()


def _ejecutar(job, gpath, out, paths, work):
    with CUPO:
        _avisar(job, estado="montando", paso="Empezando", pct=1)
        try:
            proc = subprocess.Popen([sys.executable, "-I", "-u", os.path.join(HERE, "subtitular.py"), gpath, out, *paths],
                                    stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            # stderr se lee aparte para que no se llene el búfer y bloquee el proceso.
            errores = []
            lector = threading.Thread(target=lambda: errores.extend(proc.stderr.readlines()), daemon=True); lector.start()
            inicio = time.time()
            for linea in proc.stdout:
                if linea.startswith("PROGRESO "):
                    _, pct, msg = (linea.rstrip().split(" ", 2) + [""])[:3]
                    log = (job["log"] + [msg])[-40:]
                    _avisar(job, pct=int(pct), paso=msg, log=log)
                if time.time() - inicio > 1800:
                    proc.kill(); break
            proc.wait(); lector.join(5)
            if proc.returncode != 0 or not os.path.exists(out):
                detalle = "".join(errores)[-1200:] or "el montaje excedió 30 minutos"
                _avisar(job, estado="error", error="Falló el montaje: " + detalle)
            else:
                out2 = os.path.splitext(out)[0] + "_2.mp4"
                _avisar(job, estado="listo", pct=100, paso="Vídeo listo" + (" (dos versiones)" if os.path.exists(out2) else ""), out=out,
                        out2=out2 if os.path.exists(out2) else "")
        except Exception as e:  # nunca deja el trabajo colgado en «montando»
            _avisar(job, estado="error", error=f"Falló el montaje: {e}")
        finally:
            job["terminado"] = time.time()
    # Limpieza: el vídeo se guarda 30 min para descargarlo.
    time.sleep(RETENER_SEGUNDOS)
    shutil.rmtree(work, ignore_errors=True)
    TRABAJOS.pop(job["id"], None)


async def _guardar_logo(logo: Optional[UploadFile], work: str) -> str:
    """Logo propio para tapar marcas (p. ej. «Un Minuto en Oración»): PNG/JPG/WEBP. Devuelve su ruta o ""."""
    if logo is None or not logo.filename:
        return ""
    ext = os.path.splitext(logo.filename)[1].lower()
    if ext not in (".png", ".jpg", ".jpeg", ".webp"):
        raise HTTPException(400, "El logo debe ser PNG, JPG o WEBP (mejor PNG con fondo transparente)")
    os.makedirs(work, exist_ok=True)
    path = os.path.join(work, "logo" + ext)
    await save_upload(logo, path, MAX_LOGO_BYTES)
    return path


async def _guardar_musica(musica: Optional[UploadFile], gpath: str, work: str, anterior: Optional[UploadFile] = None, logo: Optional[UploadFile] = None, logo2: Optional[UploadFile] = None):
    """Guarda la música de fondo y el vídeo de la parte anterior y apunta a ellos en el guion. Las rutas
    las pone siempre el servidor: las que vengan del navegador se descartan."""
    g = json.load(open(gpath, encoding="utf-8"))
    g.pop("musica_archivo", None); g.pop("anterior_archivo", None); g.pop("logo_archivo", None); g.pop("logo2_archivo", None)
    lpath = await _guardar_logo(logo, work)
    if lpath:
        g["logo_archivo"] = lpath
    l2 = await _guardar_logo(logo2, os.path.join(work, "l2")) if logo2 is not None and logo2.filename else ""
    if l2:
        g["logo2_archivo"] = l2
    if anterior is not None and anterior.filename:
        apath = os.path.join(work, "anterior.mp4")
        await save_upload(anterior, apath, MAX_CLIP_BYTES)
        g["anterior_archivo"] = apath
    if musica is not None and musica.filename:
        ext = os.path.splitext(musica.filename)[1].lower()
        if ext not in (".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac"):
            raise HTTPException(400, "La música debe ser MP3, WAV, M4A, AAC, OGG o FLAC")
        mpath = os.path.join(work, "musica" + ext)
        await save_upload(musica, mpath, MAX_MUSIC_BYTES)
        g["musica_archivo"] = mpath
    json.dump(g, open(gpath, "w", encoding="utf-8"), ensure_ascii=False)


async def _guardar_entrada(guion: UploadFile, clips: List[UploadFile], musica: Optional[UploadFile] = None, anterior: Optional[UploadFile] = None, logo: Optional[UploadFile] = None, logo2: Optional[UploadFile] = None):
    if not 1 <= len(clips) <= MAX_CLIPS:
        raise HTTPException(400, f"Se admiten entre 1 y {MAX_CLIPS} clips")
    work = tempfile.mkdtemp(prefix="montaje_")
    try:
        gpath = os.path.join(work, "guion.json")
        await save_upload(guion, gpath, MAX_SCRIPT_BYTES)
        paths, total_bytes = [], 0
        for i, c in enumerate(clips):
            p = os.path.join(work, f"clip{i:02d}.mp4")
            total_bytes += await save_upload(c, p, min(MAX_CLIP_BYTES, MAX_TOTAL_BYTES - total_bytes))
            paths.append(p)
        await _guardar_musica(musica, gpath, work, anterior, logo, logo2)
    except Exception:
        shutil.rmtree(work, ignore_errors=True); raise
    return work, gpath, paths


@app.post("/trabajos")
async def crear_trabajo(guion: UploadFile = File(...), clips: List[UploadFile] = File(...), musica: Optional[UploadFile] = File(None), anterior: Optional[UploadFile] = File(None), logo: Optional[UploadFile] = File(None), logo2: Optional[UploadFile] = File(None), authorization: str = Header(default=""), x_montaje_local: str = Header(default="")):
    if not (autorizado(authorization) or (LOCAL and x_montaje_local == "1")):
        raise HTTPException(401, "Token inválido")
    work, gpath, paths = await _guardar_entrada(guion, clips, musica, anterior, logo, logo2)
    jid = uuid.uuid4().hex
    en_cola = sum(1 for j in TRABAJOS.values() if j["estado"] in ("en cola", "montando"))
    job = {"id": jid, "estado": "en cola", "pct": 0, "paso": f"En cola ({en_cola} por delante)" if en_cola else "Clips recibidos",
           "log": [f"Recibidos {len(paths)} clips" + (" y la música de fondo" if musica is not None and musica.filename else "")], "seq": 0, "error": "", "out": "", "cond": threading.Condition(), "terminado": 0}
    TRABAJOS[jid] = job
    threading.Thread(target=_ejecutar, args=(job, gpath, os.path.join(work, "final.mp4"), paths, work), daemon=True).start()
    return {"id": jid}


def _trabajo(jid: str):
    job = TRABAJOS.get(jid)
    if not job:
        raise HTTPException(404, "Ese montaje no existe o ya caducó (se guarda 30 min)")
    return job


@app.get("/trabajos/{jid}")
async def estado_trabajo(jid: str, desde: int = -1):
    job = _trabajo(jid)
    # Espera larga: responde en cuanto hay progreso nuevo (o a los 20 s). Así la página lo ve en vivo
    # y la conexión abierta evita que Fly apague la máquina a mitad del montaje.
    def esperar():
        with job["cond"]:
            job["cond"].wait_for(lambda: job["seq"] > desde or job["estado"] in ("listo", "error"), timeout=20)
    if job["seq"] <= desde and job["estado"] not in ("listo", "error"):
        await asyncio.to_thread(esperar)
    return {**{k: job[k] for k in ("estado", "pct", "paso", "log", "seq", "error")}, "segunda": bool(job.get("out2"))}


@app.get("/trabajos/{jid}/video")
def video_trabajo(jid: str, v: int = 1):
    job = _trabajo(jid)
    if job["estado"] != "listo":
        raise HTTPException(409, "El vídeo todavía no está listo")
    if v == 2:   # segunda versión, con el otro logo
        if not job.get("out2"):
            raise HTTPException(404, "Este montaje no tiene segunda versión")
        return FileResponse(job["out2"], media_type="video/mp4", filename="episodio_montado_2.mp4")
    return FileResponse(job["out"], media_type="video/mp4", filename="episodio_montado.mp4")


@app.get("/trabajos/{jid}/portada")
def portada_trabajo(jid: str):
    """Portada 1080x1920 del episodio (si el guion la pidió): «PARTE N» con el diseño fijo."""
    job = _trabajo(jid)
    ruta = os.path.splitext(job.get("out") or "")[0] + "_portada.jpg"
    if job["estado"] != "listo" or not os.path.exists(ruta):
        raise HTTPException(404, "Este montaje no tiene portada")
    return FileResponse(ruta, media_type="image/jpeg", filename="portada.jpg")

@app.post("/montar")
async def montar(guion: UploadFile = File(...), clips: List[UploadFile] = File(...), musica: Optional[UploadFile] = File(None), anterior: Optional[UploadFile] = File(None), authorization: str = Header(default="")):
    if not autorizado(authorization):
        raise HTTPException(401, "Token inválido")
    if not 1 <= len(clips) <= MAX_CLIPS:
        raise HTTPException(400, f"Se admiten entre 1 y {MAX_CLIPS} clips")
    work = tempfile.mkdtemp(prefix="montaje_")
    try:
        gpath = os.path.join(work, "guion.json")
        await save_upload(guion, gpath, MAX_SCRIPT_BYTES)
        paths = []
        total_bytes = 0
        for i, c in enumerate(clips):
            p = os.path.join(work, f"clip{i:02d}.mp4")
            total_bytes += await save_upload(c, p, min(MAX_CLIP_BYTES, MAX_TOTAL_BYTES - total_bytes))
            paths.append(p)
        await _guardar_musica(musica, gpath, work, anterior)
        out = os.path.join(work, f"montaje_{uuid.uuid4().hex[:8]}.mp4")
        r = await asyncio.to_thread(subprocess.run, [sys.executable, "-I", os.path.join(HERE, "subtitular.py"), gpath, out, *paths], capture_output=True, text=True, timeout=1800)
        if r.returncode != 0 or not os.path.exists(out):
            raise HTTPException(500, "Falló el montaje: " + (r.stderr[-1500:] or r.stdout[-500:]))
    except subprocess.TimeoutExpired:
        shutil.rmtree(work, ignore_errors=True)
        raise HTTPException(504, "El montaje excedió el tiempo máximo de 30 minutos")
    except Exception:
        shutil.rmtree(work, ignore_errors=True)
        raise
    return FileResponse(out, media_type="video/mp4", filename="episodio_montado.mp4", background=BackgroundTask(shutil.rmtree, work, True))


# ---------- Herramientas del PC: comprimir un vídeo ----------
# Para mandar un episodio a revisar (o por WhatsApp) sin que pese cientos de MB. Solo en el PC: en Fly no.
CALIDADES = {
    "revisar": (540, 30, "96k"),    # ~10-15 MB por minuto: para revisarlo en el chat
    "ligero": (360, 32, "64k"),     # lo más pequeño: si «revisar» aún pesa mucho
    "redes": (1080, 21, "160k"),    # buena calidad para publicar, pero más ligero que el original
    "mejorar": (1080, 16, "192k"),  # sube a 1080 (o 1920 de alto) con escalado fino, limpia ruido y da nitidez
}
MAX_COMPRIMIR = 4 * 1024 * 1024 * 1024


@app.post("/comprimir")
async def comprimir(video: UploadFile = File(...), calidad: str = "revisar", x_montaje_local: str = Header(default="")):
    if not LOCAL or not x_montaje_local:
        raise HTTPException(403, "Solo disponible en el montaje de este PC")
    alto, crf, audio = CALIDADES.get(calidad, CALIDADES["revisar"])
    work = tempfile.mkdtemp(prefix="comprimir_")
    nombre = os.path.splitext(os.path.basename(video.filename or "video"))[0][:80] or "video"
    src, out = os.path.join(work, "entrada"), os.path.join(work, "salida.mp4")
    try:
        await save_upload(video, src, MAX_COMPRIMIR)
        nv = os.environ.get("VIDEO_ENCODER") == "h264_nvenc"
        venc = ["-c:v", "h264_nvenc", "-preset", "p5", "-rc", "vbr", "-cq", str(crf + 2), "-b:v", "0"] if nv else ["-c:v", "libx264", "-crf", str(crf), "-preset", "fast"]
        # El lado corto queda en «alto» px (vale para vertical y horizontal), sin agrandar nunca.
        vf = f"scale='if(lt(iw,ih),min({alto},iw),-2)':'if(lt(iw,ih),-2,min({alto},ih))'"
        if calidad == "mejorar":
            # Escalado lanczos hasta 1080 de ancho (vertical) sin deformar, limpieza suave de ruido y nitidez.
            # No inventa detalle como un escalador con IA, pero los clips de 720p ganan definición real al publicar.
            vf = ("scale='if(lt(iw,ih),1080,-2)':'if(lt(iw,ih),-2,1080)':flags=lanczos,"
                  "hqdn3d=1.2:1.2:4:4,unsharp=5:5:0.75:5:5:0,setsar=1")
            venc = (["-c:v", "h264_nvenc", "-preset", "p6", "-tune", "hq", "-rc", "vbr", "-cq", "17", "-b:v", "0", "-maxrate", "25M", "-bufsize", "50M"] if nv
                    else ["-c:v", "libx264", "-crf", "16", "-preset", "slow"])
        cmd = ["ffmpeg", "-v", "error", "-y", "-i", src, "-vf", vf, *venc, "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", audio, "-movflags", "+faststart", out]
        r = await asyncio.to_thread(subprocess.run, cmd, capture_output=True, text=True)
        if r.returncode != 0 and nv:   # NVENC ocupado o no disponible: con el procesador
            fin = cmd.index("-pix_fmt")
            cmd[cmd.index("h264_nvenc") - 1:fin] = ["-c:v", "libx264", "-crf", str(crf), "-preset", "fast"]
            r = await asyncio.to_thread(subprocess.run, cmd, capture_output=True, text=True)
        if r.returncode != 0:
            raise HTTPException(500, "ffmpeg no pudo comprimirlo: " + (r.stderr or "")[-300:])
    except Exception:
        shutil.rmtree(work, True)
        raise
    return FileResponse(out, media_type="video/mp4", filename=f"{nombre}-{calidad}.mp4", background=BackgroundTask(shutil.rmtree, work, True))


PAGINA = r"""<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Herramientas del PC · Estudio Viral</title>
<style>
:root{--bg:#090D16;--panel:#151C2B;--line:rgba(255,255,255,.1);--txt:#E6ECF7;--muted:#94A3B8;--acc:#FF9F1C;--blue:#598BFF}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--txt);font:15px/1.5 system-ui,Segoe UI,sans-serif}
main{max-width:640px;margin:0 auto;padding:32px 16px}h1{font-size:22px;margin:0 0 4px}p{color:var(--muted);margin:0 0 16px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:18px;padding:20px;margin-top:16px}
#drop{border:2px dashed rgba(255,255,255,.2);border-radius:14px;padding:36px 16px;text-align:center;cursor:pointer;transition:.15s}
#drop.on{border-color:var(--acc);background:rgba(255,159,28,.07)}#drop b{display:block;font-size:16px;margin-bottom:4px}
.opts{display:grid;gap:8px;margin:16px 0}.opts label{display:flex;gap:10px;align-items:flex-start;padding:10px 12px;border:1px solid var(--line);border-radius:12px;cursor:pointer}
.opts input{margin-top:4px}.opts small{display:block;color:var(--muted)}
button{background:var(--acc);color:#090D16;border:0;border-radius:12px;padding:12px 18px;font-weight:700;font-size:15px;cursor:pointer;width:100%}
button:disabled{opacity:.5;cursor:default}#estado{margin-top:14px;font-size:14px;min-height:20px}
.bar{height:6px;background:rgba(255,255,255,.1);border-radius:9px;overflow:hidden;margin-top:8px;display:none}.bar i{display:block;height:100%;width:0;background:var(--acc);transition:width .2s}
a.dl{display:inline-block;margin-top:10px;color:var(--blue);font-weight:700}
</style></head><body><main>
<h1>Herramientas del PC</h1><p>Estudio Viral · el montaje de este PC está encendido (GPU: __GPU__).</p>
<section class="card"><h2 style="margin:0 0 4px;font-size:17px">Comprimir un vídeo</h2>
<p>Para mandarlo a revisar o por WhatsApp. Se hace aquí, en tu PC: el vídeo no sale a internet.</p>
<div id="drop" tabindex="0" role="button"><b>Arrastra aquí el vídeo</b><span id="nom">o haz clic para elegirlo</span></div>
<input id="file" type="file" accept="video/*" hidden>
<div class="opts">
<label><input type="radio" name="q" value="revisar" checked><span><b>Para revisar</b> (recomendado)<small>540p · unos 10-15 MB por minuto. Para mandarlo al chat.</small></span></label>
<label><input type="radio" name="q" value="ligero"><span><b>Lo más ligero</b><small>360p · si «Para revisar» aún pesa mucho.</small></span></label>
<label><input type="radio" name="q" value="redes"><span><b>Calidad para redes</b><small>1080p · se ve igual de bien y pesa menos que el original.</small></span></label>
<label><input type="radio" name="q" value="mejorar"><span><b>Mejorar calidad</b><small>Sube a 1080p con escalado fino, quita ruido y da nitidez. Pesa más.</small></span></label>
</div>
<button id="go" disabled>Comprimir</button>
<div class="bar" id="bar"><i id="fill"></i></div><div id="estado" role="status" aria-live="polite"></div>
</section></main>
<script>
const $=id=>document.getElementById(id);let f=null;
const mb=b=>(b/1048576).toFixed(1)+" MB";
function pick(x){if(!x)return;f=x;$("nom").textContent=x.name+" · "+mb(x.size);$("go").disabled=false;$("estado").textContent=""}
$("drop").onclick=()=>$("file").click();$("drop").onkeydown=e=>{if(e.key==="Enter"||e.key===" ")$("file").click()};
$("file").onchange=e=>pick(e.target.files[0]);
["dragenter","dragover"].forEach(t=>$("drop").addEventListener(t,e=>{e.preventDefault();$("drop").classList.add("on")}));
["dragleave","drop"].forEach(t=>$("drop").addEventListener(t,e=>{e.preventDefault();$("drop").classList.remove("on")}));
$("drop").addEventListener("drop",e=>pick(e.dataTransfer.files[0]));
$("go").onclick=()=>{if(!f)return;const q=document.querySelector("input[name=q]:checked").value;
 const fd=new FormData();fd.append("video",f);const x=new XMLHttpRequest();
 x.open("POST","/comprimir?calidad="+q);x.setRequestHeader("X-Montaje-Local","1");x.responseType="blob";
 $("go").disabled=true;$("bar").style.display="block";$("fill").style.width="0";$("estado").textContent="Subiendo al montaje del PC…";
 x.upload.onprogress=e=>{if(e.lengthComputable)$("fill").style.width=(e.loaded/e.total*100)+"%"};
 x.upload.onload=()=>{$("estado").textContent="Comprimiendo con "+("__GPU__"==="sin GPU"?"el procesador":"la GPU")+"… (un minuto de vídeo tarda unos segundos)"};
 x.onload=()=>{$("go").disabled=false;$("bar").style.display="none";
  if(x.status!==200){x.response.text().then(t=>{$("estado").textContent="No se pudo: "+t.slice(0,300)});return}
  const name=f.name.replace(/\.[^.]+$/,"")+"-"+q+".mp4";const url=URL.createObjectURL(x.response);
  $("estado").innerHTML="✓ Listo: "+mb(f.size)+" → <b>"+mb(x.response.size)+"</b>";
  const a=document.createElement("a");a.href=url;a.download=name;a.className="dl";a.textContent="Descargar "+name;$("estado").append(document.createElement("br"),a);a.click()};
 x.onerror=()=>{$("go").disabled=false;$("estado").textContent="Se cortó la conexión con el montaje del PC. ¿Sigue abierta la ventana negra?"};
 x.send(fd)};
</script></body></html>"""


@app.get("/", response_class=HTMLResponse)
def inicio():
    if not LOCAL:
        return HTMLResponse("<p>Montaje Estudio Viral</p>")
    return HTMLResponse(PAGINA.replace("__GPU__", GPU or "sin GPU"))


# ---------- Herramientas del PC: quitar una marca de agua ----------
# Como online-video-cutter (difuminar, recortar, tapar con una imagen) y además «borrar»: rellena la zona con
# lo que la rodea (delogo), que es lo que mejor queda en vídeos de IA. Varias zonas a la vez; vídeo completo.
from fastapi import Form

EMBLEMA = os.path.join(HERE, "marca", "frutienganchados.png")
METODOS = ("borrar", "difuminar", "tapar", "recortar", "borrar_ia")


def _ejecutar_borrar_ia(job, src, out, zonas, work):
    """Borrado con IA (borrar_ia.py, LaMa) en segundo plano, con progreso como el montaje."""
    with CUPO:
        _avisar(job, estado="montando", paso="Preparando la IA", pct=1)
        try:
            proc = subprocess.Popen([sys.executable, "-I", "-u", os.path.join(HERE, "borrar_ia.py"), src, out, json.dumps(zonas)],
                                    stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            errores = []
            lector = threading.Thread(target=lambda: errores.extend(proc.stderr.readlines()), daemon=True); lector.start()
            for linea in proc.stdout:
                if linea.startswith("PROGRESO "):
                    _, pct, msg = (linea.rstrip().split(" ", 2) + [""])[:3]
                    _avisar(job, pct=int(pct), paso=msg, log=(job["log"] + [msg])[-40:])
            proc.wait(); lector.join(5)
            if proc.returncode != 0 or not os.path.exists(out):
                _avisar(job, estado="error", error="Falló el borrado con IA: " + ("".join(errores)[-800:] or "sin detalle"))
            else:
                _avisar(job, estado="listo", pct=100, paso="Marca borrada", out=out)
        except Exception as e:
            _avisar(job, estado="error", error=f"Falló el borrado con IA: {e}")
        finally:
            job["terminado"] = time.time()
    time.sleep(RETENER_SEGUNDOS)
    shutil.rmtree(work, ignore_errors=True)
    TRABAJOS.pop(job["id"], None)


def _probe_wh(path: str):
    r = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height",
                        "-of", "csv=p=0", path], capture_output=True, text=True)
    w, h = (int(x) for x in r.stdout.strip().split(",")[:2])
    return w, h


def nucleo_logo(path):
    """Rectángulo opaco del logo (fracciones 0-1): el del JSON del emblema o, en un logo propio, la franja
    donde casi todo es opaco según el canal alfa. Sin transparencia, el logo entero."""
    js = os.path.splitext(path)[0] + ".json"
    if os.path.exists(js):
        try:
            return tuple(json.load(open(js, encoding="utf-8"))["nucleo"])
        except Exception:
            pass
    try:
        import numpy as np
        w, h = _probe_wh(path)
        raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-vf", "format=rgba,alphaextract", "-f", "rawvideo", "-pix_fmt", "gray", "-"],
                             capture_output=True).stdout
        op = np.frombuffer(raw[: w * h], np.uint8).reshape(h, w) > 200
        cx, cy = np.where(op.mean(axis=0) > 0.6)[0], np.where(op.mean(axis=1) > 0.6)[0]
        if len(cx) and len(cy):
            x0, y0, x1, y1 = cx[0], cy[0], cx[-1] + 1, cy[-1] + 1
            # Logos redondos u ovalados: se encoge el rectángulo hasta que sea opaco del todo (si no, la marca
            # se asomaría por las esquinas).
            while x1 - x0 > 4 and y1 - y0 > 4 and op[y0:y1, x0:x1].mean() < 0.995:
                dx, dy = max(1, (x1 - x0) // 50), max(1, (y1 - y0) // 50)
                x0, x1, y0, y1 = x0 + dx, x1 - dx, y0 + dy, y1 - dy
            return (x0 / w, y0 / h, x1 / w, y1 / h)
    except Exception:
        pass
    return (0.0, 0.0, 1.0, 1.0)


def filtro_marca(zonas, metodo, W, H, logo=EMBLEMA):
    """Filtro de ffmpeg para quitar las zonas [{x,y,w,h}] (en píxeles del vídeo). Devuelve (filtro, usa_emblema)."""
    zs = []
    for z in zonas[:6]:
        x, y, w, h = (int(round(float(z[k]))) for k in ("x", "y", "w", "h"))
        # delogo necesita 1 px de margen dentro del cuadro
        x, y = max(1, min(x, W - 4)), max(1, min(y, H - 4))
        w, h = max(3, min(w, W - x - 1)), max(3, min(h, H - y - 1))
        zs.append((x, y, w, h))
    if not zs:
        raise HTTPException(400, "Marca al menos una zona sobre el logo")
    if metodo == "recortar":
        # Se recorta la franja del borde donde está el logo y se vuelve al tamaño original (zoom suave).
        x, y, w, h = zs[0]
        if y + h / 2 > H / 2:
            nh = y - 2
        else:
            nh = H - (y + h) - 2
        nh = max(int(H * 0.6), nh)
        nw = int(W * nh / H) // 2 * 2
        oy = 0 if y + h / 2 > H / 2 else H - nh
        return f"[0:v]crop={nw}:{nh // 2 * 2}:{(W - nw) // 2}:{oy},scale={W}:{H}:flags=lanczos,setsar=1[v]", False
    if metodo == "difuminar":
        f, prev = "", "0:v"
        for i, (x, y, w, h) in enumerate(zs):
            f += (f"[{prev}]split[b{i}][c{i}];[c{i}]crop={w}:{h}:{x}:{y},boxblur={max(1, min(12, min(w, h) // 4))}:3[d{i}];"
                  f"[b{i}][d{i}]overlay={x}:{y}[o{i}];")
            prev = f"o{i}"
        return f + f"[{prev}]setsar=1[v]", False
    dl = ",".join(f"delogo=x={x}:y={y}:w={w}:h={h}" for x, y, w, h in zs)
    if metodo == "tapar":
        # El logo (FrutiEnganchados o el de la página) encima de cada zona borrada: su parte opaca la cubre
        # entera con 4 px de margen, centrada encima. Así la marca no se ve nunca, ni difuminada.
        lw, lh = _probe_wh(logo)
        n0x, n0y, n1x, n1y = nucleo_logo(logo)
        f = f"[0:v]{dl}[base];[1:v]format=rgba,split={len(zs)}" + "".join(f"[l{i}]" for i in range(len(zs))) + ";"
        prev = "base"
        for i, (x, y, w, h) in enumerate(zs):
            esc = max((w + 8) / ((n1x - n0x) * lw), (h + 8) / ((n1y - n0y) * lh))
            aw, ah = max(2, int(lw * esc)) // 2 * 2, max(2, int(lh * esc)) // 2 * 2
            ox = int(x + w / 2 - ((n0x + n1x) / 2) * aw); oy = int(y + h / 2 - ((n0y + n1y) / 2) * ah)
            f += f"[l{i}]scale={aw}:{ah}[e{i}];[{prev}][e{i}]overlay=x={ox}:y={oy}[t{i}];"
            prev = f"t{i}"
        return f + f"[{prev}]setsar=1[v]", True
    return f"[0:v]{dl},setsar=1[v]", False


@app.post("/quitar-marca")
async def quitar_marca(video: UploadFile = File(...), zonas: str = Form(...), metodo: str = Form("borrar"),
                       logo: Optional[UploadFile] = File(None), x_montaje_local: str = Header(default="")):
    if not LOCAL or not x_montaje_local:
        raise HTTPException(403, "Solo disponible en el montaje de este PC")
    if metodo not in METODOS:
        raise HTTPException(400, "Método no válido")
    try:
        zs = json.loads(zonas)
        assert isinstance(zs, list)
    except Exception:
        raise HTTPException(400, "Zonas no válidas")
    work = tempfile.mkdtemp(prefix="marca_")
    nombre = os.path.splitext(os.path.basename(video.filename or "video"))[0][:80] or "video"
    src, out = os.path.join(work, "entrada"), os.path.join(work, "salida.mp4")
    try:
        await save_upload(video, src, MAX_COMPRIMIR)
        W, H = _probe_wh(src)
        if metodo == "borrar_ia":
            # Trabajo en segundo plano: responde al instante con el id; la app sigue el progreso
            # en /trabajos/{id} y descarga en /trabajos/{id}/video, como el montaje.
            jid = uuid.uuid4().hex
            job = {"id": jid, "estado": "en cola", "pct": 0, "paso": "Vídeo recibido", "log": ["Vídeo recibido"], "seq": 0, "error": "",
                   "out": "", "cond": threading.Condition(), "terminado": 0}
            TRABAJOS[jid] = job
            threading.Thread(target=_ejecutar_borrar_ia, args=(job, src, os.path.join(work, f"{nombre}-sin-marca.mp4"), zs, work), daemon=True).start()
            return {"id": jid}
        propio = await _guardar_logo(logo, work)
        fc, emblema = filtro_marca(zs, metodo, W, H, propio or EMBLEMA)
        nv = os.environ.get("VIDEO_ENCODER") == "h264_nvenc"
        venc = ["-c:v", "h264_nvenc", "-preset", "p6", "-rc", "vbr", "-cq", "18", "-b:v", "0"] if nv else ["-c:v", "libx264", "-crf", "17", "-preset", "medium"]
        base = ["ffmpeg", "-v", "error", "-y", "-i", src, *(["-loop", "1", "-i", propio or EMBLEMA] if emblema else []),
                "-filter_complex", fc, "-map", "[v]", "-map", "0:a?", "-shortest" if emblema else "-sn"]
        tail = ["-pix_fmt", "yuv420p", "-c:a", "copy", "-movflags", "+faststart", out]
        r = await asyncio.to_thread(subprocess.run, [*base, *venc, *tail], capture_output=True, text=True)
        if r.returncode != 0 and nv:
            r = await asyncio.to_thread(subprocess.run, [*base, "-c:v", "libx264", "-crf", "17", "-preset", "medium", *tail], capture_output=True, text=True)
        if r.returncode != 0:
            raise HTTPException(500, "ffmpeg no pudo quitar la marca: " + (r.stderr or "")[-300:])
    except Exception:
        shutil.rmtree(work, True)
        raise
    return FileResponse(out, media_type="video/mp4", filename=f"{nombre}-sin-marca.mp4", background=BackgroundTask(shutil.rmtree, work, True))
