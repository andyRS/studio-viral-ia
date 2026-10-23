FROM python:3.11-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
# Velocidad: Whisper «base» (solo da los tiempos; el texto sale del guion) y x264 «veryfast».
# Monta 2-3 veces más rápido en la CPU compartida de Fly sin que se note en la calidad.
ENV WHISPER_MODEL=base X264_PRESET=veryfast
# Descarga el modelo de Whisper durante el build para que la primera petición no tarde
RUN python -c "import os; from faster_whisper import WhisperModel; WhisperModel(os.environ['WHISPER_MODEL'], compute_type='int8')"
ENV FONT_DIR=/app/fonts PORT=8000
CMD uvicorn server:app --host 0.0.0.0 --port ${PORT}
