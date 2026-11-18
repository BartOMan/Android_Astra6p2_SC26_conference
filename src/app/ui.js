(function () {
  'use strict';

  const $ = selector => document.querySelector(selector);
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  })[ch]);
  const paths = {
    schedule:'<rect x="3.5" y="5" width="17" height="16" rx="2"/><path d="M7 3v5m10-5v5M4 11h16m-12 4h4"/>',
    topics:'<path d="m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5"/>',
    people:'<circle cx="9" cy="8" r="3"/><path d="M3 20v-1a6 6 0 0 1 12 0v1M16 5a3 3 0 0 1 0 6m1 3a5 5 0 0 1 4 5"/>',
    planner:'<path d="m4 18 6-6 4 2 6-9m-5 0h5v5"/><circle cx="4" cy="18" r="1.5"/>',
    saved:'<path d="M6 4h12v17l-6-4-6 4z"/>',
    search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
    filter:'<path d="M3 7h6m4 0h8M3 17h10m4 0h4"/><circle cx="11" cy="7" r="2"/><circle cx="15" cy="17" r="2"/>',
    room:'<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2"/>',
    clock:'<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
    stack:'<path d="M4 5h16v10H4zM7 18h10m-8 3h6"/>'
  };
  const icon = name => '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + (paths[name] || '') + '</svg>';
  const data = window.SC_DATA || {};
  const events = Array.isArray(data.events) ? data.events.slice() : [];
  const people = Array.isArray(data.people) ? data.people : [];
  const engine = window.Engine || {};
  const normalize = engine.normalize || (str => String(str || '').toLowerCase().trim());
  const byId = new Map(events.map(e => [e.id,e]));
  const peopleById = new Map(people.filter(p => p && p.id).map(p => [p.id,p]));
  const peopleByName = new Map(people.map(p => [normalize(p.name),p]));
  const dateOf = e => e.day || e.date || '';
  const formatList = e => (Array.isArray(e.formats) && e.formats.length ? e.formats : Array.isArray(e.format) ? e.format : [e.format || 'Unspecified']);
  const formatOf = e => formatList(e).join(' · ');
  const peopleOf = e => (e.people || []).map(p => typeof p === 'string' ? (peopleById.get(p) || {name:p}) : p).filter(p => p && p.name);
  const children = new Map();
  for (const e of events) if (e.parentId) {
    if (!children.has(e.parentId)) children.set(e.parentId,[]);
    children.get(e.parentId).push(e);
  }
  const compare = (a,b) => dateOf(a).localeCompare(dateOf(b)) || (a.start || '99').localeCompare(b.start || '99') ||
    (a.end || '99').localeCompare(b.end || '99') || (a.title || '').localeCompare(b.title || '');
  events.sort(compare);
  children.forEach(group => group.sort(compare));
  const days = [...new Set(events.map(dateOf).filter(Boolean))].sort();
  const formats = [...new Set(events.flatMap(formatList))].sort();
  const rooms = [...new Set(events.map(e => e.room).filter(Boolean))].sort((a,b) => a.localeCompare(b,undefined,{numeric:true}));
  function centralDay() {
    if (engine.clock) return engine.clock().day;
    const parts = new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
    const part = name => parts.find(p => p.type === name).value;
    return part('year') + '-' + part('month') + '-' + part('day');
  }
  const today = centralDay();
  const defaultDay = days.includes(today) ? today : (days.find(d => d >= today) || days[0] || 'all');
  const ancillary = new Set(['Community Engagement','Exhibits','Reception','Career Fair','Job Posting']);
  const technical = e => formatList(e).some(format => !ancillary.has(format));
  const allScope = {scope:'all'};
  const emptyFilters = () => ({scope:'technical',query:'',format:'',room:'',time:'',hour:null,topic:'',person:'',mode:'blocks'});
  const state = {tab:'schedule',day:defaultDay,filters:emptyFilters(),expanded:false,limit:45,savedLimit:45};
  const key = 'sc26-field-guide.bookmarks.v1';
  let saved = new Set();
  try {
    const stored = JSON.parse(localStorage.getItem(key) || '[]');
    if (Array.isArray(stored)) saved = new Set(stored.filter(id => byId.has(id)));
  } catch (_) {}
  const nav = [['schedule','Schedule'],['topics','Topics'],['people','People'],['planner','Planner'],['saved','Saved']];
  const knownTabs = new Set(nav.map(t => t[0]));
  const names = new Map((engine.topics || []).map(t => [t.id,t.label]));
  const topicIds = e => engine.classify ? engine.classify(e) : (e.topics || []);
  const fmtDay = (day, opts={weekday:'long',month:'short',day:'numeric'}) => day ? new Intl.DateTimeFormat('en-US',{...opts,timeZone:'UTC'}).format(new Date(day + 'T12:00:00Z')) : 'Date unlisted';
  const clockText = time => {
    if (!time || !/^\d{1,2}:\d{2}$/.test(time)) return '';
    const [h,m] = time.split(':').map(Number);
    return (h % 12 || 12) + ':' + String(m).padStart(2,'0') + (h >= 12 ? ' PM':' AM');
  };
  const minutes = t => /^\d{1,2}:\d{2}$/.test(t || '') ? (Number(t.split(':')[0])*60 + Number(t.split(':')[1])) : NaN;
  const span = e => [clockText(e.start),clockText(e.end)].filter(Boolean).join(' – ') || 'Time unlisted';
  const unit = (name,s) => '<span class="meta-unit">' + icon(name) + esc(s) + '</span>';
  const texts = new WeakMap();
  function searchText(e) {
    if (texts.has(e)) return texts.get(e);
    const words = [e.title, e.scheduleTitle, e.description, e.room, formatOf(e), ...(e.topics || []).map(t => typeof t === 'object' ? t.label || t.name : t)];
    for (const p of peopleOf(e)) {
      const profile = (p.id && peopleById.get(p.id)) || peopleByName.get(normalize(p.name));
      words.push(p.name,p.role);
      if (profile) words.push(...(profile.institutions || []).map(a => a.name || a),...(profile.countries || []).map(a => a.name || a));
    }
    const text = normalize(words.filter(Boolean).join(' '));
    texts.set(e,text);
    return text;
  }
  const officialUrl = u => {
    try {
      const parsed = new URL(u);
      return /^https?:$/.test(parsed.protocol) ? parsed.href : '';
    } catch (_) { return ''; }
  };
  const opt = (v,label,current) => '<option value="' + esc(v) + '"' + (current===v?' selected':'') + '>' + esc(label) + '</option>';
  const activeDay = () => state.day === 'all' ? defaultDay : state.day;
  const isFiltered = () => {
    const f=state.filters;
    return !!(f.query.trim() || f.format || f.room || f.topic || f.person || f.time || f.hour !== null);
  };
  let currentRows = [], longRows = [];
  function filtered() {
    const f=state.filters;
    const terms=normalize(f.query).split(/\s+/).filter(Boolean);
    const person=normalize(f.person);
    const selectedMinute=minutes(f.time);
    const matched=events.filter(e => {
      if (state.day !== 'all' && dateOf(e) !== state.day) return false;
      if (f.scope === 'technical' && !technical(e)) return false;
      if (f.format && !formatList(e).includes(f.format)) return false;
      if (f.room && e.room !== f.room) return false;
      if (f.topic && !topicIds(e).includes(f.topic) && !(e.topics || []).includes(f.topic)) return false;
      if (person && !peopleOf(e).some(p => normalize(p.name) === person)) return false;
      if (Number.isFinite(selectedMinute) && !(minutes(e.start) <= selectedMinute && selectedMinute < minutes(e.end))) return false;
      if (f.hour !== null && !(minutes(e.start) < (f.hour+1)*60 && minutes(e.end) > f.hour*60)) return false;
      return !terms.length || terms.every(term => searchText(e).includes(term));
    });
    if (f.mode === 'individual') return matched.filter(e => !children.has(e.id));
    if (f.mode === 'everything') return matched;
    const ids=new Set(matched.map(e => e.id));
    // A matching paper stays visible even when its umbrella session has a different title.
    return matched.filter(e => !e.parentId || !ids.has(e.parentId) || !!(terms.length || f.topic || f.person));
  }

  function navRender() {
    $('#tabs .nav-inner').innerHTML = nav.map(([tab,label]) => '<button type="button" class="tab-btn" data-tab="' + tab + '"' + (tab===state.tab?' aria-current="page"':'') + '><span class="nav-icon">' + icon(tab) + '</span>' + label + '</button>').join('');
  }
  function daysHtml() {
    const b=(day,word,num) => '<button type="button" data-day="' + esc(day) + '" aria-label="' + esc(day === 'all' ? 'All dates' : fmtDay(day)) + '" aria-pressed="' + (day===state.day) + '"><small>' + esc(word) + '</small><strong>' + esc(num) + '</strong></button>';
    return b('all','All','Days') + days.map(day => b(day,fmtDay(day,{weekday:'short'}),Number(day.slice(-2)))).join('');
  }
  // Counts are simultaneous session blocks at the hour scale. Child talks stay with their parent.
  const densityCache = new Map();
  function density(day) {
    const cacheKey=day+state.filters.scope;
    if (densityCache.has(cacheKey)) return densityCache.get(cacheKey);
    const slots=Array(24).fill(0);
    for (const e of events) if ((day==='all'||dateOf(e)===day) && (state.filters.scope==='all'||technical(e)) && !(e.parentId && byId.has(e.parentId))) {
      for(let h=0;h<24;h++) if(minutes(e.start)<(h+1)*60 && minutes(e.end)>h*60) slots[h]++;
    }
    const positive=slots.map((n,i)=>n?i:-1).filter(i=>i>=0);
    const lo=positive.length?positive[0]:7, hi=positive.length?positive[positive.length-1]:19;
    const out={slots,lo,hi,peak:Math.max(1,...slots)};
    densityCache.set(cacheKey,out);return out;
  }
  function chart() {
    const {slots,lo,hi,peak}=density(state.day);
    const htext=h=>(h%12||12)+(h<12?'am':'pm');
    let bars='';
    for(let h=lo;h<=hi;h++){
      const label=slots[h]+' session blocks, '+htext(h)+' to '+htext(h+1)+'. Filter this hour';
      bars+='<button type="button" data-hour="'+h+'" aria-pressed="'+(h===state.filters.hour)+'" class="'+(h===state.filters.hour?'on':'')+'" title="'+esc(label)+'" aria-label="'+esc(label)+'"><span style="--bar:'+Math.max(2,slots[h]/peak*100)+'%"></span></button>';
    }
    return '<div class="plot-heading"><span>Session blocks by hour</span><b>'+(state.day==='all'?'All dates':fmtDay(state.day,{weekday:'short',day:'numeric',month:'short'}))+'</b></div><div class="plot">'+bars+'</div><div class="plot-times"><span>'+htext(lo)+'</span><span>Chicago time</span><span>'+htext(hi+1)+'</span></div>';
  }
  function toolsHtml() {
    const f=state.filters;
    return '<div class="day-tabs" aria-label="Program dates">'+daysHtml()+'</div><div class="searchline"><label class="searchbox">'+icon('search')+'<input id="search" type="search" enterkeyhint="search" autocomplete="off" aria-label="Search program" placeholder="Talk, person, topic, room…" value="'+esc(f.query)+'"></label><button type="button" class="filter-toggle" aria-expanded="'+state.expanded+'" aria-controls="filters">'+icon('filter')+'Filters <span class="filter-count"></span></button></div><div class="filter-panel" id="filters"'+(state.expanded?'':' hidden')+'><label>Program focus<select id="scope">'+opt('technical','Technical focus',f.scope)+opt('all','All listings',f.scope)+'</select></label><label>Format<select id="format">'+opt('','All formats',f.format)+formats.map(i=>opt(i,i,f.format)).join('')+'</select></label><label>Room<select id="room">'+opt('','All rooms',f.room)+rooms.map(i=>opt(i,i,f.room)).join('')+'</select></label><label>In progress at (CST)<input id="time" type="time" value="'+esc(f.time)+'"></label><label>Show<select id="mode">'+opt('blocks','Session blocks',f.mode)+opt('individual','Individual entries',f.mode)+opt('everything','Blocks and entries',f.mode)+'</select></label><button type="button" data-reset>Reset filters</button></div><div class="active-chips" aria-label="Applied filters"></div>';
  }
  function chips() {
    const f=state.filters;
    const list=[['scope',f.scope==='technical'?'Technical focus':''],['format',f.format],['room',f.room],['time',clockText(f.time)],['hour',f.hour!==null?'Hour of '+clockText(String(f.hour).padStart(2,'0')+':00'):''],['person',f.person],['topic',names.get(f.topic)||f.topic],['mode',f.mode==='individual'?'Individual entries':f.mode==='everything'?'Blocks and entries':'']].filter(x=>x[1]);
    $('.active-chips').innerHTML=list.map(([k,v])=>'<button type="button" data-clear="'+k+'" aria-label="Remove '+esc(v)+' filter">'+esc(v)+' ×</button>').join('');
    $('.filter-count').textContent=list.length?String(list.length):'';
  }
  function accent(e) {
    const f=normalize(formatOf(e));
    if(/keynote|plenary|invited/.test(f))return '#b4813f';
    if(/poster/.test(f))return '#977eb0';
    if(/tutorial|workshop/.test(f))return '#5189a5';
    if(/paper/.test(f))return '#648e62';
    return '#9aa995';
  }
  function card(e) {
    const n=(children.get(e.id)||[]).length;
    const parent=byId.get(e.parentId);
    const title=e.title || 'Untitled entry';
    const marked=saved.has(e.id);
    return '<article class="entry" style="--accent:'+accent(e)+'"><button type="button" class="entry-main" data-event="'+esc(e.id)+'"><span class="entry-kind">'+esc(formatOf(e))+'</span><strong class="entry-title">'+esc(title)+'</strong><span class="entry-meta">'+unit('clock',span(e))+(e.room?unit('room',e.room):'')+(n?unit('stack',n+' in block'):'')+'</span>'+(parent?'<span class="entry-context">In '+esc(parent.title)+'</span>':'')+'</button><button type="button" class="bookmark'+(marked?' on':'')+'" aria-label="'+(marked?'Remove from saved':'Save')+': '+esc(title)+'" aria-pressed="'+marked+'" data-save="'+esc(e.id)+'">'+icon('saved')+'</button></article>';
  }
  function grouped(rows,limit,multi) {
    let d=null,t=null,html='';
    for(const e of rows.slice(0,limit)){
      const date=dateOf(e);
      if(d!==date){ d=date;t=null;if(multi) html+='<h3 class="day-divider">'+esc(fmtDay(date))+'</h3>'; }
      if(t!==e.start){t=e.start;html+='<div class="time-label">'+esc(clockText(t)||'Time unlisted')+'</div>';}
      html+=card(e);
    }
    if(rows.length>limit) html+='<button class="muted-action more" type="button" data-more>Show '+Math.min(45,rows.length-limit)+' more · '+(rows.length-limit)+' remaining</button>';
    return html;
  }
  function longActivity(e){
    if(e.parentId || minutes(e.end)-minutes(e.start)<300)return false;
    return /^(art of hpc|exhibits|community engagement|posters|student cluster competition|scc connect)$/i.test(e.format)
      || /headquarters|poster display|exhibition hall|exhibitor lounge/i.test(e.title || '');
  }
  function renderResults(){
    currentRows=filtered();
    const count=currentRows.length;
    chips();
    $('.list-head h2').textContent=state.day==='all'?'Full program':fmtDay(state.day);
    $('#result-count').textContent=count.toLocaleString()+(count===1?' result':' results');
    const fold=state.day!=='all' && state.filters.mode==='blocks' && !isFiltered();
    const long=fold?currentRows.filter(longActivity):[];
    longRows=long;
    const rows=long.length?currentRows.filter(e=>!longActivity(e)):currentRows;
    const exhibits=long.length?'<details class="long-activities"><summary><span>Extended-hours exhibits & activities</span><b>'+long.length+'</b></summary><div></div></details>':'';
    $('#results').innerHTML=count?exhibits+grouped(rows,state.limit,state.day==='all'):'<div class="empty"><strong>No matching entries</strong><p>Try another date, search term, or room.</p><button type="button" class="muted-action" data-reset>Reset filters</button></div>';
  }
  function renderSchedule(){
    $('#main').innerHTML='<div class="ag-hero"><div class="frame hero-wrap"><div><p class="kicker">Chicago · November 15–20, 2026</p><h1 class="view-title">The program</h1></div><div class="activity" aria-label="Filter schedule by hour">'+chart()+'</div></div></div><div class="frame ag-tools">'+toolsHtml()+'<div class="list-head"><h2></h2><span id="result-count" aria-live="polite"></span></div><div id="results"></div><p class="snapshot-note">Offline edition · November 18, 2026 · <a target="_blank" rel="noopener" href="https://sc26.conference-program.com/">Official schedule</a></p></div>';
    renderResults();
  }
  function renderSaved(){
    const rows=events.filter(e=>saved.has(e.id));
    $('#main').innerHTML='<div class="frame"><header class="basic-head"><p class="kicker">Personal schedule</p><h1 class="view-title">Saved entries</h1><p>'+rows.length+' saved on this device · Chicago time</p>'+(rows.length?'<button type="button" class="muted-action calendar-export" data-export-calendar>Export calendar</button>':'')+'</header><div id="saved-rows">'+(rows.length?grouped(rows,state.savedLimit,true):'<div class="empty"><strong>Your schedule starts here</strong><p>Tap the bookmark beside a session, or build a day around your interests in Planner.</p><button type="button" class="action" data-tab="schedule">Browse schedule</button></div>')+'</div></div>';
  }
  function show(tab,scroll=true){
    if(!knownTabs.has(tab))return;
    closeSheet();
    state.tab=tab;navRender();
    if(tab==='schedule') renderSchedule();
    else if(tab==='saved') renderSaved();
    else if(window.Insights && typeof Insights.render==='function'){
      $('#main').innerHTML='<div class="frame" id="insight-root"></div>';
      Insights.render(tab,$('#insight-root'),Guide);
    } else $('#main').innerHTML='<div class="frame"><p class="loading">This section could not be loaded.</p></div>';
    if(scroll) window.scrollTo(0,0);
  }
  let toastTimer;
  function toast(str){
    $('#notice').textContent=str;$('#notice').classList.add('show');
    window.clearTimeout(toastTimer);toastTimer=window.setTimeout(()=>$('#notice').classList.remove('show'),1500);
  }
  function persist(){
    try{localStorage.setItem(key,JSON.stringify([...saved]));}catch(_){toast('Device storage is unavailable');return false;}return true;
  }
  function updateSavedButtons(id,value){
    document.querySelectorAll('[data-save]').forEach(b=>{
      if(b.dataset.save!==id)return;
      const item=byId.get(id);
      b.setAttribute('aria-pressed',String(value));
      if(b.classList.contains('bookmark')){
        b.classList.toggle('on',value);b.setAttribute('aria-label',(value?'Remove from saved: ':'Save: ')+(item?.title || 'entry'));
      }else{b.classList.toggle('saved',value);b.textContent=value?'Saved · Remove':'Save entry';}
    });
  }
  function setSaved(id,value){
    if(!byId.has(id))return;
    if(value)saved.add(id);else saved.delete(id);
    const ok=persist();updateSavedButtons(id,!!value);
    if(state.tab==='saved')renderSaved();
    if(ok)toast(value?'Added to saved entries':'Removed from saved entries');
  }
  function saveIds(ids){
    for(const id of ids)if(byId.has(id))saved.add(id);
    persist();if(state.tab==='saved')renderSaved();
  }
  let focusOrigin=null;
  function openSheet(title,html,kind=''){
    if($('#veil').hidden)focusOrigin=document.activeElement;
    $('#sheet-content').innerHTML=(kind?'<div class="detail-kind">'+esc(kind)+'</div>':'')+'<h2 id="sheet-title">'+esc(title)+'</h2>'+html;
    $('#veil').hidden=false;document.body.style.overflow='hidden';$('#sheet').scrollTop=0;$('#sheet').focus({preventScroll:true});
    document.querySelector('.mast').inert=true;$('#main').inert=true;$('#tabs').inert=true;
  }
  function closeSheet(){
    if($('#veil').hidden)return false;
    $('#veil').hidden=true;document.body.style.overflow='';
    document.querySelector('.mast').inert=false;$('#main').inert=false;$('#tabs').inert=false;
    if(focusOrigin?.isConnected) focusOrigin.focus({preventScroll:true});
    focusOrigin=null;return true;
  }
  function filterTopic(topic,day){
    state.filters={...emptyFilters(),...allScope,mode:names.has(topic)?'individual':'blocks',topic};state.day=day&&days.includes(day)?day:'all';state.limit=45;show('schedule');
  }
  function filterPerson(name){
    state.filters={...emptyFilters(),...allScope,person:name};state.day='all';state.limit=45;show('schedule');
  }
  function search(q){
    state.filters={...emptyFilters(),...allScope,query:q||''};state.day='all';state.limit=45;show('schedule');
  }
  const section=(head,body)=>body?'<section class="detail-section"><h3>'+esc(head)+'</h3>'+body+'</section>':'';
  function openEvent(id){
    const e=byId.get(id);if(!e)return;
    const parent=byId.get(e.parentId),subs=children.get(id)||[],persons=peopleOf(e);
    const matchedTopics=topicIds(e);
    const tags=(e.topics||[]).filter(t=>typeof t==='string'&&!names.has(t));
    const listed=e.dropIn?'Drop-in window. You can visit during the listed hours.':e.timeInherited || e.timing==='block'?'The program lists the time of the containing block.':e.timing==='flexible'?'Drop-in window. You can visit during the listed hours.':'';
    const eventUrl=officialUrl(e.url);
    const occurrenceUrl=parent && eventUrl && new URL(eventUrl).searchParams.get('sess')!==parent.id ? officialUrl(parent.url) : '';
    const desc=(e.description||'').trim();
    const marked=saved.has(id);
    const accessFields=[['registration-category','Registration'],['recording','Recording'],['poster-blitz-group','Poster blitz group']];
    const access=accessFields.map(([k,label])=> {
      const values=e.tags && e.tags[k];
      return Array.isArray(values) && values.length?'<div><dt>'+esc(label)+((e.inheritedTags||[]).includes(k)?' (session block)':'')+'</dt><dd>'+esc(values.join(' · '))+'</dd></div>':'';
    }).join('');
    const roomMap=e.room && window.Venue?'<button type="button" class="muted-action" data-map-event="'+esc(id)+'">Venue map</button>':'';
    const personHtml=persons.map(p=>'<li><button type="button" data-profile="'+esc(p.id||'')+'" data-person="'+esc(p.name)+'"><span>'+esc(p.name)+(p.role?'<small>'+esc(p.role)+'</small>':'')+'</span><span aria-hidden="true">→</span></button></li>').join('');
    const childHtml=subs.map(s=>'<li><button type="button" data-event="'+esc(s.id)+'"><span><small>'+esc(span(s))+(s.room && s.room!==e.room?' · '+esc(s.room):'')+'</small>'+esc(s.title)+'</span><span aria-hidden="true">›</span></button></li>').join('');
    const html='<div class="detail-meta">'+unit('schedule',fmtDay(dateOf(e)))+unit('clock',span(e)+' CST')+unit('room',e.room||'Room unlisted')+'</div>'+
      (listed?'<p class="detail-note">'+esc(listed)+'</p>':'')+'<div class="sheet-actions"><button class="action'+(marked?' saved':'')+'" type="button" data-save="'+esc(id)+'" aria-pressed="'+marked+'">'+(marked?'Saved · Remove':'Save entry')+'</button>'+roomMap+'</div>'+
      (parent?section('Session block','<button type="button" class="parent-link" data-event="'+esc(parent.id)+'">'+esc(parent.title)+' <span>›</span></button>'):'')+
      (desc?section('About','<p class="description">'+esc(desc)+'</p>'):'')+
      (subs.length?section('In this block · '+subs.length,'<ul class="child-list">'+childHtml+'</ul>'):'')+
      (persons.length?section('Contributors','<ul class="person-links">'+personHtml+'</ul>'):'')+
      (tags.length?section('Program topics','<div class="detail-tags">'+tags.map(t=>'<button type="button" class="tag" data-topic="'+esc(t)+'">'+esc(t)+'</button>').join('')+'</div>'):'')+
      (matchedTopics.length?section('Topic lenses','<div class="detail-tags">'+matchedTopics.map(t=>'<button type="button" class="tag" data-topic="'+esc(t)+'">'+esc(names.get(t)||t)+'</button>').join('')+'</div>'):'')+
      (access?section('Attendance','<dl class="access-fields">'+access+'</dl>'):'')+
      (e.scheduleTitle && normalize(e.scheduleTitle)!==normalize(e.title)?'<p class="detail-note">Schedule listing: '+esc(e.scheduleTitle)+'</p>':'')+
      (eventUrl?'<div class="sheet-links"><a href="'+esc(eventUrl)+'" rel="noopener" target="_blank">'+(occurrenceUrl?'Official work details':'Official program entry')+' ↗</a>'+(occurrenceUrl?' <a href="'+esc(occurrenceUrl)+'" rel="noopener" target="_blank">This display session ↗</a>':'')+'</div>':'');
    openSheet(e.title || 'Program entry',html,formatOf(e));
  }
  function back(){
    if(closeSheet())return true;
    if(['people','topics','planner'].includes(state.tab) && window.Insights?.back?.())return true;
    if(state.tab!=='schedule'){show('schedule');return true;}
    if(state.expanded){state.expanded=false;renderSchedule();return true;}
    if(isFiltered() || state.filters.mode !== 'blocks'){state.filters=emptyFilters();state.limit=45;renderSchedule();return true;}
    return false;
  }
  const Guide=window.Guide={events,people,openEvent,search,filterTopic,filterPerson,show,esc,openSheet,closeSheet,
    currentDay:activeDay,getSaved:()=>[...saved],savedIds:()=>[...saved],isSaved:id=>saved.has(id),saveIds,setSaved,
    back,handleBack:back,toast,clockText,formatDay:fmtDay};
  document.addEventListener('toggle',ev=>{
    const el=ev.target;
    if(el.matches?.('.long-activities'))el.querySelector('div').innerHTML=el.open?longRows.map(card).join(''):'';
  },true);
  document.addEventListener('click',ev=>{
    const b=ev.target.closest('button');
    if(!b){if(ev.target===$('#veil'))closeSheet();return;}
    const d=b.dataset;
    if(d.tab){show(d.tab);return;}
    if(b.id==='home'){show('schedule');return;}
    if(b.id==='venue'){if(window.Venue)Venue.open('');else openSheet('McCormick Place','<p>Chicago, Illinois · November 15–20, 2026</p>');return;}
    if(b.id==='close-sheet'){closeSheet();return;}
    if(d.event){openEvent(d.event);return;}
    if(d.mapEvent){const e=byId.get(d.mapEvent);if(e && window.Venue)Venue.open(e.room,e.id);return;}
    if(d.save){setSaved(d.save,!saved.has(d.save));return;}
    if(d.person){
      if(d.profile && window.Insights?.openPerson){show('people');Insights.openPerson(d.profile);}
      else filterPerson(d.person);
      return;
    }
    if(d.topic){filterTopic(d.topic);return;}
    if(d.day!==undefined){state.day=d.day;state.limit=45;renderSchedule();return;}
    if(d.hour!==undefined){const h=Number(d.hour);state.filters.hour=state.filters.hour===h?null:h;state.filters.time='';state.limit=45;renderSchedule();return;}
    if(b.classList.contains('filter-toggle')){state.expanded=!state.expanded;b.setAttribute('aria-expanded',String(state.expanded));$('#filters').hidden=!state.expanded;return;}
    if(d.reset!==undefined){state.filters=emptyFilters();state.limit=45;renderSchedule();return;}
    if(d.clear){state.filters[d.clear]=d.clear==='scope'?'all':emptyFilters()[d.clear];state.limit=45;renderSchedule();return;}
    if(d.exportCalendar!==undefined){window.Itinerary?.exportSaved(Guide);return;}
    if(d.more!==undefined){
      const top=document.documentElement.scrollTop || window.scrollY;
      if(state.tab==='saved'){state.savedLimit+=45;renderSaved();}else{state.limit+=45;renderResults();}
      window.scrollTo(0,top);
    }
  });
  let searchTimer;
  document.addEventListener('input',ev=>{
    if(ev.target.id!=='search')return;
    const first=!state.filters.query && !!ev.target.value;
    state.filters.query=ev.target.value;state.limit=45;
    if(first){state.filters.scope='all';$('#scope').value='all';state.day='all';$('.day-tabs').innerHTML=daysHtml();$('.activity').innerHTML=chart();}
    clearTimeout(searchTimer);
    searchTimer=setTimeout(()=>{if(state.tab==='schedule')renderResults();},80);
  });
  document.addEventListener('change',ev=>{
    const k=ev.target.id;
    if(state.tab!=='schedule' || !['format','room','time','mode','scope'].includes(k))return;
    state.filters[k]=ev.target.value;if(k==='time')state.filters.hour=null;
    if(k==='scope'||k==='time')$('.activity').innerHTML=chart();
    state.limit=45;renderResults();
  });
  document.addEventListener('keydown',ev=>{
    if(ev.key==='Escape'){if(back())ev.preventDefault();return;}
    if(ev.key==='Enter'&&ev.target.id==='search')ev.target.blur();
    if(ev.key==='Tab'&&!$('#veil').hidden){
      const els=[...$('#sheet').querySelectorAll('button:not([disabled]),a[href],input,select,[tabindex="0"]')];
      if(!els.length)return;
      if(ev.shiftKey&&(document.activeElement===els[0]||document.activeElement===$('#sheet'))){els.at(-1).focus();ev.preventDefault();}
      else if(!ev.shiftKey&&document.activeElement===els.at(-1)){els[0].focus();ev.preventDefault();}
    }
  });
  show('schedule',false);
})();
