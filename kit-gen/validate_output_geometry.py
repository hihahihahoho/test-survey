#!/usr/bin/env python3
"""Validate generated sheet bodies against contract safe zones without deforming art."""
import argparse, json, math
from pathlib import Path
from PIL import Image

def rgb(value):
    v=str(value or '#00FF00').lstrip('#')
    return tuple(int(v[i:i+2],16) for i in (0,2,4)) if len(v)==6 else (0,255,0)

def bbox_foreground(image, key, threshold=42):
    px=image.load(); xs=[]; ys=[]
    for y in range(image.height):
        for x in range(image.width):
            c=px[x,y][:3]
            if math.sqrt(sum((c[i]-key[i])**2 for i in range(3))) > threshold:
                xs.append(x); ys.append(y)
    return None if not xs else (min(xs),min(ys),max(xs)+1,max(ys)+1)

def validate(image, contract, job, position_tolerance=.08, size_tolerance=.15):
    variant_id, _, sheet_id = job.partition('-')
    sheet=next((s for s in contract.get('sheets',[]) if s.get('id')==sheet_id),None)
    if sheet is None: raise ValueError(f'unknown sheet: {sheet_id}')
    variant=next((v for v in contract.get('variants',[]) if v.get('id')==variant_id),{})
    key=rgb(variant.get('bg'))
    cols=max(1,int(sheet.get('grid',{}).get('cols',1))); rows=max(1,int(sheet.get('grid',{}).get('rows',1)))
    cw=image.width/cols; ch=image.height/rows; results=[]
    for index,component in enumerate(sheet.get('components',[])):
        col=index%cols; row=index//cols
        if row>=rows: break
        crop=image.crop((round(col*cw),round(row*ch),round((col+1)*cw),round((row+1)*ch)))
        box=bbox_foreground(crop,key); skel=component.get('skel',{}); sw=float(skel.get('w',1))*crop.width; sh=float(skel.get('h',1))*crop.height
        expected=(crop.width-sw)/2,(crop.height-sh)/2,sw,sh
        reasons=[]
        if box is None: reasons=['missing-body']; actual=None
        else:
            x0,y0,x1,y1=box; actual=[x0,y0,x1-x0,y1-y0]
            if abs((x0+x1)/2-crop.width/2)>position_tolerance*crop.width or abs((y0+y1)/2-crop.height/2)>position_tolerance*crop.height: reasons.append('position')
            if abs((x1-x0)-sw)>size_tolerance*max(1,sw) or abs((y1-y0)-sh)>size_tolerance*max(1,sh): reasons.append('size')
        results.append({'file':component.get('file',str(index)),'cell':index,'status':'ok' if not reasons else 'regenerate','reasons':reasons,'expected':[round(v,2) for v in expected],'actual':actual})
    return {'ok':all(x['status']=='ok' for x in results),'job':job,'sheet':sheet_id,'cells':results}

def main():
    p=argparse.ArgumentParser(); p.add_argument('--image',type=Path,required=True); p.add_argument('--contract',type=Path,required=True); p.add_argument('--job',required=True); p.add_argument('--output',type=Path)
    a=p.parse_args(); result=validate(Image.open(a.image).convert('RGB'),json.loads(a.contract.read_text()),a.job); text=json.dumps(result,ensure_ascii=False)
    if a.output: a.output.write_text(text+'\n')
    print(text); return 0 if result['ok'] else 2
if __name__=='__main__': raise SystemExit(main())
