import os
from pathlib import Path
import shutil
import subprocess
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from comando_ffmpeg import filtros_en_archivos, opcion_filtro_archivo


class ComandoFFmpeg(unittest.TestCase):
    def tearDown(self):
        opcion_filtro_archivo.cache_clear()

    def test_compatibilidad_antigua_y_nueva(self):
        for ayuda, esperado in [("-filter_complex_script <file>", "-filter_complex_script"),
                                ("-filter_complex <graph>", "-/filter_complex")]:
            opcion_filtro_archivo.cache_clear()
            with patch("comando_ffmpeg.subprocess.run", return_value=subprocess.CompletedProcess([], 0, ayuda, "")):
                self.assertEqual(opcion_filtro_archivo("ffmpeg"), esperado)

    @patch("comando_ffmpeg.opcion_filtro_archivo", return_value="-/filter_complex")
    def test_texto_exacto_y_limpieza(self, _):
        grafo = "[0:v]drawtext=text='acción: luz y cámara'[v]"
        original = ["ffmpeg", "-i", "clip con espacios.mp4", "-filter_complex", grafo, "-map", "[v]"]
        with filtros_en_archivos(original) as cmd:
            archivo = Path(cmd[4])
            self.assertEqual(archivo.read_text(encoding="utf-8"), grafo)
            self.assertEqual(cmd[3], "-/filter_complex")
            self.assertEqual(cmd[:3], original[:3])
            self.assertEqual(cmd[5:], original[5:])
        self.assertFalse(archivo.exists())
        self.assertEqual(original[4], grafo)

    @patch("comando_ffmpeg.opcion_filtro_archivo", return_value="-/filter_complex")
    def test_limpia_si_el_proceso_falla(self, _):
        with self.assertRaises(RuntimeError):
            with filtros_en_archivos(["ffmpeg", "-filter_complex", "null"]) as cmd:
                archivo = Path(cmd[2])
                raise RuntimeError("fallo de codificación")
        self.assertFalse(archivo.exists())

    def test_sin_grafo_no_consulta_ffmpeg(self):
        with patch("comando_ffmpeg.opcion_filtro_archivo") as consultar:
            with filtros_en_archivos(["ffmpeg", "-version"]) as cmd:
                self.assertEqual(cmd, ["ffmpeg", "-version"])
            consultar.assert_not_called()

    @unittest.skipUnless(shutil.which("ffmpeg"), "requiere FFmpeg")
    def test_grafo_real_supera_limite_windows(self):
        grafo = "[0:v]" + "null," * 8000 + "null[v]"
        original = ["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "color=s=16x16:d=0.04",
                    "-filter_complex", grafo, "-map", "[v]", "-frames:v", "1", "-f", "null", "-"]
        self.assertGreater(len(subprocess.list2cmdline(original)), 32767)
        if os.name == "nt":
            with self.assertRaises(OSError) as fallo:
                subprocess.run(original, capture_output=True, timeout=30)
            self.assertEqual(fallo.exception.winerror, 206)
        with filtros_en_archivos(original) as cmd:
            self.assertLess(len(subprocess.list2cmdline(cmd)), 2000)
            resultado = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
            self.assertEqual(resultado.returncode, 0, resultado.stderr)


if __name__ == "__main__":
    unittest.main()
