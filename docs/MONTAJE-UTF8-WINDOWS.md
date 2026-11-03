# Calidad IA: UnicodeEncodeError en Windows

El progreso de `mejorar_rostros.py` imprime dimensiones con `→`. Con stdout redirigido y la codificación heredada CP1252, imprimir ese mensaje abortaba el trabajador; `_calidad_clips` conservaba el clip original y continuaba, avisando «se queda como estaba».

Se configura stdout/stderr de los tres trabajadores en UTF-8 con `salida_utf8.py`. Esto protege incluso el lanzamiento desde un servidor anterior todavía abierto. Los cinco lanzamientos Python de `server.py` ahora usan `-X utf8` y sus lectores decodifican explícitamente UTF-8. No se depende de variables PYTHON*, que el modo aislado `-I` ignora. No cambian los modelos, los vídeos originales ni los criterios de mejora.

Verificación: se reproduce el UnicodeEncodeError con una salida CP1252; las funciones reales `progreso` de mejora de rostros, subtitulado y borrado IA se ejecutan con Python aislado y mensajes con flechas, acentos y símbolos. Salida y errores llegan en UTF-8. Pasan las 18 pruebas de salida, comandos FFmpeg y tiempos; los cuatro scripts pasan comprobación de sintaxis. No se han cargado modelos ni repetido el montaje de 56 clips.

Para que un servidor ya abierto adopte también los nuevos lectores, cerrar y volver a abrir «Montar en mi PC» después de terminar o cancelar el trabajo actual. Repetir el montaje permite mejorar también los clips que el trabajo anterior dejó originales. No reiniciar durante un trabajo que se quiera conservar.
