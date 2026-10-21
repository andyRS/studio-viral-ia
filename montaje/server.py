"""Servidor de montaje para Estudio Viral.

POST /montar  (multipart/form-data)
  guion: archivo guion.json (formato de subtitular.py)
  clips: los clips en orden (varios campos "clips")
  Cabecera: Authorization: Bearer <MONTAJE_TOKEN>
         o  Authorization: Ticket <exp>.<firma>  (pase temporal que firma la app en Vercel)
Devuelve: video/mp4 con gancho, subtítulos de colores, tarjetas y cierre.

GET /salud -> {"ok": true}
"""
import hashlib, hmac, os, shutil, subprocess, sys, tempfile, time, uuid
from typing import List
from fastapi import FastAPI, File, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask

app = FastAPI(title="Montaje Estudio Viral")
app.add_middleware(CORSMiddleware, allow_origins=os.environ.get("ALLOWED_ORIGINS", "*").split(","), allow_methods=["*"], allow_headers=["*"])
TOKEN = os.environ.get("MONTAJE_TOKEN", "")
HERE = os.path.dirname(os.path.abspath(__file__))

def autorizado(authorization: str) -> bool:
    if not TOKEN:
        return True
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
    work = tempfile.mkdtemp(prefix="montaje_")
    try:
        gpath = os.path.join(work, "guion.json")
        with open(gpath, "wb") as f: f.write(await guion.read())
        paths = []
        for i, c in enumerate(clips):
            p = os.path.join(work, f"clip{i:02d}.mp4")
            with open(p, "wb") as f: f.write(await c.read())
            paths.append(p)
        out = os.path.join(work, f"montaje_{uuid.uuid4().hex[:8]}.mp4")
        r = subprocess.run([sys.executable, "-I", os.path.join(HERE, "subtitular.py"), gpath, out, *paths], capture_output=True, text=True, timeout=1800)
        if r.returncode != 0 or not os.path.exists(out):
            raise HTTPException(500, "Falló el montaje: " + (r.stderr[-1500:] or r.stdout[-500:]))
    except HTTPException:
        shutil.rmtree(work, ignore_errors=True); raise
    return FileResponse(out, media_type="video/mp4", filename="episodio_montado.mp4", background=BackgroundTask(shutil.rmtree, work, True))
