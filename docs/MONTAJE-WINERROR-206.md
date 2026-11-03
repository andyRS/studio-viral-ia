# Montaje: WinError 206 al lanzar FFmpeg

El grafo de filtros del montaje se pasaba íntegro como argumento de `-filter_complex`. Con muchas escenas supera el límite de la línea de comandos de CreateProcess en Windows y el proceso no llega a iniciarse.

`montaje/comando_ffmpeg.py` escribe los grafos en archivos UTF-8 temporales y pasa sus rutas a FFmpeg. Detecta la opción admitida: `-filter_complex_script` en versiones antiguas o `-/filter_complex` en versiones modernas (la instalación local es FFmpeg 9.0.2). Los archivos se cierran antes de lanzar FFmpeg, se conservan mientras corre y se eliminan al terminar, también si hay errores. Cada reintento de GPU/CPU crea los suyos.

Se aplica a la codificación principal y a los comandos auxiliares con filtros complejos (recursos, efectos, portadas y versiones). No cambia filtros, calidad, subtítulos, escenas ni archivos originales.

Validación en Windows: comando real con más de 40.000 caracteres y un fotograma sintético de 16×16. Sin la corrección falla con WinError 206; usando el mismo grafo desde archivo FFmpeg termina correctamente y el comando queda por debajo de 2.000 caracteres. Se comprobaron contenido exacto de UTF-8, limpieza en fallo, selección de opción antigua/moderna y comandos sin grafo. Pasan las 15 pruebas de `python -m unittest montaje/test_comando_ffmpeg.py montaje/test_tiempos.py` y la comprobación de sintaxis del script.

No se ha repetido el montaje completo de la película. Una vez actualizados los archivos locales, vuelve a iniciar el montaje desde la app. El servidor lanza `subtitular.py` en un proceso nuevo para cada trabajo.
