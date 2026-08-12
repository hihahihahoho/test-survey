import json, subprocess, sys, tempfile, unittest
from pathlib import Path
from PIL import Image, ImageDraw

TOOL = Path(__file__).parents[1] / "tools" / "validate_output_geometry.py"

class GeometryValidatorTest(unittest.TestCase):
    def run_case(self, box):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td); image=root/'sheet.png'; contract=root/'contract.json'
            im=Image.new('RGB',(200,100),(0,255,0)); ImageDraw.Draw(im).rectangle(box,fill=(220,20,20)); im.save(image)
            contract.write_text(json.dumps({"variants":[{"id":"main","bg":"#00FF00"}],"sheets":[{"id":"main","grid":{"cols":1,"rows":1},"components":[{"file":"button","skel":{"shape":"rrect","w":.5,"h":.5}}]}]}))
            p=subprocess.run([sys.executable,str(TOOL),'--image',str(image),'--contract',str(contract),'--job','main-main'],capture_output=True,text=True)
            return p.returncode,json.loads(p.stdout)
    def test_centered_body_passes(self):
        code,out=self.run_case((50,25,150,75)); self.assertEqual(code,0); self.assertTrue(out['ok'])
    def test_shifted_body_requires_regeneration(self):
        code,out=self.run_case((0,0,80,40)); self.assertEqual(code,2); self.assertFalse(out['ok']); self.assertEqual(out['cells'][0]['status'],'regenerate')
if __name__=='__main__': unittest.main()
