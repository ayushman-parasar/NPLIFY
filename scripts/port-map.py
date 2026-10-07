"""Port the standalone map (nplify-erd-map.html) into src/lib/map/engine.js + globals.css.

Run once from the repo root: python3 scripts/port-map.py <path-to-nplify-erd-map.html>
The engine is a plain ES module exporting mountErdMap(root, data, cfg).
"""
import re, sys, pathlib

src_path = pathlib.Path(sys.argv[1])
html = src_path.read_text()
root = pathlib.Path(__file__).resolve().parents[1]

css = re.search(r"<style>(.*?)</style>", html, re.S).group(1)
skeleton = html[html.index("</style>") + len("</style>"):html.index("<script>")]
js = re.search(r"<script>(.*)</script>", html, re.S).group(1)

L0 = "/* ------------------------------------------------------------------ layout */"
L1 = "/* ------------------------------------------------------------------ knowledge base"
engine = js[js.index(L0):js.index(L1)]

def rep(s, a, b, n=1):
    assert s.count(a) == n, (a[:80], s.count(a))
    return s.replace(a, b)

# ---------------- skeleton: clean model view, consent notice, no sample-specific bits
skeleton = rep(skeleton, '<label class="tog"><input type="checkbox" id="tV4"> v4.0 changes only</label>\n      ', '')
skeleton = rep(skeleton, '<small>P0 baseline · draft v4.0 · 55 tables + 4 views</small>', '<small>P0 data model · draft v4.0 · 55 tables + 4 views</small>')
skeleton = rep(skeleton, '<div id="chatOff" hidden>Answers come from Claude using the whole ERD as the knowledge base. That works inside the claude.ai viewer; this copy of the page can only look entities up by name.</div>\n        ', '')
skeleton = rep(skeleton, '<div id="chatMeta"><span id="chatNote">Answers from ERD v4.0, the Understanding document and the decision record. Uses your Claude account; the first question asks for permission.</span><label>Depth <select id="chatTier"><option value="quick">quick</option><option value="default" selected>standard</option><option value="complex">deep</option></select></label><button class="btn" id="chatClear" type="button" style="padding:2px 7px">New chat</button></div>',
    '<div id="chatMeta"><span id="chatNote">Answers come only from the ERD v4.0, the review decision record and the Understanding document. Conversations are recorded so New XP can see what is asked and answered.</span><button class="btn" id="chatClear" type="button" style="padding:2px 7px">New chat</button></div>')
skeleton = rep(skeleton, '<p>Grey dashed boxes are derived views, computed from postings and deals and never stored. Entities with a <strong>NEW</strong> or <strong>CHANGED</strong> badge come from the v4.0 review; tick “v4.0 changes only” to see just those.</p>',
    '<p>Grey dashed boxes are derived views, computed from postings and deals and never stored.</p>')
skeleton = rep(skeleton, '<p><strong>Select an entity</strong> to see its full data dictionary, what feeds it, and what it feeds.</p>',
    '<p><strong>Hover an entity</strong> to see its connections; <strong>click</strong> to pin it and open its full data dictionary, what feeds it, and what it feeds. Click it again to unpin.</p>')
skeleton = rep(skeleton, '<div class="doms" style="margin-top:4px"><span><i style="background:var(--hi)"></i>NEW in v4.0</span><span><i style="background:var(--k-view)"></i>CHANGED in v4.0</span></div>\n', '')
skeleton = rep(skeleton, 'Drag to pan, scroll to zoom. Click an entity for its fields and connections; hover an edge for its meaning.',
    'Drag to pan, scroll to zoom. Hover an entity to see its links; click to pin it and read its details.')

# ---------------- css: scope the page frame so other routes (login, admin) scroll normally
css = rep(css, "html,body{height:100%}\nbody{margin:0;background:var(--bg);color:var(--fg);font-family:var(--font-ui);font-size:13px;line-height:1.4;overflow:hidden}",
    "html,body{height:100%}\nbody{margin:0;background:var(--bg);color:var(--fg);font-family:var(--font-ui);font-size:13px;line-height:1.4}\n.erd-page{height:100vh;height:100dvh;display:flex;flex-direction:column;overflow:hidden}\n.erd-root{flex:1;min-height:0;display:flex;flex-direction:column}")
