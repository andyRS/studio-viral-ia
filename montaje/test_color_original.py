import ast
from pathlib import Path
import unittest


class ColorOriginal(unittest.TestCase):
    def test_color_solo_si_se_activa_y_sin_look_oscuro(self):
        arbol=ast.parse(Path(__file__).with_name("subtitular.py").read_text(encoding="utf-8"))
        asignacion=next(n for n in arbol.body if isinstance(n,ast.Assign) and isinstance(n.targets[0],ast.Tuple)
                        and any(isinstance(x,ast.Name) and x.id=="PRO_COLOR" for x in n.targets[0].elts))
        programa=compile(ast.Module(body=[asignacion],type_ignores=[]),"color","exec")
        for entrada,esperado in [({},False),({"color":False},False),({"color":True},True),({"color":"false"},False)]:
            ctx={"PRO":entrada};exec(programa,ctx)
            self.assertEqual(ctx["PRO_COLOR"],esperado)
            self.assertTrue(ctx["PRO_CAMARA"])
        look=next(n for n in arbol.body if isinstance(n,ast.Assign) and isinstance(n.targets[0],ast.Name) and n.targets[0].id=="LOOK")
        self.assertEqual(ast.literal_eval(look.value),"")


if __name__=="__main__":
    unittest.main()
