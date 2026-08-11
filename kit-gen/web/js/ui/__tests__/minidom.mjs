/* DOM tối giản đủ để CHẠY THẬT các primitive trong web/js/ui/** dưới Node.
   Không phải trình duyệt thật — chỉ chứng minh: module nạp được, export đúng,
   khởi tạo không throw, và cấu trúc DOM/ARIA sinh ra đúng như mong đợi. */
class ClassList {
  constructor(n){ this.n=n; }
  get _s(){ return (this.n._className||'').split(/\s+/).filter(Boolean); }
  add(...c){ const s=new Set(this._s); c.forEach(x=>s.add(x)); this.n._className=[...s].join(' '); }
  remove(...c){ this.n._className=this._s.filter(x=>!c.includes(x)).join(' '); }
  contains(c){ return this._s.includes(c); }
}
class Node {
  constructor(tag){
    this.tagName=(tag||'').toUpperCase(); this.childNodes=[]; this.attributes={};
    this._className=''; this.style={}; this._listeners={};
    this.parentNode=null; this.value=''; this.checked=false; this.disabled=false;
    const self=this;
    this.dataset=new Proxy({}, { set(t,k,v){ t[k]=String(v);
      self.attributes['data-'+k.replace(/[A-Z]/g,c=>'-'+c.toLowerCase())]=String(v); return true; },
      get(t,k){ return t[k]; }, deleteProperty(t,k){ delete t[k];
      delete self.attributes['data-'+k.replace(/[A-Z]/g,c=>'-'+c.toLowerCase())]; return true; } });
    this.required=false; this.tabIndex=0; this.offsetParent=this;
  }
  get classList(){ return this._classList||(this._classList=new ClassList(this)); }
  get className(){ return this._className; } set className(v){ this._className=v||''; }
  get firstChild(){ return this.childNodes[0]||null; }
  appendChild(c){ c.parentNode=this; this.childNodes.push(c); return c; }
  insertBefore(c,ref){ const i=ref?this.childNodes.indexOf(ref):0; this.childNodes.splice(i<0?0:i,0,c); c.parentNode=this; return c; }
  removeChild(c){ const i=this.childNodes.indexOf(c); if(i>=0)this.childNodes.splice(i,1); c.parentNode=null; return c; }
  remove(){ if(this.parentNode) this.parentNode.removeChild(this); }
  setAttribute(k,v){ this.attributes[k]=String(v); if(k==='class')this._className=String(v); if(k==='tabindex')this.tabIndex=Number(v); }
  getAttribute(k){ return k==='class'?(this._className||null):(k in this.attributes?this.attributes[k]:null); }
  removeAttribute(k){ delete this.attributes[k]; }
  hasAttribute(k){ return k==='class'? !!this._className : (k in this.attributes); }
  addEventListener(t,h){ (this._listeners[t]||(this._listeners[t]=[])).push(h); }
  removeEventListener(t,h){ const a=this._listeners[t]||[]; const i=a.indexOf(h); if(i>=0)a.splice(i,1); }
  dispatch(type, ev={}){ const e={type,target:this,currentTarget:this,preventDefault(){},stopPropagation(){},...ev};
    (this._listeners[type]||[]).forEach(h=>h(e)); return e; }
  click(){ return this.dispatch('click'); }
  focus(){ globalThis.document.activeElement=this; }
  contains(n){ if(n===this)return true; return this.childNodes.some(c=>c.contains&&c.contains(n)); }
  getBoundingClientRect(){ return {top:10,left:10,right:110,bottom:40,width:100,height:30}; }
  get textContent(){ return this.childNodes.map(c=>c.textContent||'').join(''); }
  set textContent(v){ this.childNodes=[]; if(v!=='')this.appendChild(new Text(String(v))); }
  closest(sel){ let n=this; while(n){ if(n._matches&&n._matches(sel))return n; n=n.parentNode; } return null; }
  _matches(sel){ // hỗ trợ 'button, a', '.cls', '[attr]', 'tag[attr=v]'
    return sel.split(',').map(s=>s.trim()).some(s=>{
      if(s.startsWith('.')) return this.classList.contains(s.slice(1));
      if(s.startsWith('[')){ const m=/\[([\w-]+)(?:="?([^"\]]*)"?)?\]/.exec(s); return m? (this.getAttribute(m[1])!==null && (m[2]===undefined||this.getAttribute(m[1])===m[2])) : false; }
      const m=/^([\w-]+)(\[.*\])?$/.exec(s); if(!m) return false;
      if(this.tagName!==m[1].toUpperCase()) return false;
      if(m[2]){ const a=/\[([\w-]+)(?:="?([^"\]]*)"?)?\]/.exec(m[2]);
        if(!a) return true;
        if(a[2]===undefined) return this.getAttribute(a[1])!==null;
        return this.getAttribute(a[1])===a[2].replace(/\\(.)/g,'$1'); }
      return true;
    });
  }
  _all(){ const out=[]; const walk=n=>{ for(const c of n.childNodes){ if(c instanceof Node){ out.push(c); walk(c); } } }; walk(this); return out; }
  querySelectorAll(sel){ return this._all().filter(n=>n._matches(sel)); }
  querySelector(sel){ return this.querySelectorAll(sel)[0]||null; }
}
class Text { constructor(t){ this._t=String(t); this.parentNode=null; }
  get textContent(){ return this._t; } set textContent(v){ this._t=String(v); } remove(){ if(this.parentNode)this.parentNode.removeChild(this); } }

const document = {
  activeElement: null,
  createElement:(t)=>new Node(t),
  createTextNode:(t)=>new Text(t),
  createRange:()=>({selectNodeContents(){}}),
  addEventListener(){}, removeEventListener(){},
  documentElement:new Node('html'),
  contains(n){ return document.body.contains(n); },
};
document.body = new Node('body');
document.documentElement.appendChild(document.body);
globalThis.document = document;
globalThis.window = globalThis;
globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};
globalThis.innerWidth = 1440; globalThis.innerHeight = 900;
globalThis.getSelection = () => ({ removeAllRanges(){}, addRange(){} });
globalThis.matchMedia = () => ({ matches:false, addEventListener(){}, removeEventListener(){} });
globalThis.getComputedStyle = () => ({ position:'static', getPropertyValue:()=>'' });
Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText: async()=>{} } }, configurable: true });
globalThis.CSS = { escape:(s)=>String(s).replace(/["\\]/g,'\\$&') };
globalThis.HTMLElement = Node;
export { document, Node, Text };
