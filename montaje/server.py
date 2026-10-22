"""Servidor de montaje para Estudio Viral.

POST /montar  (multipart/form-data)
  guion: archivo guion.json (formato de subtitular.py)
  clips: los clips en orden (varios campos "clips")
  Cabecera: Authorization: Bearer <MONTAJE_TOKEN>
         o  Authorization: Ticket <exp>.<firma>  (pase temporal que firma la app en Vercel)
Devuelve: video/mp4 con gancho, subtítulos de colores, tarjetas y cierre.

GET /salud -> {"ok": true}
"""
import asyncio, hashlib, hmac, os, shutil, subprocess, sys, tempfile, time, uuid
from typing import List
from fastapi import FastAPI, File, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask

app = FastAPI(title="Montaje Estudio Viral")
app.add_middleware(CORSMiddleware, allow_origins=os.environ.get("ALLOWED_ORIGINS", "*").split(","), allow_methods=["*"], allow_headers=["*"])
TOKEN = os.environ.get("MONTAJE_TOKEN", "")
HERE = os.path.dirname(os.path.abspath(__file__))
MAX_CLIPS = 24
MAX_CLIP_BYTES = 200 * 1024 * 1024
MAX_TOTAL_BYTES = 2 * 1024 * 1024 * 1024
MAX_SCRIPT_BYTES = 1024 * 1024

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
    return {"ok": True}

@app.post("/montar")
async def montar(guion: UploadFile = File(...), clips: List[UploadFile] = File(...), authorization: str = Header(default="")):
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
