FROM python:3.11-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
# Descarga el modelo de Whisper durante el build para que la primera petición no tarde
RUN python -c "from faster_whisper import WhisperModel; WhisperModel('small', compute_type='int8')"
ENV FONT_DIR=/app/fonts PORT=8000
CMD uvicorn server:app --host 0.0.0.0 --port ${PORT}
