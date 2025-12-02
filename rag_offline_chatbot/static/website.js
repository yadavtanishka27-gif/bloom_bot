// =========================
// File: static/website.js
// =========================

/* Petal chat removed. Everything else intact. */
const $=(s,c=document)=>c.querySelector(s);const $$=(s,c=document)=>Array.from(c.querySelectorAll(s));
const preferReduced=matchMedia('(prefers-reduced-motion: reduce)').matches;

/* Toast + confirm + backoff */
const toastWrapId = 'toast-wrap';
function toast(msg,type='info'){const w=$('#'+toastWrapId);if(!w)return;const el=document.createElement('div');el.className='toast';el.style.borderLeftColor=type==='error'?'#E06666':type==='ok'?'#58A36C':'var(--accent)';el.textContent=msg;w.appendChild(el);setTimeout(()=>el.remove(),3600)}
function confirmModal(title,body){return new Promise(res=>{const bg=$('#modal-bg');$('#modal-title').textContent=title;$('#modal-body').textContent=body;bg.classList.add('show');bg.setAttribute('aria-hidden','false');const ok=$('#modal-ok'),cancel=$('#modal-cancel');const close=v=>{bg.classList.remove('show');bg.setAttribute('aria-hidden','true');ok.removeEventListener('click',okH);cancel.removeEventListener('click',cancelH);bg.removeEventListener('click',bgH);res(v)};const okH=()=>close(true),cancelH=()=>close(false),bgH=e=>{if(e.target===bg)close(false)};ok.addEventListener('click',okH);cancel.addEventListener('click',cancelH);bg.addEventListener('click',bgH);});}
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
async function fetchWithBackoff(url,opts={},cfg={retries:3,base:600,factor:2}){let last;for(let i=0;i<=cfg.retries;i++){try{const ctrl=new AbortController();const t=setTimeout(()=>ctrl.abort(),opts.timeoutMs??25000);const res=await fetch(url,{...opts,signal:ctrl.signal});clearTimeout(t);if(!res.ok)throw new Error('HTTP '+res.status);return res}catch(e){last=e;if(i===cfg.retries)break;await sleep(cfg.base*Math.pow(cfg.factor,i)+Math.random()*150)}}throw last}

/* Self-care tracker + Garden */
(function(){
  const KEY='bloom_selfcare_actions';
  const load=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'[]')}catch{return[]}};
  const save=v=>localStorage.setItem(KEY,JSON.stringify(v));
  function record(source){const a=load();a.push({t:Date.now(),source:source||'unknown'});save(a);updateGarden()}
  function updateGarden(){
    const gardenText=$('#garden-text'),wrap=$('#garden-plants');if(!gardenText||!wrap)return;
    const a=load(),now=Date.now(),weekMs=7*24*60*60*1000,count=a.filter(x=>now-x.t<=weekMs).length;
    gardenText.textContent=count===0?'No blooms yet this week. One tiny act will plant the first seed 🌱':`This week you watered yourself ${count} time${count>1?'s':''}. Your garden is growing 🌱`;
    wrap.innerHTML='';const n=Math.min(Math.max(count||1,1),12);for(let i=0;i<n;i++){const d=document.createElement('div');d.className='garden-plant';d.textContent=count>4?'🌸':'🌱';wrap.appendChild(d)}
  }
  window.bloomRecordSelfCare=record;window.bloomUpdateGarden=updateGarden;
  $$('[data-selfcare]').forEach(el=>el.addEventListener('click',()=>record(el.getAttribute('data-selfcare')||'unknown')));
  updateGarden();
})();

/* Theme toggle */
(function(){
  const btn=$('#theme-toggle');const key='bloom_theme';
  function apply(mode){document.documentElement.setAttribute('data-theme',mode==='auto'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):mode)}
  const saved=localStorage.getItem(key)||'auto';apply(saved);
  btn.addEventListener('click',()=>{const cur=localStorage.getItem(key)||'auto';const next=cur==='auto'?'dark':cur==='dark'?'light':'auto';localStorage.setItem(key,next);apply(next);btn.setAttribute('aria-label',`Theme ${next}`);btn.textContent=next==='dark'?'🌙':next==='light'?'☀️':'🌓'})})();

/* Nav + Smooth scroll */
(function(){
  const nav=$('#main-nav'),toggle=$('#nav-toggle');
  if(!nav||!toggle) return;
  toggle.addEventListener('click',()=>{const expanded=toggle.getAttribute('aria-expanded')==='true';toggle.setAttribute('aria-expanded',String(!expanded));nav.classList.toggle('open')});
  nav.addEventListener('click',e=>{if(e.target.tagName==='A'){nav.classList.remove('open');toggle.setAttribute('aria-expanded','false')}});
  const header=$('.site-header');const headerHeight=()=>header?header.offsetHeight:0;
  $$('a[href^="#"]').forEach(a=>a.addEventListener('click',e=>{const href=a.getAttribute('href');if(!href||href==='#')return;const id=href.slice(1),target=document.getElementById(id);if(!target)return;e.preventDefault();const top=target.getBoundingClientRect().top+scrollY-headerHeight()-12;window.scrollTo({top,behavior:'smooth'})}));
})();

