import ast
from pathlib import Path
import subprocess
import sys
import unittest

HERE = Path(__file__).resolve().parent
MENSAJE = "Calidad con IA: 720×1280 → 1080×1920 · cámara ✓"


class SalidaUTF8(unittest.TestCase):
    def ejecutar(self, codigo):
        return subprocess.run([sys.executable, "-I", "-c", codigo], capture_output=True)

    def test_reproduce_charmap_antes_de_corregir(self):
        r = self.ejecutar(f"import sys; sys.stdout.reconfigure(encoding='cp1252'); print({MENSAJE!r})")
        self.assertNotEqual(r.returncode, 0)
        self.assertIn(b"UnicodeEncodeError", r.stderr)

    def test_progreso_real_de_los_tres_trabajadores(self):
        for nombre in ("mejorar_rostros.py", "subtitular.py", "borrar_ia.py"):
            with self.subTest(nombre=nombre):
                texto = (HERE / nombre).read_text(encoding="utf-8")
                arbol = ast.parse(texto)
                funcion = next(n for n in arbol.body if isinstance(n, ast.FunctionDef) and n.name == "progreso")
                codigo = ("import sys, runpy\n"
                          "sys.stdout.reconfigure(encoding='cp1252')\n"
                          "sys.stderr.reconfigure(encoding='cp1252')\n"
                          f"runpy.run_path({str(HERE / 'salida_utf8.py')!r})['configurar_salida']()\n"
                          + ast.get_source_segment(texto, funcion) + "\n"
                          + f"progreso(3, {MENSAJE!r})\n"
                          + f"print({MENSAJE!r}, file=sys.stderr)\n")
                r = self.ejecutar(codigo)
                self.assertEqual(r.returncode, 0, r.stderr)
                self.assertEqual(r.stdout.decode("utf-8").strip(), f"PROGRESO 3 {MENSAJE}")
                self.assertEqual(r.stderr.decode("utf-8").strip(), MENSAJE)
                self.assertIn("configurar_salida()", texto)

    def test_lanzamientos_del_servidor_acuerdan_utf8(self):
        arbol = ast.parse((HERE / "server.py").read_text(encoding="utf-8"))
        encontrados = 0
        for nodo in ast.walk(arbol):
            if not isinstance(nodo, ast.List) or not nodo.elts:
                continue
            primero = ast.unparse(nodo.elts[0])
            if primero == "sys.executable":
                encontrados += 1
                self.assertEqual([ast.literal_eval(x) for x in nodo.elts[1:4]], ["-X", "utf8", "-I"])
        self.assertEqual(encontrados, 5)


if __name__ == "__main__":
    unittest.main()
