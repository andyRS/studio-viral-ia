import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from tiempos import avisos_clip, config_clip, corte_j_seguro, limites_clip, voz_al_inicio  # noqa: E402
import math  # noqa: E402


class Tiempos(unittest.TestCase):
    def test_voz_recorta_como_antes(self):
        self.assertEqual(limites_clip(0.5, 4.5, 8.0, {"modo": "voz"}), (0.38, 4.9))
        self.assertEqual(limites_clip(0.2, 4.5, 8.0, {"modo": "voz"}), (0.0, 4.9))

    def test_accion_conserva_margen(self):
        a, b = limites_clip(0.3, 4.6, 8.0, {"modo": "accion", "margen": 2.5})
        self.assertEqual((a, round(b, 2)), (0.0, 7.1))
        self.assertEqual(limites_clip(0.3, 4.6, 5.0, {"modo": "accion", "margen": 2.5}), (0.0, 5.0))

    def test_accion_nunca_menos_de_reaccion(self):
        self.assertEqual(round(limites_clip(0.3, 3.0, 8.0, {"modo": "accion", "margen": 0.1})[1], 2), 3.4)

    def test_completo_y_sin_voz(self):
        self.assertEqual(limites_clip(0.3, 3.0, 8.0, {"modo": "completo"}), (0.0, 8.0))
        self.assertEqual(limites_clip(None, None, 5.0, {"modo": "voz"}), (0.0, 5.0))

    def test_config_global_y_por_clip(self):
        G = {"montaje": {"modo": "cinematografico", "margen": 1.0}, "tiempos": [{"clip": 10, "margen": 3}, {"clip": 2, "modo": "voz"}]}
        self.assertEqual(config_clip(G, 0), {"modo": "accion", "margen": 1.0})
        self.assertEqual(config_clip(G, 10), {"modo": "accion", "margen": 3})
        self.assertEqual(config_clip(G, 2)["modo"], "voz")
        self.assertEqual(config_clip({}, 0)["modo"], "voz")

    def test_avisos(self):
        self.assertTrue(any("cortada" in x for x in avisos_clip(18, 0.3, 4.95, 5.0, 0.0, 5.0, {"modo": "voz"})))
        self.assertTrue(any("antes de completar" in x for x in avisos_clip(10, 0.3, 4.7, 5.0, 0.0, 5.0, {"modo": "accion", "margen": 2.5})))
        self.assertEqual(avisos_clip(10, 0.3, 4.7, 8.0, 0.0, 7.2, {"modo": "accion", "margen": 2.5}), [])

    def test_corte_j_no_pisa_la_voz(self):
        self.assertFalse(corte_j_seguro(4.9, 0.0, 5.0, 1.0, 0.25))
        self.assertTrue(corte_j_seguro(4.0, 0.0, 5.0, 1.0, 0.25))


    def test_voz_al_inicio_por_energia(self):
        sr = 16000
        voz = lambda i: 0.4 * math.sin(i / 7)
        silencio_y_voz = [0.002 * math.sin(i / 3) for i in range(int(sr * 0.3))] + [voz(i) for i in range(sr * 3)]
        voz_desde_0 = [voz(i) for i in range(sr * 3)]
        self.assertFalse(voz_al_inicio(silencio_y_voz, sr))
        self.assertTrue(voz_al_inicio(voz_desde_0, sr))
        self.assertFalse(voz_al_inicio([0.0] * sr, sr))
        # Whisper dice 0,0 s pero hay silencio delante: no se avisa
        self.assertEqual(avisos_clip(1, 0.0, 3.0, 5.0, 0.0, 3.4, {"modo": "voz"}, empieza_con_voz=False), [])


if __name__ == "__main__":
    unittest.main()