/* Slideshow with progress */
(function(){
  const slides=$$('.slide'),dotsWrap=$('#dots'),counterEl=$('#slide-counter'),statusEl=$('#slide-status'),progress=$('#slide-progress');
  if(!slides.length||!dotsWrap||!progress)return;
  let idx=0,autoplay=true,timer=null,pStart=0,pDur=6000;
  const updateCounter=()=>{if(counterEl)counterEl.textContent=`${idx+1} / ${slides.length}`};
  function renderDots(){dotsWrap.innerHTML='';slides.forEach((_,i)=>{const d=document.createElement('button');d.type='button';d.className='dot'+(i===idx?' active':'');d.setAttribute('aria-label',`Go to slide ${i+1}`);d.addEventListener('click',()=>goTo(i));dotsWrap.appendChild(d)})}
  function show(i){slides.forEach((s,k)=>s.classList.toggle('active',k===i));idx=i;updateCounter();renderDots();statusEl&&(statusEl.textContent=`Slide ${idx+1} of ${slides.length}`);progress.style.inset='0 100% 0 0';pStart=performance.now()}
  const goTo=(i)=>{show(i);autoplay=false;start()};
  const next=()=>show((idx+1)%slides.length);const prev=()=>show((idx-1+slides.length)%slides.length);
  function loop(t){if(!autoplay)return;const pct=Math.min(1,(t-pStart)/pDur);progress.style.inset=`0 ${100-pct*100}% 0 0`;if(pct>=1){next();pStart=t}timer=requestAnimationFrame(loop)}
  function start(){if(timer)cancelAnimationFrame(timer);pStart=performance.now();timer=requestAnimationFrame(loop)}
  function stop(){if(timer)cancelAnimationFrame(timer)}
  $('#next').addEventListener('click',()=>{autoplay=false;next();start()});
  $('#prev').addEventListener('click',()=>{autoplay=false;prev();start()});
  $('#slideshow').addEventListener('mouseenter',()=>{autoplay=false;stop()});
  $('#slideshow').addEventListener('mouseleave',()=>{autoplay=true;start()});
  document.addEventListener('visibilitychange',()=>{autoplay=!document.hidden;if(autoplay)start();else stop()});
  renderDots();show(0);if(!preferReduced)start();
})();

/* Gentle banner */
(function(){
  const el=$('#gentle-reminder');if(!el)return;
  const messages=['You don’t have to do everything today. Small steps count.','Your worth is not measured by productivity.','It’s okay to pause. Rest is part of growth.','You are learning, not failing.','You deserve kindness — especially from yourself.'];
  el.textContent=messages[Math.floor(Math.random()*messages.length)];
})();

/* Affirmations */
(function(){
  const btn=$('#affBtn'),out=$('#affirmation');if(!btn||!out)return;
  const list=['I am allowed to rest.','I am learning and growing.','I can handle what comes.','I am enough.','I choose progress over perfection.','I will move gently today.'];
  btn.addEventListener('click',()=>{out.textContent=list[Math.floor(Math.random()*list.length)];window.bloomRecordSelfCare&&window.bloomRecordSelfCare('affirmation')});
})();

/* Scroll reveal */
(function(){
  const reveals=$$('.reveal,.reveal-item');if(!reveals.length)return;
  if(!('IntersectionObserver'in window)){reveals.forEach(el=>el.classList.add('visible'));return}
  const obs=new IntersectionObserver(es=>{es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('visible');obs.unobserve(e.target)}})},{threshold:.12});
  reveals.forEach(el=>obs.observe(el));
})();

/* Mood check */
(function(){
  const container=$('.mood-check'),msg=$('#mood-message');if(!container||!msg)return;
  const texts={low:'I’m glad you checked in. It’s okay to feel low. You deserve gentleness. Maybe a tiny rest or a few slow breaths?',meh:'Meh days are valid too. Tiny, kind steps are enough.',ok:'Feeling okay is still a feeling. Note one small thing that went alright today.',good:'Nice. Maybe capture one good moment in your journal.',great:'Love that for you. Use this energy gently — no need to do everything at once!'};
  container.querySelectorAll('button[data-mood]').forEach(b=>b.addEventListener('click',()=>{const m=b.getAttribute('data-mood');msg.textContent=texts[m]||'';window.bloomRecordSelfCare&&window.bloomRecordSelfCare('mood-'+m);const jm=$('#journalMood');if(jm)jm.value=m}))
})();