css = rep(css, "#app{display:grid;grid-template-rows:auto 1fr auto;height:100%}", "#app{display:grid;grid-template-rows:auto 1fr auto;flex:1;min-height:0}")
css = rep(css, ".node .badge text{font:600 8px var(--font-mono);fill:#fff;letter-spacing:.04em}\n.node .badge.new rect{fill:var(--hi)}\n.node .badge.changed rect{fill:var(--k-view)}\n.vtag{display:inline-block;font:600 10px var(--font-mono);letter-spacing:.04em;padding:1px 6px;border-radius:3px;color:#fff;margin-left:6px;vertical-align:2px}\n.vtag.new{background:var(--hi)}.vtag.changed{background:var(--k-view)}\n#panel ul.ch{margin:0 0 6px;padding-left:18px;font-size:12px}\n#panel ul.ch li{margin:2px 0}", "")
css += """
/* account bar above the map, and the flag form in the details panel */
.acct{display:flex;align-items:center;justify-content:flex-end;gap:12px;padding:4px 16px;font-size:11.5px;color:var(--muted);background:var(--panel);border-bottom:1px solid var(--line)}
.acct a,.acct button{color:var(--accent);background:none;border:0;padding:0;font:inherit;cursor:pointer;text-decoration:underline dotted}
.flagbox{margin:8px 0;border:1px dashed var(--line);border-radius:6px;padding:8px}
.flagbox textarea{width:100%;min-height:56px;resize:vertical;border:1px solid var(--line);border-radius:4px;background:var(--bg);padding:6px;font:inherit}
.flagbox .row{display:flex;gap:6px;justify-content:flex-end;margin-top:6px}
.flagbox .ok{color:var(--dom-ledger);font-size:12px}
.msg .fb{display:flex;gap:6px;justify-content:flex-end;margin-top:6px}
.msg .fb button{font-size:11px;padding:1px 7px;border:1px solid var(--line);border-radius:999px;background:var(--chip);cursor:pointer}
.msg .fb button.on{border-color:var(--accent);color:var(--accent)}
"""

# ---------------- engine edits
engine = rep(engine, "const tV4=document.getElementById('tV4'),tActor=", "const tActor=")
engine = rep(engine, "    if(tV4.checked&&!E[name].v)keep=false;\n", "")
engine = rep(engine, "    if(tV4.checked&&!(ed.v||E[ed.s].v||E[ed.t].v))keep=false;\n", "")
engine = rep(engine, "\ntV4.addEventListener('change',()=>{applyHighlight();if(tV4.checked)fitTo(Object.keys(E).filter(n=>E[n].v))});", "")
engine = rep(engine, "\n    if(e.v){const bw=e.v==='new'?30:52;const bg=el('g',{class:'badge '+e.v},g);el('rect',{x:n.w-bw-6,y:6,width:bw,height:13,rx:2},bg);el('text',{x:n.w-bw/2-6,y:15.5,'text-anchor':'middle'},bg).textContent=e.v==='new'?'NEW':'CHANGED'}", "")
engine = rep(engine, "    <h2>${name}${e.v?`<span class=\"vtag ${e.v}\">${e.v==='new'?'NEW IN v4.0':'CHANGED IN v4.0'}</span>`:''}</h2>", "    <h2>${name}</h2>")
engine = rep(engine, "\n    ${e.ch&&e.ch.length?`<h3>Changes in v4.0</h3><ul class=\"ch\">${e.ch.map(c=>`<li>${esc(c)}</li>`).join('')}</ul>`:''}", "")
# click toggles the pin; hover stays live only while nothing is pinned
engine = rep(engine, "function select(name,viaEdge,opts){state.trace=null;state.sel=name;applyHighlight();renderPanel(name,viaEdge);if(!(opts&&opts.stayTab))setTab('details');if(state.walk===null)fitTo([name,...neighbours(name)])}",
    "function select(name,viaEdge,opts){\n  if(state.sel===name&&!viaEdge&&!(opts&&opts.force)){state.sel=null;state.trace=null;state.hover=null;applyHighlight();pBody.innerHTML=emptyPanel;cfg.onEvent&&cfg.onEvent('entity_unpinned',{entity:name});return}\n  state.trace=null;state.sel=name;applyHighlight();renderPanel(name,viaEdge);if(!(opts&&opts.stayTab))setTab('details');if(state.walk===null)fitTo([name,...neighbours(name)]);cfg.onEvent&&cfg.onEvent('entity_pinned',{entity:name,via:viaEdge?'edge':'click'})}")
