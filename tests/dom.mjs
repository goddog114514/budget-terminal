// Minimal DOM stub good enough to execute BUDGET::TERM's inline script in Node.

class ClassList {
  constructor(el){ this.el = el; }
  _list(){ return (this.el.className||"").split(/\s+/).filter(Boolean); }
  _set(l){ this.el.className = [...new Set(l)].join(" "); }
  add(...c){ this._set([...this._list(), ...c]); }
  remove(...c){ this._set(this._list().filter(x=>!c.includes(x))); }
  toggle(c,force){ const has=this.contains(c); const want = force===undefined? !has : !!force; if(want) this.add(c); else this.remove(c); return want; }
  contains(c){ return this._list().includes(c); }
}

export class El {
  constructor(tag){
    this.tagName = String(tag||"div").toUpperCase();
    this.children = [];
    this._text = "";
    this.className = "";
    this.style = {};
    this.dataset = {};
    this.classList = new ClassList(this);
    this.value = "";
    this.disabled = false;
    this.title = "";
    this.type = "";
    this.id = "";
    this._events = {};
  }
  get textContent(){
    if(this.children.length) return this.children.map(c=>c.textContent).join("");
    return this._text;
  }
  set textContent(v){ this.children = []; this._text = String(v==null?"":v); }
  set innerHTML(v){
    if(v===""||v==null){ this.children = []; this._text=""; return; }
    this.children = []; this._text = String(v);
  }
  get innerHTML(){ return this.textContent; }
  appendChild(c){ this.children.push(c); return c; }
  append(...cs){ for(const c of cs) this.children.push(c); }
  removeChild(c){ this.children = this.children.filter(x=>x!==c); }
  remove(){}
  addEventListener(t,fn){ (this._events[t] = this._events[t]||[]).push(fn); }
  removeEventListener(t,fn){ if(this._events[t]) this._events[t] = this._events[t].filter(f=>f!==fn); }
  dispatch(t,ev){ for(const fn of (this._events[t]||[])) fn(ev||{}); }
  click(){ this.dispatch("click",{target:this,stopPropagation(){}}); }
  focus(){ doc.activeElement = this; }
  blur(){ if(doc.activeElement===this) doc.activeElement = null; }
  setSelectionRange(){ this.selectionEnd = this.value.length; }
  contains(n){ return n===this || this.children.some(c=>c.contains && c.contains(n)); }
  querySelectorAll(){ return []; }
  getAttribute(){ return null; }
  setAttribute(){}
  getBoundingClientRect(){ return {left:0,top:0,width:100,height:20}; }
  getContext(){ return null; }
}

const ids = new Map();
export const doc = {
  activeElement: null,
  _documentListeners: {},
  getElementById(id){
    if(!ids.has(id)){ const e = new El("div"); e.id = id; ids.set(id,e); }
    return ids.get(id);
  },
  createElement(tag){ return new El(tag); },
  addEventListener(t,fn){ (this._documentListeners[t]=this._documentListeners[t]||[]).push(fn); },
  querySelectorAll(){ return []; },
  body: new El("body"),
};

export function makeLocalStorage(seed){
  const map = new Map(Object.entries(seed||{}));
  return {
    getItem: k => (map.has(k)? map.get(k) : null),
    setItem: (k,v) => { map.set(k, String(v)); },
    removeItem: k => { map.delete(k); },
    clear: () => map.clear(),
    _dump: () => Object.fromEntries(map),
  };
}

export function textOf(el){
  return el.textContent;
}
export function dumpLines(term){
  return term.children.map(c=>c.textContent);
}
export function resetIds(){ ids.clear(); }