/* Breathing coach */
(function(){
  const btn=$('#breath-start'),resetBtn=$('#breath-reset'),bubble=$('#breath-bubble'),textEl=$('#breath-instruction'),patSel=$('#breath-pattern'),minsInput=$('#breath-mins'),voiceChk=$('#breath-voice');
  if(!btn||!bubble||!textEl)return;
  let running=false,stepIdx=0,steps=[],endAt=0,rafId=0,currentStepEnd=0;

  function say(s){ if(!voiceChk?.checked) return; try{ const u=new SpeechSynthesisUtterance(s); u.rate=1; u.pitch=1; speechSynthesis.cancel(); speechSynthesis.speak(u);}catch{} }
  function parsePattern(v){
    if(v==='4-7-8')return[{l:'Inhale',s:4},{l:'Hold',s:7},{l:'Exhale',s:8}];
    if(v==='4-4-4-4')return[{l:'Inhale',s:4},{l:'Hold',s:4},{l:'Exhale',s:4},{l:'Hold',s:4}];
    if(v==='5-5')return[{l:'Inhale',s:5},{l:'Exhale',s:5}];
    return[{l:'Inhale',s:4},{l:'Hold',s:4},{l:'Exhale',s:8}];
  }
  function setBubbleScale(label){let scale=1;if(label==='Inhale')scale=1.22;else if(label==='Hold')scale=(bubble.style.transform.includes('1.22'))?1.22:0.92;else if(label==='Exhale')scale=0.86;bubble.style.transition='transform .8s ease-in-out';bubble.style.transform=`scale(${scale})`;}
  function buildSteps(){const p=parsePattern(patSel.value);steps=p.map(x=>({label:x.l,ms:x.s*1000}))}
  function start(){
    buildSteps();const totalMs=(parseInt(minsInput.value,10)||1)*60*1000;running=true;btn.textContent='Pause';btn.classList.add('playing');say('Starting breathing');stepIdx=0;endAt=performance.now()+totalMs;currentStepEnd=performance.now()+steps[0].ms;textEl.textContent=`${steps[0].label}…`;setBubbleScale(steps[0].label);window.bloomRecordSelfCare&&window.bloomRecordSelfCare('breathing');
    const loop=(ts)=>{if(!running){cancelAnimationFrame(rafId);return}if(ts>=endAt){stop(true);return}if(ts>=currentStepEnd){stepIdx=(stepIdx+1)%steps.length;const st=steps[stepIdx];textEl.textContent=`${st.label}…`;say(st.label);setBubbleScale(st.label);currentStepEnd=ts+st.ms}rafId=requestAnimationFrame(loop)};
    rafId=requestAnimationFrame(loop)
  }
  function stop(done=false){running=false;btn.textContent='Start';btn.classList.remove('playing');bubble.style.transform='scale(1)';textEl.textContent=done?'Well done. You can repeat this whenever you like.':'Paused. Tap start to continue.'}
  btn.addEventListener('click',()=>{if(running){stop(false);return}stop(false);start()});
  resetBtn?.addEventListener('click',()=>{stop(false);textEl.textContent='Tap start when you’re ready.'});
})();

/* Firebase (optional) */
let FB = { enabled:false };
async function initFirebaseIfAvailable(){
  const cfg = window.__firebase_config;
  if(!cfg){ FB.enabled=false; return; }
  try{
    const [{ initializeApp }] = await Promise.all([
      import("https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js"),
    ]);
    const [
      { getAuth, signInAnonymously, signInWithCustomToken },
      { getFirestore, collection, setDoc, getDocs, doc, query, orderBy, enableIndexedDbPersistence }
    ] = await Promise.all([
      import("https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js"),
      import("https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js"),
    ]);

    const app = initializeApp(cfg);
    const auth = getAuth(app);
    if(window.__initial_auth_token){
      try{ await signInWithCustomToken(auth, window.__initial_auth_token); }
      catch{ await signInAnonymously(auth); }
    }else{
      await signInAnonymously(auth);
    }

    const db = getFirestore(app);
    try{ await enableIndexedDbPersistence(db); }catch{}

    FB = {
      enabled:true, app, auth, db,
      api: { collection, setDoc, getDocs, doc, query, orderBy },
      coll(uid){
        return collection(db,"artifacts", (window.__app_id||"default-app"), "users", (uid||"anonymous"), "journal_entries");
      }
    };
    toast("Firestore connected","ok");
  }catch(e){
    FB.enabled=false; toast("Firestore unavailable — using local journal","info");
  }
}

/* Gemini client */
const GEMINI_MODEL="gemini-2.5-flash-preview-09-2025";
const GEMINI_BASE="https://generativelanguage.googleapis.com/v1beta";
function haveGemini(){return Boolean(window.__gemini_api_key&&String(window.__gemini_api_key).trim());}
function toContents(history){const sys=history.find(h=>h.role==='system')?.content||"";const rest=history.filter(h=>h.role!=='system');const contents=rest.map(h=>({role:h.role==='model'?'model':'user',parts:[{text:(h.role==='user'&&sys&&rest.indexOf(h)===0)?(sys+"\n\n"+h.content):h.content}]}));return contents.length?contents:[{role:"user",parts:[{text:sys||"You are a helpful assistant."}]}];}
async function* geminiStream({history, grounded=false, temperature=0.6}){
  if(!haveGemini()) throw new Error("no-key");
  const url=`${GEMINI_BASE}/models/${encodeURIComponent(GEMINI_MODEL)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(window.__gemini_api_key)}`;
  const res=await fetchWithBackoff(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({contents:toContents(history),generationConfig:{temperature},...(grounded?{tools:[{googleSearchRetrieval:{}}]}:{})})},{retries:2});
  const reader=res.body.getReader();const dec=new TextDecoder();let buf="";
  while(true){const {value,done}=await reader.read();if(done)break;buf+=dec.decode(value,{stream:true});const lines=buf.split("\n");for(let i=0;i<lines.length-1;i++){const l=lines[i].trim();if(!l.startsWith("data:"))continue;const payload=l.slice(5).trim();if(payload==="[DONE]")return;try{const obj=JSON.parse(payload);const delta=obj?.candidates?.[0]?.content?.parts?.map(p=>p.text||"").join("")||"";if(delta)yield delta}catch{}}buf=lines[lines.length-1];}
}
async function geminiOnce(args){let out="";for await(const t of geminiStream(args)) out+=t;return out;}