engine = rep(engine, "  pBody.querySelectorAll('[data-go]').forEach(b=>b.addEventListener('click',()=>select(b.dataset.go)));",
    "  pBody.querySelectorAll('[data-go]').forEach(b=>b.addEventListener('click',()=>select(b.dataset.go,null,{force:true})));")
# flag button + event hooks
engine = rep(engine, '      <button class="btn" data-center="1">Fit to connections</button>\n    </div>',
    '      <button class="btn" data-center="1">Fit to connections</button>\n      ${cfg.flaggingEnabled?`<button class="btn" data-flag="1">Flag this entity</button>`:\'\'}\n    </div>\n    <div class="flagbox" id="flagbox" hidden></div>')
engine = rep(engine, "  pBody.querySelector('[data-center]').addEventListener('click',()=>fitTo([name,...neighbours(name)]));",
    "  pBody.querySelector('[data-center]').addEventListener('click',()=>fitTo([name,...neighbours(name)]));\n  const fb=pBody.querySelector('[data-flag]');if(fb)fb.addEventListener('click',()=>openFlag(name));")
engine = rep(engine, "  state.trace={nodes:ns,edges:es};state.sel=name;applyHighlight();fitTo([...ns]);",
    "  state.trace={nodes:ns,edges:es};state.sel=name;applyHighlight();fitTo([...ns]);cfg.onEvent&&cfg.onEvent('trace',{entity:name,dir,reach:ns.size-1});")
engine = rep(engine, "function startWalk(i){state.walk=i;state.step=0;state.sel=null;state.trace=null;walkBar.classList.add('on');showStep()}",
    "function startWalk(i){state.walk=i;state.step=0;state.sel=null;state.trace=null;walkBar.classList.add('on');showStep();cfg.onEvent&&cfg.onEvent('walkthrough',{name:WALKS[i].name})}")
engine = rep(engine, "function setTab(t){document.querySelectorAll('#pHead .ptab').forEach(b=>b.classList.toggle('on',b.dataset.tab===t));pBody.hidden=t!=='details';chatEl.hidden=t!=='ask';oqEl.hidden=t!=='oq';if(t!=='details')setPanel(true)}",
    "function setTab(t){document.querySelectorAll('#pHead .ptab').forEach(b=>b.classList.toggle('on',b.dataset.tab===t));pBody.hidden=t!=='details';chatEl.hidden=t!=='ask';oqEl.hidden=t!=='oq';if(t!=='details')setPanel(true);cfg.onEvent&&cfg.onEvent('tab',{tab:t})}")
engine = rep(engine, "q.addEventListener('keydown',ev=>{if(ev.key==='Enter'&&state.q){const hit=Object.keys(E).find(n=>matches(n,state.q));if(hit)select(hit)}});",
    "q.addEventListener('keydown',ev=>{if(ev.key==='Enter'&&state.q){const hit=Object.keys(E).find(n=>matches(n,state.q));cfg.onEvent&&cfg.onEvent('search',{query:state.q,hit:hit||null});if(hit)select(hit,null,{force:true})}});")
engine = rep(engine, "localStorage.setItem('erd-panel',open?'1':'0')", "localStorage.setItem('erd-panel',open?'1':'0')")

assert "sampleFn" not in engine and "claude.use" not in engine

