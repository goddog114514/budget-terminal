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
    this._id = "";
    this._events = {};
    this.__parent = null;
  }
  /* id 是 getElementById() 的唯一依据: 动态生成的节点(设置页卡片槽位、钱包卡片里的按钮)
     在真实 DOM 里能被 getElementById 找到, 桩里也必须能 —— 否则测试只能看到"另建的空白节点",
     测不到真实挂载关系。 */
  get id(){ return this._id; }
  set id(v){ this._id = String(v==null?"":v); if(this._id) ids.set(this._id, this); }
  get textContent(){
    if(this.children.length) return this.children.map(c=>c.textContent).join("");
    return this._text;
  }
  set textContent(v){ this.children = []; this._text = String(v==null?"":v); }
  set innerHTML(v){
    if(v===""||v==null){ for(const c of this.children) c.__parent = null; this.children = []; this._text=""; return; }
    for(const c of this.children) c.__parent = null;
    this.children = []; this._text = String(v);
  }
  get innerHTML(){ return this.textContent; }
  /* 与真实 DOM 一致: 插入会把节点从原父节点上摘下来(设置页的"面板搬进卡片 / 搬回遮罩层"靠这一点) */
  _adopt(c){ if(c && c.__parent && c.__parent !== this) c.__parent.removeChild(c); if(c) c.__parent = this; }
  appendChild(c){
    if(c && c.__parent === this) this.children = this.children.filter(x=>x!==c);   // 同父再插 = 移到末尾, 不重复
    this._adopt(c); this.children.push(c); return c;
  }
  append(...cs){ for(const c of cs) this.appendChild(c); }
  removeChild(c){ this.children = this.children.filter(x=>x!==c); if(c && c.__parent===this) c.__parent=null; }
  remove(){ if(this.__parent) this.__parent.removeChild(this); }
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

/* 真实浏览器有配额(Edge/Chrome file:// 实测 5,241,856 字符 ≈ 5 MiB 计费), 超了 setItem 抛
   QuotaExceededError。装置默认不限配额(既有套件不需要), 传 opts.quota(字符数) 才模拟。
   计量口径与 Chromium 一致: **键 + 值** 的字符数累加; 覆盖同一键时先扣除旧值。 */
export function makeLocalStorage(seed, opts){
  const map = new Map(Object.entries(seed||{}));
  let quota = (opts && opts.quota != null) ? opts.quota : Infinity;
  const sizeOf = (k,v) => String(k).length + String(v).length;
  const usage = (replaceKey, replaceVal) => {
    let n = 0;
    for(const [k,v] of map){ if(replaceKey !== undefined && k === replaceKey) continue; n += sizeOf(k,v); }
    if(replaceKey !== undefined) n += sizeOf(replaceKey, replaceVal);
    return n;
  };
  return {
    getItem: k => (map.has(k)? map.get(k) : null),
    setItem: (k,v) => {
      v = String(v);
      if(usage(k, v) > quota){
        const e = new Error("Failed to execute 'setItem' on 'Storage': Setting the value of '"+k+"' exceeded the quota.");
        e.name = "QuotaExceededError";
        throw e;
      }
      map.set(k, v);
    },
    removeItem: k => { map.delete(k); },
    clear: () => map.clear(),
    _dump: () => Object.fromEntries(map),
    _usage: () => usage(),
    _quota: () => quota,
    _setQuota: q => { quota = (q == null ? Infinity : q); },
  };
}

export function textOf(el){
  return el.textContent;
}
export function dumpLines(term){
  return term.children.map(c=>c.textContent);
}
export function resetIds(){ ids.clear(); }