/* Journaling (creative prompts + Firestore mirror) */
(function(){
  const KEY='bloom_journal_v2';
  const els={list:$('#entry-list'),title:$('#journalTitle'),text:$('#journalText'),mood:$('#journalMood'),tags:$('#journalTags'),search:$('#jrnl-search'),filter:$('#jrnl-filter'),status:$('#jrnl-status'),stats:$('#jrnl-stats'),btnNew:$('#newEntry'),btnSave:$('#saveEntry'),btnTxt:$('#exportTxt'),btnJson:$('#exportJson'),import:$('#importJson')};
  const promptsPanel=$('#jrnl-prompts-panel'),promptsUl=$('#jrnl-prompts'),regenBtn=$('#jrnl-regenerate');
  let entries=load(),currentId=null,autosaveTimer=null,searchTerm='',filterMood='',userId='local';

  function load(){try{return JSON.parse(localStorage.getItem(KEY)||'[]')}catch{return[]}}
  function saveLocal(){localStorage.setItem(KEY,JSON.stringify(entries))}
  function moodIcon(m){return m==='low'?'😔':m==='meh'?'😕':m==='ok'?'🙂':m==='good'?'😊':m==='great'?'🌟':'📝'}
  const escape=s=>(s||'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  function stats(){const t=els.text.value||'';const words=(t.trim().match(/\S+/g)||[]).length;const chars=t.length;els.stats.textContent=`${words} words • ${chars} chars`}
  const flash=s=>{els.status.textContent=s;setTimeout(()=>els.status.textContent='',1200)}
  function renderList(){
    const term=(searchTerm||'').toLowerCase();
    const filtered=entries.filter(e=>{const okMood=!filterMood||e.mood===filterMood;const okTerm=!term||(e.title?.toLowerCase().includes(term)||e.text?.toLowerCase().includes(term)||(e.tags||[]).join(',').toLowerCase().includes(term));return okMood&&okTerm}).sort((a,b)=> (b.t||0)-(a.t||0));
    els.list.innerHTML='';if(!filtered.length){els.list.innerHTML='<div class="stats">No entries yet.</div>';return}
    filtered.forEach(e=>{const it=document.createElement('button');it.type='button';it.className='entry-item'+(e.id===currentId?' active':'');it.innerHTML=`<div style="font-size:18px">${moodIcon(e.mood)}</div>
      <div style="text-align:left"><div style="font-weight:700">${escape(e.title)||'(untitled)'}</div><small style="color:var(--muted)">${new Date(e.t).toLocaleString()} • ${(e.tags||[]).join(', ')}</small></div>
      <span class="jrnl-del" style="margin-left:auto;color:#ef4444;font-weight:700;cursor:pointer" aria-label="Delete" title="Delete">✕</span>`;
      it.addEventListener('click',ev=>{if(ev.target.classList.contains('jrnl-del')){doDelete(e.id);return}currentId=e.id;renderList();fill(e)});els.list.appendChild(it)
    })
  }
  function fill(e){els.title.value=e.title||'';els.text.value=e.text||'';els.tags.value=(e.tags||[]).join(', ');els.mood.value=e.mood||'';stats();maybeShowPrompts(e);setPromptResponses(e)}
  function cur(){return entries.find(x=>x.id===currentId)||null}
  function newEntry(){const e={id:crypto.randomUUID(),t:Date.now(),title:'',text:'',tags:[],mood:els.mood.value||'',promptResponses:{}};entries.unshift(e);currentId=e.id;renderList();fill(e);flash('New entry created')}
  async function doDelete(id){
    const yes=await confirmModal('Delete entry?','This removes the journal entry. This cannot be undone.'); if(!yes) return;
    const i=entries.findIndex(x=>x.id===id); if(i>-1)entries.splice(i,1); if(currentId===id)currentId=entries[0]?.id||null; saveLocal(); renderList(); if(currentId)fill(cur()); else clear();
  }
  function clear(){els.title.value='';els.text.value='';els.tags.value='';els.mood.value='';stats()}
  async function update(){
    const e=cur();if(!e)return;
    e.title=els.title.value.trim(); e.text=els.text.value; e.tags=els.tags.value.split(',').map(s=>s.trim()).filter(Boolean); e.mood=els.mood.value; e.t=Date.now();
    e.promptResponses = collectPromptResponses(e.promptResponses||{});
    saveLocal(); renderList(); flash('Saved');
    if(FB.enabled){ try{
      const { api } = FB; const coll=FB.coll('local'); const ref=api.doc(coll,e.id);
      await api.setDoc(ref,{title:e.title,text:e.text,tags:e.tags,mood:e.mood,promptResponses:e.promptResponses,updatedAt:e.t,createdAt:e.createdAt||e.t},{merge:true});
    }catch{ toast('Cloud save failed (local copy kept)','error'); } }
  }

  const FALLBACK_PROMPTS = [
    "If this feeling were a color, what shade would it be?",
    "Describe the last five minutes of your day as a scene in a novel.",
    "What is one tiny, perfect thing you noticed today?"
  ];
  function promptItem(t,i,v=''){return `<li><div><strong>${t}</strong></div><textarea rows="2" data-prompt="${i}" placeholder="Your response…">${escape(v)}</textarea></li>`}
  function collectPromptResponses(prev={}){
    const out={...prev};promptsUl?.querySelectorAll('textarea[data-prompt]').forEach(ta=>{const k=ta.dataset.prompt;const val=ta.value.trim();if(val) out[k]=val});return out;
  }
  function setPromptResponses(e){
    if(!promptsUl) return;
    promptsUl.querySelectorAll('textarea[data-prompt]').forEach(ta=>{const k=ta.dataset.prompt;ta.value=(e.promptResponses||{})[k]||''});
  }
  function maybeShowPrompts(e){
    const base=(els.text.value||'').trim();
    if(base.length>=180){promptsPanel.classList.remove('hidden'); if(!promptsUl.children.length){renderFallbackPrompts(e);}}
    else{promptsPanel.classList.add('hidden')}
  }
  function renderFallbackPrompts(e){promptsUl.innerHTML=FALLBACK_PROMPTS.map((t,i)=>promptItem(t,i,(e?.promptResponses||{})[i]||'')).join('')}

  async function regeneratePrompts(){
    const e=cur(); if(!promptsUl) return;
    promptsUl.innerHTML='<li class="stats">Thinking…</li>';
    try{
      if(!haveGemini()) throw new Error('no-key');
      const out = await geminiOnce({
        history:[
          {role:'system',content:'Generate three single-sentence creative journaling prompts that encourage gentle reflection. Avoid therapy jargon. Be concrete and imaginative.'},
          {role:'user',content:`Recent writing:\n"""${(els.text.value||'').slice(0,600)}"""\nReturn only three prompts as separate lines.`}
        ],
        temperature:.9
      });
      const lines=(out||'').split(/\n+/).map(s=>s.replace(/^\s*[-*•]\s*/,'').trim()).filter(Boolean).slice(0,3);
      const arr = lines.length?lines:FALLBACK_PROMPTS;
      promptsUl.innerHTML = arr.map((t,i)=>promptItem(t,i,(e?.promptResponses||{})[i]||'')).join('');
      toast(lines.length?'Prompts updated':'Fallback prompts used','info');
    }catch{
      renderFallbackPrompts(e); toast('Prompts fallback','info');
    }
  }
  $('#jrnl-regenerate')?.addEventListener('click',regeneratePrompts);

  (async function init(){
    await initFirebaseIfAvailable(); 
    if(!entries.length)newEntry();else{currentId=entries[0].id;renderList();fill(entries[0])}stats();
    if(FB.enabled){
      try{
        const { api } = FB; const coll=FB.coll('local'); const q=api.query(coll, api.orderBy('updatedAt','desc')); const snap=await api.getDocs(q);
        const imported=[]; snap.forEach(ds=>{const d=ds.data(); if(d.deleted)return; imported.push({id:ds.id,title:d.title||'',text:d.text||'',tags:d.tags||[],mood:d.mood||'',promptResponses:d.promptResponses||{},t:d.updatedAt||Date.now(),createdAt:d.createdAt||Date.now()})});
        if(imported.length){ entries = imported; saveLocal(); currentId = entries[0].id; renderList(); fill(entries[0]); }
        toast('Loaded entries from cloud','ok');
      }catch{ /* ignore */ }
    }
  })();

  function clear(){els.title.value='';els.text.value='';els.tags.value='';els.mood.value='';stats()}
})();

/* Focus timer */
(function(){
  const disp=$('#tmr-display'),startBtn=$('#tmr-start'),pauseBtn=$('#tmr-pause'),resetBtn=$('#tmr-reset'),presetSel=$('#tmr-preset'),focusIn=$('#tmr-focus'),breakIn=$('#tmr-break');
  if(!disp) return;
  let mode='focus',end=0,timer=null,running=false;
  const setPreset=v=>{const[f,b]=v.split('-').map(Number);focusIn.value=f;breakIn.value=b;setMode('focus')};presetSel.addEventListener('change',()=>setPreset(presetSel.value));
  function setMode(m){mode=m;disp.style.color=m==='focus'?'#16a34a':'#0ea5e9';updateDisp((m==='focus'?focusIn.value:breakIn.value)*60)}
  const updateDisp=sec=>{const m=String(Math.floor(sec/60)).padStart(2,'0'),s=String(Math.floor(sec%60)).padStart(2,'0');disp.textContent=`${m}:${s}`}
  function tick(){const left=Math.max(0,Math.round((end-Date.now())/1000));updateDisp(left);if(left<=0){notify(`${mode==='focus'?'Focus':'Break'} session ended`);mode=mode==='focus'?'break':'focus';const next=(mode==='focus'?focusIn.value:breakIn.value)*60*1000;end=Date.now()+next;window.bloomRecordSelfCare&&window.bloomRecordSelfCare('focus-'+mode)}if(running)timer=setTimeout(tick,250)}
  function start(){if(running)return;running=true;const ms=(mode==='focus'?focusIn.value:breakIn.value)*60*1000;end=Date.now()+ms;tick()}
  function pause(){running=false;clearTimeout(timer)}
  function reset(){pause();setMode('focus')}
  startBtn.addEventListener('click',start);pauseBtn.addEventListener('click',pause);resetBtn.addEventListener('click',reset);
  function notify(msg){if('Notification'in window){if(Notification.permission==='granted'){new Notification('BloomSpace',{body:msg})}else if(Notification.permission!=='denied'){Notification.requestPermission()}}}
  setPreset(presetSel.value);
})();

/* Calm music */
(function(){
  const audio=$('#calm-audio'),select=$('#calm-select'),toggle=$('#calm-toggle'),vol=$('#calm-volume'),muteBtn=$('#calm-mute');
  if(!audio||!select||!toggle)return;
  const sounds={rain:{name:'Rain on Window',src:'/static/audio/rain.mp3'},piano:{name:'Soft Pad',src:'/static/audio/piano.mp3'},lofi:{name:'Lo-fi Focus',src:'/static/audio/lofi.mp3'},forest:{name:'Forest Birds',src:'/static/audio/forest.mp3'},ocean:{name:'Ocean Waves',src:'/static/audio/ocean.mp3'}};
  let isPlaying=false,ctx=null,engine=null,muted=false,dropOsc=null;

  const ensureCtx=()=>{if(!ctx){try{ctx=new (window.AudioContext||window.webkitAudioContext)()}catch{}}return ctx};
  function loadSound(key){const s=sounds[key]||sounds.rain;audio.src=s.src;audio.load()}
  async function tryPlayFile(){try{await audio.play();isPlaying=true;toggle.textContent='Pause';toggle.classList.add('playing');return true}catch{return false}}
  function startSynth(mode){const ac=ensureCtx();if(!ac)return;stopSynth();engine=createEngine(ac,mode);engine.start()}
  function stopSynth(){if(engine){engine.stop();engine=null}if(dropOsc){try{dropOsc.stop()}catch{} dropOsc=null}
  }
  select.addEventListener('change',async()=>{if(!isPlaying)return;stopSynth();loadSound(select.value);const ok=await tryPlayFile();if(!ok)startSynth(select.value)});
  toggle.addEventListener('click',async()=>{if(!isPlaying){localStorage.setItem('bloom_calm_sound',select.value);ensureCtx()?.resume?.();loadSound(select.value);const ok=await tryPlayFile();if(!ok){startSynth(select.value);isPlaying=true;toggle.textContent='Pause';toggle.classList.add('playing')}window.bloomRecordSelfCare&&window.bloomRecordSelfCare('calm-music')}else{audio.pause();stopSynth();isPlaying=false;toggle.textContent='Play';toggle.classList.remove('playing')}})
  vol.addEventListener('input',()=>{audio.volume=Number(vol.value);if(engine)engine.setGain(Number(vol.value))});
  muteBtn.addEventListener('click',()=>{muted=!muted;muteBtn.setAttribute('aria-pressed',String(muted));if(engine)engine.setGain(muted?0:Number(vol.value));audio.muted=muted;muteBtn.textContent=muted?'Unmute':'Mute'});
  const last=localStorage.getItem('bloom_calm_sound');if(last)select.value=last;

  function createEngine(ac,mode){
    const g=ac.createGain();g.gain.value=Number(vol.value);g.connect(ac.destination);
    const api={start(){},stop(){},setGain(v){g.gain.value=v}};
    function noise(color='white'){const b=ac.createBuffer(1,ac.sampleRate*2,ac.sampleRate);const d=b.getChannelData(0);let lastOut=0;for(let i=0;i<d.length;i++){const w=Math.random()*2-1;if(color==='white')d[i]=w;else if(color==='pink'){lastOut=0.997*lastOut+0.05*w;d[i]=lastOut}else if(color==='brown'){lastOut=(lastOut+0.02*w)/1.02;d[i]=lastOut*3.5}}const src=ac.createBufferSource();src.buffer=b;src.loop=true;return src}
    if(mode==='rain'){
      const n=noise('pink');const lp=ac.createBiquadFilter();lp.type='lowpass';lp.frequency.value=4500;const hp=ac.createBiquadFilter();hp.type='highpass';hp.frequency.value=400;n.connect(lp).connect(hp).connect(g);
      let dropsTimer;api.start=()=>{n.start();const dropOsc=ac.createOscillator();const dg=ac.createGain();dg.gain.value=0;dropOsc.type='triangle';dropOsc.frequency.value=800;dropOsc.connect(dg).connect(g);dropOsc.start();dropsTimer=setInterval(()=>{dg.gain.cancelScheduledValues(ac.currentTime);dg.gain.setValueAtTime(0,ac.currentTime);dg.gain.linearRampToValueAtTime(.2,ac.currentTime+.02);dg.gain.exponentialRampToValueAtTime(.0001,ac.currentTime+.25)},1200)};api.stop=()=>{try{n.stop()}catch{} clearInterval(dropsTimer);}
    }
    else if(mode==='ocean'){const n=noise('brown');const lp=ac.createBiquadFilter();lp.type='lowpass';lp.frequency.value=700;const amp=ac.createGain();amp.gain.value=.6;const lfo=ac.createOscillator(),lfoG=ac.createGain();lfo.frequency.value=.08;lfoG.gain.value=.5;lfo.connect(lfoG).connect(amp.gain);n.connect(lp).connect(amp).connect(g);api.start=()=>{n.start();lfo.start()};api.stop=()=>{try{n.stop()}catch{}try{lfo.stop()}catch{}}}
    else if(mode==='forest'){const base=noise('pink');const bp=ac.createBiquadFilter();bp.type='bandpass';bp.frequency.value=3000;bp.Q.value=1.2;base.connect(bp).connect(g);let chirpTimer;api.start=()=>{base.start();chirpTimer=setInterval(()=>{const o=ac.createOscillator(),a=ac.createGain();o.type='sine';o.frequency.value=1200+Math.random()*800;a.gain.value=0;o.connect(a).connect(g);o.start();a.gain.setValueAtTime(0,ac.currentTime);a.gain.linearRampToValueAtTime(.15,ac.currentTime+.03);a.gain.exponentialRampToValueAtTime(.0001,ac.currentTime+.25);o.stop(ac.currentTime+.26)},1600)};api.stop=()=>{clearInterval(chirpTimer);try{base.stop()}catch{}}}
    else if(mode==='lofi'){const o1=ac.createOscillator(),o2=ac.createOscillator(),f=ac.createBiquadFilter(),a=ac.createGain();o1.type='sawtooth';o2.type='sawtooth';o1.frequency.value=220;o2.frequency.value=221.2;f.type='lowpass';f.frequency.value=900;a.gain.value=.25;o1.connect(f);o2.connect(f);f.connect(a).connect(g);const crackle=noise('white'),cg=ac.createGain();cg.gain.value=0.02;crackle.connect(cg).connect(g);api.start=()=>{o1.start();o2.start();crackle.start()};api.stop=()=>{try{o1.stop();o2.stop();crackle.stop()}catch{}}}
    else{const o=ac.createOscillator(),a=ac.createGain(),f=ac.createBiquadFilter();o.type='sine';o.frequency.value=220;a.gain.value=0;f.type='lowpass';f.frequency.value=1200;o.connect(f).connect(a).connect(g);api.start=()=>{o.start();a.gain.linearRampToValueAtTime(.3,ac.currentTime+1.5)};api.stop=()=>{try{o.stop()}catch{}}}
    return api
  }
})();

/* Resources */
(function(){
  const grid=$('#resources-grid');if(!grid)return;
  const resources=[
    {title:'🇮🇳 India — Emergency',body:'Dial 112 (24×7) for police, fire, or medical emergencies.',links:[{text:'Call 112',href:'tel:112'}],note:'ERSS single emergency number.'},
    {title:'Tele-MANAS (India, 24×7)',body:'Free government mental health support; many languages.',links:[{text:'Call 14416',href:'tel:14416'},{text:'Call 1-800-91-4416',href:'tel:+1800914416'}],note:'Govt of India Tele-MANAS.'},
    {title:'KIRAN (India, 24×7)',body:'National mental health rehabilitation helpline.',links:[{text:'Call 1800-599-0019',href:'tel:+18005990019'}],note:'Ministry of Social Justice & Empowerment.'},
    {title:'Vandrevala Foundation (24×7)',body:'Counselling for depression, anxiety, suicidal thoughts.',links:[{text:'Call +91 9999 666 555',href:'tel:+919999666555'},{text:'WhatsApp',href:'https://wa.me/919999666555'}]},
    {title:'iCALL — TISS (India)',body:'Professional psychosocial counselling (phone & chat).',links:[{text:'Call 022-2552-1111',href:'tel:+912225521111'},{text:'Chat 9152987821',href:'tel:+919152987821'},{text:'Email icall@tiss.edu',href:'mailto:icall@tiss.edu'}]},
    {title:'Befrienders Worldwide (Global)',body:'Find confidential emotional support in your country.',links:[{text:'Open directory',href:'https://befrienders.org/'}]},
    {title:'IASP Crisis Centres (Global)',body:'International directory of crisis support.',links:[{text:'Open directory',href:'https://www.iasp.info/crisis-centres-helplines/'}]}
  ];
  for(const r of resources){
    const card=document.createElement('div');card.className='resource-card';
    card.innerHTML=`<strong>${r.title}</strong><p>${r.body}</p><div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:6px;">${(r.links||[]).map(l=>`<a class="btn" target="_blank" rel="noopener" href="${l.href}">${l.text}</a>`).join('')}</div>${r.note?`<p class="sos-note" style="margin-top:6px;">${r.note}</p>`:''}`;
    grid.appendChild(card)
  }
})();

/* SOS overlay */
(function(){
  const sosBtn=$('#sos-button'),overlay=$('#sos-overlay'),closeBtn=overlay?.querySelector('.sos-close'),closeMain=overlay?.querySelector('.sos-close-main'),backdrop=overlay?.querySelector('.sos-backdrop');
  if(!sosBtn||!overlay)return;let lastFocus=null;
  function trap(e){const f=overlay.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])');const first=f[0],last=f[f.length-1];if(e.key!=='Tab')return;if(e.shiftKey&&document.activeElement===first){last.focus();e.preventDefault()}else if(!e.shiftKey&&document.activeElement===last){first.focus();e.preventDefault()}}
  function open(){lastFocus=document.activeElement;overlay.classList.add('open');overlay.setAttribute('aria-hidden','false');document.body.style.overflow='hidden';overlay.addEventListener('keydown',trap);closeBtn.focus()}
  function close(){overlay.classList.remove('open');overlay.setAttribute('aria-hidden','true');document.body.style.overflow='';overlay.removeEventListener('keydown',trap);lastFocus?.focus?.()}
  sosBtn.addEventListener('click',open);[closeBtn,closeMain,backdrop].forEach(b=>b.addEventListener('click',close));document.addEventListener('keydown',e=>{if(e.key==='Escape'&&overlay.classList.contains('open'))close()});
})();