chat = r"""
/* ------------------------------------------------------------------ flagging */
function openFlag(name){const box=document.getElementById('flagbox');if(!box)return;box.hidden=false;
  box.innerHTML=`<label style="font-size:12px">Flag <strong>${esc(name)}</strong>: what is wrong or missing?</label><textarea id="flagTxt" placeholder="e.g. receiving entity accounts also need a holder name"></textarea><div class="row"><button class="btn" id="flagCancel" type="button">Cancel</button><button class="btn primary" id="flagSend" type="button">Send flag</button></div>`;
  box.querySelector('#flagCancel').addEventListener('click',()=>{box.hidden=true});
  box.querySelector('#flagSend').addEventListener('click',async()=>{const t=box.querySelector('#flagTxt').value.trim();if(!t)return;
    const b=box.querySelector('#flagSend');b.disabled=true;
    try{const r=await fetch(cfg.flagsUrl,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({entity:name,comment:t})});
      box.innerHTML=r.ok?`<span class="ok">Flag recorded. Thank you.</span>`:`<span style="color:var(--hi)">Could not record the flag (${r.status}).</span>`}
    catch(e){box.innerHTML=`<span style="color:var(--hi)">Could not record the flag.</span>`}});
}

/* ------------------------------------------------------------------ chat (server-backed) */
const chatLog=document.getElementById('chatLog'),chatIn=document.getElementById('chatIn'),chatForm=document.getElementById('chatForm'),chatSend=document.getElementById('chatSend'),chatStop=document.getElementById('chatStop'),chatSug=document.getElementById('chatSug'),chatNote=document.getElementById('chatNote');
const SUGGEST=['How does money flow from a collection to the receiver’s confirmation?','What must exist before a quote-first deal can leave Inquiry?','What is a receiver group and when do offsets arise?','How is a rejected payout handled?','How does a two-leg route across two partners work?','Which figures are never stored, and how is each computed?','What changes on a reroute, and what stays fixed?','When is a partner rate version breached, and what happens then?','List every entity that hangs off PARTNER_CONFIG.','Which open questions are still unresolved?'];
SUGGEST.forEach(q=>{const b=document.createElement('button');b.type='button';b.textContent=q;b.addEventListener('click',()=>{chatIn.value=q;ask()});chatSug.appendChild(b)});
let turns=[],ctl=null,busy=false,sessionId=cfg.sessionId||(crypto.randomUUID?crypto.randomUUID():String(Date.now()));
const ENT_RE=new RegExp('\\b('+Object.keys(E).sort((a,b)=>b.length-a.length).join('|')+')\\b','g');
function md(t){
  let h=esc(t).replace(/`([^`]+)`/g,'<code>$1</code>').replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>');
  const lines=h.split('\n'),out=[];let list=null;
  const flush=()=>{if(list){out.push(`<${list.t}>${list.items.map(i=>'<li>'+i+'</li>').join('')}</${list.t}>`);list=null}};
  for(let ln of lines){const m=ln.match(/^\s*([-*•]|\d+[.)])\s+(.*)$/);
    if(m){const t=/^\d/.test(m[1])?'ol':'ul';if(!list||list.t!==t){flush();list={t,items:[]}}list.items.push(m[2]);continue}
    flush();const hm=ln.match(/^#{1,4}\s+(.*)$/);if(hm){out.push('<h4>'+hm[1]+'</h4>');continue}
    if(ln.trim())out.push('<p>'+ln+'</p>')}
  flush();
  return out.join('').replace(ENT_RE,(m)=>`<button type="button" class="ent" data-ent="${m}">${m}</button>`);
}
function splitMap(text){const m=text.match(/\[\[map:\s*([^\]]*)\]\]\s*$/);if(!m)return {body:text,ents:[]};
  const ents=m[1].split(/[,\s]+/).map(x=>x.trim()).filter(x=>E[x]);return {body:text.slice(0,m.index).trimEnd(),ents:[...new Set(ents)]}}
function addMsg(cls,text){const d=document.createElement('div');d.className='msg '+cls;if(cls==='user')d.textContent=text;else d.innerHTML=md(text);chatLog.appendChild(d);chatLog.scrollTop=chatLog.scrollHeight;return d}
function renderBot(d,text,final,msgId){const {body,ents}=splitMap(text);d.innerHTML=md(final?body:body.replace(/\[\[map:[^\]]*$/,''));
  if(final){
    if(ents.length){const row=document.createElement('div');row.className='entrow';row.innerHTML='<span style="color:var(--muted);font-size:11px">On the map:</span>'+ents.map(e=>`<button type="button" class="ent" data-ent="${e}">${e}</button>`).join('');d.appendChild(row);
      state.sel=null;state.trace={nodes:new Set(ents),edges:new Set(edges.filter(ed=>ents.includes(ed.s)&&ents.includes(ed.t)&&edgeVisible(ed)))};applyHighlight();fitTo(ents)}
    if(msgId){const fb=document.createElement('div');fb.className='fb';fb.innerHTML='<button type="button" data-fb="up" title="Helpful">👍</button><button type="button" data-fb="down" title="Not helpful">👎</button>';d.appendChild(fb);
      fb.addEventListener('click',ev=>{const b=ev.target.closest('[data-fb]');if(!b)return;fb.querySelectorAll('button').forEach(x=>x.classList.toggle('on',x===b));
        fetch(cfg.feedbackUrl,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({messageId:msgId,feedback:b.dataset.fb})}).catch(()=>{})})}
  }
  chatLog.scrollTop=chatLog.scrollHeight}
chatLog.addEventListener('click',ev=>{const b=ev.target.closest('[data-ent]');if(b){select(b.dataset.ent,null,{stayTab:true,force:true})}});
async function ask(){const q=chatIn.value.trim();if(!q||busy)return;chatIn.value='';chatSug.hidden=true;addMsg('user',q);
  busy=true;chatSend.disabled=true;chatStop.hidden=false;const d=addMsg('bot thinking','Thinking…');
  turns.push({role:'user',content:q});while(turns.length>14)turns.shift();
  ctl=new AbortController();let text='';
  try{
    const r=await fetch(cfg.askUrl,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sessionId,messages:turns}),signal:ctl.signal});
    if(!r.ok){const err=await r.text().catch(()=>'');throw new Error(r.status===429?'You have reached today’s question limit. Try again tomorrow.':r.status===401?'Your session has expired. Reload the page to sign in again.':(err||('Request failed ('+r.status+')')))}
    const msgId=r.headers.get('x-message-id');
    const reader=r.body.getReader(),dec=new TextDecoder();
    while(true){const {value,done}=await reader.read();if(done)break;text+=dec.decode(value,{stream:true});d.className='msg bot';renderBot(d,text,false)}
    d.className='msg bot';renderBot(d,text,true,msgId);turns.push({role:'assistant',content:text});
  }catch(e){
    if(e.name==='AbortError'){if(text){d.className='msg bot';renderBot(d,text,true);turns.push({role:'assistant',content:text})}else{d.remove();turns.pop()}}
    else{if(text){d.className='msg bot';renderBot(d,text,true)}else{d.remove();turns.pop()}addMsg('bot err',e.message||'The assistant did not answer. Try again.')}
  }finally{busy=false;chatSend.disabled=false;chatStop.hidden=true;ctl=null}}
chatForm.addEventListener('submit',ev=>{ev.preventDefault();ask()});
chatIn.addEventListener('keydown',ev=>{if(ev.key==='Enter'&&!ev.shiftKey){ev.preventDefault();ask()}});
chatStop.addEventListener('click',()=>{if(ctl)ctl.abort()});
document.getElementById('chatClear').addEventListener('click',()=>{if(ctl)ctl.abort();turns=[];chatLog.innerHTML='';chatSug.hidden=false;sessionId=crypto.randomUUID?crypto.randomUUID():String(Date.now())});
"""

# the repr trick above is fragile; build the string literal explicitly instead
import json
module = (
    "// Generated by scripts/port-map.py from the standalone map. Edit the data in data/erd.v4.json;\n"
    "// edit behaviour here. Plain JS on purpose: this is the vanilla map engine, mounted by components/ErdMap.tsx.\n"
    "export const SKELETON = " + json.dumps(skeleton, ensure_ascii=False) + ";\n\n"
    "export function mountErdMap(root, DATA, cfg) {\n"
    "const {DOMS,COLS,E,ORDER,R,INV,WALKS,OPENQ,SCENARIOS,SCENARIO_V4}=DATA;\n"
    "cfg=Object.assign({askUrl:'/api/ask',flagsUrl:'/api/flags',feedbackUrl:'/api/feedback',flaggingEnabled:false,onEvent:null},cfg||{});\n"
    "root.innerHTML=SKELETON;\n"
    + engine + chat +
    "\nreturn {destroy(){root.innerHTML='';}, select, fit};\n}\n"
)
(root / "src/lib/map/engine.js").write_text(module)
import re as _re
css = _re.sub(r"(^|\n  |\n)main(\.collapsed|\{)", lambda m: m.group(1) + ".erd-root main" + m.group(2), css)  # keep the map layout off other pages
(root / "src/app/globals.css").write_text(css)
print("engine.js", len(module), "globals.css", len(css))