/* Insight Flashcards (with photo) */
(function(){
  const btn=$('#insight-refresh'),tag=$('#insight-tag'),txt=$('#insight-text'),sel=$('#insight-select'),img=$('#insight-img'); if(!btn||!txt||!img) return;

  const FALLBACK_IMG = {
    "Psychology":"https://images.unsplash.com/photo-1503676260728-1c00da094a0b?q=80&w=1280&auto=format&fit=crop",
    "Nature & Travel":"https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?q=80&w=1280&auto=format&fit=crop",
    "Literature & Culture":"https://images.unsplash.com/photo-1495446815901-a7297e633e8d?q=80&w=1280&auto=format&fit=crop",
    "Music":"https://images.unsplash.com/photo-1510915361894-db8b60106cb1?q=80&w=1280&auto=format&fit=crop",
    "Games":"https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=1280&auto=format&fit=crop"
  };
  const FALLBACK_TEXT = {
    "Psychology":"The Zeigarnik effect suggests we remember unfinished tasks more than finished ones — writing open loops can free mental space.",
    "Nature & Travel":"Just 10 minutes near trees or water can measurably reduce stress markers — a tiny dose of biophilia.",
    "Literature & Culture":"Stoics used ‘premeditatio malorum’ — imagining setbacks in advance — to reduce shock and build calm readiness.",
    "Music":"Slow, steady rhythms (≈60–80 BPM) can entrain breathing and gently lower arousal during light tasks.",
    "Games":"Flow tends to appear when challenge and skill are balanced and feedback is immediate — neither boredom nor overwhelm."
  };

  function setCard(cat, text, image){
    tag.textContent = cat;
    txt.textContent = (text||'').trim() || FALLBACK_TEXT[cat] || 'Here’s a gentle insight for today.';
    img.src = (image && /^https?:\/\//i.test(image)) ? image : (FALLBACK_IMG[cat] || FALLBACK_IMG["Nature & Travel"]);
  }

  setCard('Psychology', FALLBACK_TEXT['Psychology'], FALLBACK_IMG['Psychology']);

  btn.addEventListener('click', async ()=>{
    const cat = sel.value;
    setCard(cat, 'Thinking…', FALLBACK_IMG[cat]);

    try{
      if(!haveGemini()) throw new Error('no-key');
      const out = await geminiOnce({
        grounded:true, temperature:.4,
        history:[
          {role:'system',content:'Return ONLY compact JSON with keys "text" (1–3 sentence factual insight) and "image" (royalty-free web image URL). Keep it safe for all audiences.'},
          {role:'user',content:`Category: ${cat}. Provide a short, grounded insight (no lists).`}
        ]
      });

      let data=null;
      try{ data = JSON.parse(out.trim()); }catch{ 
        const m = out.match(/\{[\s\S]*\}/); if(m){ try{ data = JSON.parse(m[0]); }catch{} }
      }
      const text=(data&&data.text)||FALLBACK_TEXT[cat];
      const image=(data&&data.image)||FALLBACK_IMG[cat];
      setCard(cat, text, image);
    }catch(e){
      setCard(cat, FALLBACK_TEXT[cat], FALLBACK_IMG[cat]);
      if(e.message!=='no-key') toast('Insight error — showing fallback','error'); else toast('Set window.__gemini_api_key for grounded insights with photos.','info');
    }
  });
})();
