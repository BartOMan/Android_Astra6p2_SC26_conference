/* Conference exploration and local schedule planning. */
(function () {
  'use strict';

  const h = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const arr = value => Array.isArray(value) ? value : [];
  const norm = value => Engine.normalize(String(value || ''));
  const dateOf = item => item.day || item.date || '';
  const workOf = item => item.workId || item.contentId || item.id;
  const num = value => Number(value).toLocaleString('en-US');
  const shortDay = value => new Date(value + 'T12:00:00Z').toLocaleDateString('en-US', {weekday:'short',timeZone:'UTC'});
  const dateLabel = value => new Date(value + 'T12:00:00Z').toLocaleDateString('en-US', {weekday:'long',month:'short',day:'numeric',timeZone:'UTC'});
  function timeText(time) {
    const match = /^(\d{1,2}):(\d\d)/.exec(time || '');
    if (!match) return time || 'Time unlisted';
    const hr = Number(match[1]);
    return (hr % 12 || 12) + ':' + match[2] + (hr < 12 ? 'a' : 'p');
  }
  function safeLink(url) {
    try { const u = new URL(url); return ['https:','http:'].includes(u.protocol) ? h(u.href) : ''; } catch { return ''; }
  }
  function faceSrc(src) {
    if (!src) return '';
    if (/^https?:\/\//i.test(src)) return safeLink(src);
    return /^[a-z0-9][a-z0-9_./-]*$/i.test(src) && !src.includes('..') ? h(window.SC_EMBEDDED?.[src] || src) : '';
  }
  function load(key, fallback) {
    try { const value = JSON.parse(localStorage.getItem('sc26.insights.' + key)); return value == null ? fallback : value; } catch { return fallback; }
  }
  function store(key, value) {
    try { localStorage.setItem('sc26.insights.' + key, JSON.stringify(value)); } catch { /* Session still works in memory. */ }
  }

  let guide, mount, view, source;
  let days = [], topics = [], content = [], byTopic, topicById, byId, metadata, indexes;
  const directory = {speakers:false,mode:'names', query:'', detail:null, group:'', limit:32};
  let picked = new Set(arr(load('interests', []))), walk = Number(load('walk', 5));
  let focusText = String(load('keywords', ''));
  const keywordList = () => [...new Set(focusText.split(',').map(s=>s.trim()).filter(Boolean))];
  let planDay = '', fromNow = false, plan = null, notice = '', expandedTopic = '';

  function prepare() {
    if (source === guide.events) return;
    source = guide.events;
    days = [...new Set(source.map(dateOf).filter(x => /^\d{4}-\d\d-\d\d$/.test(x)))].sort();
    topics = Engine.topics;
    topicById = new Map(topics.map(t => [t.id,t]));
    byId = new Map(source.map(x => [String(x.id),x]));
    content = Engine.contentItems(source);
    byTopic = new Map(topics.map(t => [t.id,{count:0, works:new Set(), days:new Map(), pairs:new Map()}]));
    for (const item of content) {
      const tags = [...new Set(Engine.classify(item))].filter(t => byTopic.has(t));
      for (const tag of tags) {
        const v = byTopic.get(tag); v.count++; v.works.add(workOf(item));
        v.days.set(dateOf(item),(v.days.get(dateOf(item))||0)+1);
        for (const other of tags) if (other !== tag) v.pairs.set(other,(v.pairs.get(other)||0)+1);
      }
    }
    metadata = null;
    indexes = null;
    picked = new Set([...picked].filter(t => topicById.has(t)));
    if (![0,5,10,15].includes(walk)) walk = 5;
    planDay = '';
  }
  function speakingCredit(person,event,role) {
    return arr(event.presenters).includes(person.id) || /presenter|panelist|speaker|instructor|moderator/i.test(role);
  }
  function peopleIndex() {
    if (metadata) return;
    const rows = Array.isArray(guide.people) ? guide.people : Object.values(guide.people || {});
    const people = new Map();
    const byName = new Map();
    function add(p) {
      const key = String(p.id || p.name);
      if (!p.name || !key) return;
      if (!people.has(key)) {
        people.set(key,{...p,id:key,institutions:arr(p.institutions),countries:arr(p.countries),appearances:arr(p.appearances),publications:arr(p.publications),credits:new Map()});
        const nameKey = norm(p.name), matches = byName.get(nameKey) || [];
        matches.push(key); byName.set(nameKey,matches);
      }
    }
    rows.forEach(add);
    const contentIds = new Set(content.map(x => String(x.id)));
    for (const event of source) {
      for (const entry of arr(event.people)) {
        const known = typeof entry === 'string' ? people.get(entry) : null;
        const name = typeof entry === 'string' ? (known ? known.name : entry) : entry.name;
        if (!name) continue;
        const key = norm(name);
        if (!byName.has(key)) add({id:(entry.id || 'name:' + name),name});
        const matches = byName.get(key) || [];
        const profileId = known ? known.id : entry.id;
        const id = profileId && people.has(String(profileId)) ? String(profileId) : matches.length === 1 ? matches[0] : '';
        if (!id) continue;
        const rec = people.get(id);
        const roles = arr(event.roles && event.roles[id]);
        rec.credits.set(String(event.id),{event,role:entry.role || roles.join(', ')});
      }
    }
    for (const p of people.values()) {
      for (const a of p.appearances) {
        const ev = byId.get(String(a.id)) || byId.get(String(a.sessionId));
        if (ev && !p.credits.has(String(ev.id))) p.credits.set(String(ev.id),{event:ev,role:a.role || ''});
      }
      const leaves = [...p.credits.values()].filter(({event}) => contentIds.has(String(event.id)));
      p.count = new Set(leaves.map(({event})=>workOf(event))).size;
      p.blockCount = p.credits.size - leaves.length;
      const speaking = [...p.credits.values()].filter(({event,role})=>speakingCredit(p,event,role));
      p.speakerWorks = new Set(speaking.filter(({event})=>contentIds.has(String(event.id))).map(({event})=>workOf(event))).size;
      p.speakerBlocks = speaking.filter(({event})=>!contentIds.has(String(event.id))).length;
      p.speaks = speaking.length>0;
      p.search = norm([p.name,...p.institutions,...p.countries].join(' '));
    }
    metadata = people;
    const ranked = [...people.values()].sort((a,b) => b.count-a.count || b.blockCount-a.blockCount || a.name.localeCompare(b.name));
    const groups = (key,contributors) => {
      const result = new Map();
      for (const p of contributors) for (const value of new Set(p[key])) {
        if (typeof value !== 'string' || !value.trim()) continue;
        if (!result.has(value)) result.set(value,[]);
        result.get(value).push(p);
      }
      return [...result].sort((a,b) => b[1].length-a[1].length || a[0].localeCompare(b[0]));
    };
    const makeIndex = ranked => ({ranked,institutions:groups('institutions',ranked),countries:groups('countries',ranked),publications:ranked.filter(p => p.publications.length).sort((a,b) => b.publications.length-a.publications.length || b.count-a.count)});
    indexes = makeIndex(ranked);
    indexes.speakers = makeIndex(ranked.filter(p => p.speaks).sort((a,b)=>b.speakerWorks-a.speakerWorks || b.speakerBlocks-a.speakerBlocks || a.name.localeCompare(b.name)));
  }
  const head = (tag,title,sub) => '<header class="ins-head"><div class="kicker">' + h(tag) + '</div><h1 class="view-title">' + h(title) + '</h1><p>' + h(sub) + '</p></header>';
  const button = (act,label,cls,attr) => '<button type="button" class="' + h(cls || '') + '" data-ia="' + h(act) + '"' + (attr || '') + '>' + label + '</button>';
  const field = (key,value) => ' data-' + key + '="' + h(value) + '"';
  const plural = (n,one,many) => num(n)+' '+(n === 1 ? one : many);
  const chevron = '<svg aria-hidden="true" class="ins-arr" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M3 9 9 3M3 3h6v6"/></svg>';
  function topicsHTML() {
    const ranked = topics.filter(t => byTopic.get(t.id).count).sort((a,b) => byTopic.get(b.id).works.size - byTopic.get(a.id).works.size);
    const max = Math.max(1,...ranked.flatMap(t => [...byTopic.get(t.id).days.values()]));
    let html = head('Research atlas','Topics','Find the days and rooms where your interests intersect.');
    html += '<section class="ins-panel atlas"><div class="ins-cardhead"><h2>Topic × day</h2><span class="ins-k">CHICAGO · NOV</span></div><p class="ins-muted">Tap a count to see the program. Select a topic to explore related work.</p><div class="heat-scroll"><table class="heat"><thead><tr><th scope="col">Topic</th>';
    for (const d of days) html += '<th scope="col"><span>'+h(shortDay(d))+'</span><b>'+h(d.slice(-2))+'</b></th>';
    html += '</tr></thead><tbody>';
    for (const t of ranked) {
      const item = byTopic.get(t.id);
      html += '<tr class="'+(t.id === expandedTopic ? 'heat-active' : '')+'"><th scope="row">'+button('expand-topic',h(t.label)+' <span>'+plural(item.works.size,'work','works')+'</span>','heat-title',field('topic',t.id)+' aria-expanded="'+(t.id === expandedTopic)+'"')+'</th>';
      for (const d of days) {
        const count = item.days.get(d) || 0;
        const level = count ? Math.ceil(5*Math.sqrt(count/max)) : 0;
        html += '<td>'+(count ? button('topic-day',num(count),'heat-cell heat-'+level,field('topic',t.id)+field('day',d)+' aria-label="'+h(t.label+', '+dateLabel(d)+', '+plural(count,'item','items'))+'"') : '<span class="heat-zero">·</span>')+'</td>';
      }
      html += '</tr>';
      if (expandedTopic === t.id) {
        const related = [...item.pairs].sort((a,b) => b[1]-a[1]).slice(0,3);
        html += '<tr><td colspan="'+(days.length+1)+'"><div class="heat-detail"><b>'+h(t.label)+'</b>'+button('topic-day','See '+plural(item.count,'appearance','appearances')+' '+chevron,'ins-text',field('topic',t.id))+(related.length ? '<small>Often appears with '+h(related.map(([id])=>topicById.get(id).label).join(' · '))+'</small>' : '')+'</div></td></tr>';
      }
    }
    html += '</tbody></table></div><div class="heat-legend"><span>Fewer</span><i class="heat-1"></i><i class="heat-2"></i><i class="heat-3"></i><i class="heat-4"></i><i class="heat-5"></i><span>More items</span></div></section><p class="ins-foot">Topic totals count distinct works. Day cells count scheduled appearances, including repeated poster windows. Each work can match several topics based on the published program text.</p>';
    return html;
  }

  function initials(name) { return name.split(/\s+/).filter(Boolean).filter((_,i,a)=>i === 0 || i === a.length-1).map(s=>[...s][0]).join('').toUpperCase(); }
  function avatar(p, big) {
    const src = faceSrc(p.photo);
    return '<span class="ins-avatar'+(big ? ' big':'')+'"><span aria-hidden="true">'+h(initials(p.name))+'</span>'+(src ? '<img alt="" loading="lazy" src="'+src+'">' : '')+'</span>';
  }
  const peopleModes = [['names','People'],['institutions','Institutions'],['countries','Countries']];
  function peopleHTML() {
    peopleIndex();
    if (directory.detail && metadata.has(directory.detail)) return personHTML(metadata.get(directory.detail));
    const mode = directory.mode;
    let html = head('Contributor index','People',num(indexes.ranked.length)+' contributors credited in the program. Explore their sessions and affiliations.');
    html += '<label class="ins-check ins-role"><input type="checkbox" data-ifield="speaker-only"'+(directory.speakers?' checked':'')+'> Listed speaking roles only <span>'+num(indexes.speakers.ranked.length)+'</span></label>';
    const modes = indexes.publications.length ? [...peopleModes,['publications','IEEE TAS']] : peopleModes;
    html += '<div class="ins-tabs" aria-label="Directory views">'+modes.map(([id,label])=>button('people-mode',h(label),'ins-tab'+(mode===id?' active':''),field('mode',id)+' aria-pressed="'+(mode===id)+'"')).join('')+'</div>';
    if (directory.group) html += '<div class="ins-group-head">'+button('clear-group','← '+(mode==='countries'?'Countries':'Institutions'),'ins-text')+'<h2>'+h(directory.group)+'</h2></div>';
    const placeholder = directory.group || mode==='names' || mode==='publications' ? 'Search contributors' : 'Search '+mode;
    html += '<label class="ins-search"><span aria-hidden="true">⌕</span><input type="search" data-ifield="person-query" aria-label="'+h(placeholder)+'" placeholder="'+h(placeholder)+'" value="'+h(directory.query)+'"></label><div id="ins-people-results" aria-live="polite">'+peopleResults()+'</div>';
    return html;
  }
  function personRow(p,tas) {
    const workCount = directory.speakers ? p.speakerWorks : p.count, blockCount = directory.speakers ? p.speakerBlocks : p.blockCount;
    let credit = tas ? plural(p.publications.length,'verified paper','verified papers') : workCount ? plural(workCount,'work','works') : blockCount ? plural(blockCount,'block','blocks') : '';
    return button('person',avatar(p,false)+'<span class="ins-row-text"><b>'+h(p.name)+'</b><small>'+h(p.institutions.join(' · ') || p.countries.join(' · ') || 'Program contributor')+'</small></span><span class="ins-tally">'+h(credit)+'</span>','ins-person',field('id',p.id));
  }
  function peopleResults() {
    const {mode,group,query,limit} = directory;
    const idx = directory.speakers ? indexes.speakers : indexes;
    const q = norm(query.trim());
    const isGrouping = !group && ['countries','institutions'].includes(mode);
    let rows, label, note;
    if (isGrouping) {
      rows = idx[mode].filter(([name])=>!q || norm(name).includes(q));
      label = plural(rows.length,mode==='countries'?'country':'institution',mode);
      const key = mode;
      const known = idx.ranked.filter(p => p[key].length).length;
      note = (mode==='countries'?'Affiliation or profile country':'Published affiliation')+' available for '+num(known)+' of '+num(idx.ranked.length)+(directory.speakers?' contributors with listed speaking roles.':' contributors.');
    } else {
      const source = group ? (idx[mode].find(x=>x[0]===group)||[null,[]])[1] : mode==='publications' ? idx.publications : idx.ranked;
      rows = source.filter(p => !q || p.search.includes(q));
      label = directory.speakers ? plural(rows.length,'speaking contributor','speaking contributors') : plural(rows.length,'contributor','contributors');
      note = mode==='publications' ? 'Linked papers in IEEE Transactions on Applied Superconductivity. Counts reflect the verified works listed here.' : (directory.speakers ? 'Includes credited presenters, panelists, instructors, speakers and moderators. ' : '')+'Ranked by distinct credited works. A poster counts once across its display windows. Session blocks count separately.';
    }
    const parts = ['<div class="ins-result-head"><b>'+h(label)+'</b></div><p class="ins-caption">'+h(note)+'</p><div class="ins-list">'];
    for (const row of rows.slice(0,limit)) {
      if (isGrouping) {
        const [name,list] = row, width = Math.round(100 * list.length / Math.max(1,rows[0][1].length));
        parts.push(button('group','<span class="ins-row-text"><b>'+h(name)+'</b><span class="ins-bar"><i style="width:'+width+'%"></i></span></span><span class="ins-tally">'+num(list.length)+'</span>','ins-person ins-group',field('group',name)+' aria-label="'+h(name+', '+plural(list.length,'contributor','contributors'))+'"'));
      } else parts.push(personRow(row,mode==='publications'));
    }
    if (!rows.length) parts.push('<p class="ins-empty">No matches. Try a shorter name or another spelling.</p>');
    parts.push('</div>');
    if (limit<rows.length) parts.push(button('more-people','Show more ('+num(rows.length-limit)+')','ins-secondary ins-more'));
    return parts.join('');
  }
  function eventButton(item,role) {
    return button('event','<span class="ins-row-text"><small>'+h((dateOf(item) ? shortDay(dateOf(item))+' · ':'')+timeText(item.start)+(item.room ? ' · '+item.room : ''))+'</small><b>'+h(item.title)+'</b>'+(role?'<small>'+h(role)+'</small>':'')+'</span><span class="ins-arrow" aria-hidden="true">›</span>','ins-appearance',field('id',item.id));
  }
  function nextAppearance(p, sorted) {
    const now = clock();
    if (!days.includes(now.day)) return '';
    const upcoming = sorted.filter(({event})=>dateOf(event)>now.day ||
      (dateOf(event)===now.day && Engine.minutes(event.end)>now.minute));
    const active = event => dateOf(event)===now.day && Engine.minutes(event.start)<=now.minute;
    const timed = upcoming.filter(({event,role})=>speakingCredit(p,event,role) &&
      !Engine.isDropIn(event) && event.timing !== 'block');
    // If two listed sessions are under way, favor the individually timed credit
    // over a parent workshop block, then the one ending first.
    const live = timed.filter(({event})=>active(event)).sort((a,b)=>
      Number(a.event.kind==='block')-Number(b.event.kind==='block') ||
      a.event.end.localeCompare(b.event.end));
    const display = upcoming.find(({event})=>Engine.isDropIn(event));
    const match = live[0] || timed[0] || display;
    if (!match) return '';
    const {event,role} = match;
    const isDisplay = match===display && !timed.length;
    const label = isDisplay ? active(event) ? 'Display window open' : 'Upcoming display window'
      : active(event) ? 'Listed speaking session in progress' : 'Next listed speaking session';
    const when = shortDay(dateOf(event))+' · '+timeText(event.start)+'–'+timeText(event.end)+' CST · '+(event.room || 'Room unlisted');
    const where = '<span class="ins-row-text"><small>'+h(when)+'</small><b>'+h(event.title)+'</b><small>'+
      h(isDisplay ? 'Display window · Author attendance unconfirmed' : role)+'</small></span><span aria-hidden="true" class="ins-arrow">›</span>';
    return '<section class="ins-next"><div class="kicker">'+h(label)+'</div>'+
      button('event',where,'ins-appearance',field('id',event.id))+'</section>';
  }
  function personHTML(p) {
    const sorted = [...p.credits.values()].sort((a,b)=>(dateOf(a.event)+' '+a.event.start).localeCompare(dateOf(b.event)+' '+b.event.start)||a.event.title.localeCompare(b.event.title));
    const src = safeLink(p.url);
    const photoLink = !p.photo && safeLink(p.photoUrl);
    const creditedPhoto = p.photoCredit && safeLink(p.photoSource);
    let html = button('back-person','← Directory','ins-text ins-back')+'<div class="ins-profile">'+avatar(p,true)+'<div><div class="kicker">Contributor</div><h1>'+h(p.name)+'</h1></div></div>';
    if (p.institutions.length || p.countries.length) {
      html += '<dl class="ins-facts">';
      if (p.institutions.length) html += '<dt>Affiliation</dt><dd>'+h(p.institutions.join(' · '))+'</dd>';
      if (p.countries.length) html += '<dt>Affiliation / profile country</dt><dd>'+h(p.countries.join(' · '))+'</dd>';
      html += '</dl>';
    }
    html += nextAppearance(p, sorted);
    if (src) html += '<a class="ins-text ins-source" href="'+src+'" target="_blank" rel="noopener">Official profile '+chevron+'</a>';
    if (creditedPhoto) html += '<div class="ins-photo-credit">Photo credit · <a href="'+creditedPhoto+'" rel="noopener" target="_blank">'+h(p.photoCredit)+'</a></div>';
    if (photoLink) html += '<a class="ins-text ins-source ins-photo-url" href="'+photoLink+'" target="_blank" rel="noopener">Official photo '+chevron+'</a>';
    if (p.publications.length) {
      html += '<section class="ins-panel ins-pubs"><div class="kicker">Selected publications</div><h2>IEEE Transactions on Applied Superconductivity</h2>';
      for (const pub of p.publications) {
        const url = safeLink(pub.url);
        html += '<p>'+(url ? '<a href="'+url+'" target="_blank" rel="noopener">'+h(pub.title)+' '+chevron+'</a>' : h(pub.title))+(pub.year ? ' <small>'+h(pub.year)+'</small>' : '')+'</p>';
      }
      html += '</section>';
    }
    html += '<h2 class="ins-sectiontitle">Program credits <span>'+num(sorted.length)+'</span></h2>';
    if (sorted.length) html += '<div class="ins-list">'+sorted.map(({event,role})=>eventButton(event,role)).join('')+'</div>';
    else {
      const appearances = arr(p.appearances);
      html += appearances.length ? '<div class="ins-list">'+appearances.map(a=>'<div class="ins-unmatched"><b>'+h(a.title)+'</b><small>'+h([a.format,a.role].filter(Boolean).join(' · '))+'</small></div>').join('')+'</div>' : '<p class="ins-muted">The directory lists this contributor without a linked program item.</p>';
    }
    return html;
  }

  function clock() { return Engine.clock(); }
  function initialPlanDay() {
    const today = clock().day, gd = guide.currentDay && guide.currentDay();
    return days.includes(gd) ? gd : days.includes(today) ? today : days[0] || '';
  }
  const savedIds = () => new Set([...(guide.getSaved() || [])].map(String));
  function calculate() {
    const saved = savedIds(), daily = source.filter(e => dateOf(e)===planDay), now = clock();
    const opts = {interests:[...picked],keywords:keywordList(),lockedIds:daily.filter(e=>saved.has(String(e.id))).map(e=>e.id),day:planDay,walkMinutes:walk};
    if (fromNow && planDay===now.day) opts.after = now.minute;
    plan = Engine.plan(source,opts);
    notice = '';
  }
  function plannerHTML() {
    if (!planDay || !days.includes(planDay)) planDay = initialPlanDay();
    const now = clock(), locked = source.filter(e=>dateOf(e)===planDay && savedIdsCache.has(String(e.id))).length;
    let html = head('Personal itinerary','Planner','Choose your interests for a day in Chicago. Your saved sessions anchor the schedule.');
    html += '<section class="ins-panel ins-plan-config"><div class="ins-fieldrow"><label>Conference day<select data-ifield="plan-day">'+days.map(d=>'<option value="'+h(d)+'"'+(d===planDay?' selected':'')+'>'+h(dateLabel(d))+'</option>').join('')+'</select></label><label>Room change<select data-ifield="walk">'+[0,5,10,15].map(n=>'<option value="'+n+'"'+(n===walk?' selected':'')+'>'+n+' min</option>').join('')+'</select></label></div>';
    if (now.day===planDay) html += '<label class="ins-check"><input type="checkbox" data-ifield="from-now"'+(fromNow?' checked':'')+'> Start from now (Chicago time)</label>';
    html += '<div class="ins-cardhead"><h2>Interests</h2><span class="ins-choice-count">'+num(picked.size)+' selected</span></div><div class="ins-chips">';
    for (const t of topics) {
      if (!byTopic.get(t.id).count) continue;
      html += button('pick', '<span aria-hidden="true">'+(picked.has(t.id)?'✓':'+')+'</span> '+h(t.label),'ins-chip'+(picked.has(t.id)?' on':''),field('topic',t.id)+' aria-pressed="'+picked.has(t.id)+'"');
    }
    html += '</div><label class="ins-keywords">Keyword interests<input type="text" data-ifield="keywords" value="'+h(focusText)+'" placeholder="SQUID, tensor network, tokamak" aria-describedby="ins-keyword-help" autocomplete="off"></label><small id="ins-keyword-help" class="ins-caption">Separate phrases with commas. A session can match any keyword or selected topic.</small><div class="ins-buildline">'+button('build',plan?'Rebuild schedule':'Build schedule','ins-primary',(!picked.size && !keywordList().length && !locked)?' disabled':'')+'<small>'+h(plural(locked,'saved entry','saved entries'))+' on this day</small></div></section>';
    if (plan) html += planResults();
    return html;
  }
  function planCard(item,drop) {
    const isSaved = savedIdsCache.has(String(item.id));
    const terms = arr(plan.keywordMatches && plan.keywordMatches[item.id]);
    const lensLabels = arr(plan.matches && plan.matches[item.id]).map(id=>topicById.get(id)?.label).filter(Boolean);
    const labels = [...terms.map(s=>'“'+s+'”'), ...lensLabels];
    return '<article class="ins-stop"><div class="ins-stop-time"><i aria-hidden="true"></i><b>'+h(timeText(item.start))+'</b><small>'+h(timeText(item.end))+'</small></div><div class="ins-stop-body"><div class="ins-stop-meta">'+h(item.room || 'Room unlisted')+' · '+h(item.format || 'Session')+'</div>'+button('event',h(item.title),'ins-stop-title',field('id',item.id))+(labels.length?'<small class="ins-match">'+h(labels.slice(0,2).join(' · '))+'</small>':'')+button('save-one',isSaved?'✓ Saved':drop?'+ Save visit':'+ Save','ins-save'+(isSaved?' saved':''),field('id',item.id)+(isSaved?' disabled':''))+'</div></article>';
  }
  function planResults() {
    const items = arr(plan.items), dropIns = arr(plan.dropIns), conflicts = arr(plan.conflicts), untimed = arr(plan.unscheduled);
    const newItems = items.filter(x => !savedIdsCache.has(String(x.id)));
    let html = '<section id="ins-plan-results" tabindex="-1" class="ins-itinerary"><div class="ins-cardhead"><div><div class="kicker">'+h(dateLabel(planDay))+'</div><h2>Your schedule</h2></div><span class="ins-count">'+h(plural(items.length,'stop','stops'))+'</span></div>';
    if (notice) html += '<p class="ins-notice" role="status">'+h(notice)+'</p>';
    if (conflicts.length) {
      html += '<div class="ins-conflicts"><b>Saved sessions need a choice</b><ul>';
      for (const c of conflicts) {
        const a = byId.get(String(c.a)), b = byId.get(String(c.b));
        if (a && b) html += '<li>'+h(a.title)+' / '+h(b.title)+' <small>'+h(c.reason==='walk'?'Too little time to change rooms':'Times overlap')+'</small></li>';
      }
      html += '</ul></div>';
    }
    if (items.length) {
      html += '<div class="ins-stops">'+items.map(item=>planCard(item,false)).join('')+'</div>';
      if (newItems.length) html += button('save-plan','Save '+plural(newItems.length,'suggestion','suggestions'),'ins-primary ins-bulk');
    } else html += '<p class="ins-empty">No timed sessions fit these interests and constraints. Try another day, another topic or a shorter room change.</p>';
    if (dropIns.length) {
      const show = Math.min(dropLimit,dropIns.length);
      html += '<div class="ins-drop"><h3>Drop-in posters &amp; art <span>'+num(dropIns.length)+'</span></h3><p class="ins-muted">Visit during the posted display window. These visits can fit around your timed sessions.</p>'+dropIns.slice(0,show).map(item=>planCard(item,true)).join('')+(show<dropIns.length?button('more-drops','Show more visits','ins-secondary'):'')+'</div>';
    }
    if (untimed.length) html += '<h3>Saved without a time</h3>'+untimed.map(item=>eventButton(item,'')).join('');
    return html+'</section>';
  }
  let savedIdsCache = new Set(), dropLimit = 12;
  function repaint() {
    savedIdsCache = savedIds();
    const markup = view==='topics' ? topicsHTML() : view==='people' ? peopleHTML() : plannerHTML();
    mount.innerHTML = '<div class="ins-root">'+markup+'</div>';
    const root = mount.firstElementChild;
    root.addEventListener('click',onClick);
    root.addEventListener('change',onChange);
    root.addEventListener('input',onInput);
    root.addEventListener('error', e => { if (e.target.tagName==='IMG') e.target.hidden = true; }, true);
  }
  function refreshPeople() {
    const list = mount.querySelector('#ins-people-results');
    if (list) list.innerHTML = peopleResults();
  }
  function onInput(e) {
    if (e.target.dataset.ifield==='keywords') {
      focusText = e.target.value; store('keywords',focusText);
      plan = null; notice = '';
      mount.querySelector('#ins-plan-results')?.remove();
      const build = mount.querySelector('[data-ia="build"]');
      if (build) {
        const locked = source.some(x=>dateOf(x)===planDay && savedIdsCache.has(String(x.id)));
        build.disabled = !picked.size && !keywordList().length && !locked;
        build.textContent = 'Build schedule';
      }
      return;
    }
    if (e.target.dataset.ifield!=='person-query') return;
    directory.query = e.target.value; directory.limit = 32; refreshPeople();
  }
  function onChange(e) {
    const el = e.target;
    if (el.dataset.ifield==='plan-day') { planDay = el.value; fromNow = false; }
    else if (el.dataset.ifield==='walk') { walk = Number(el.value); store('walk',walk); }
    else if (el.dataset.ifield==='speaker-only') { directory.speakers = el.checked; directory.group = ''; directory.detail = null; directory.limit = 32; repaint(); return; }
    else if (el.dataset.ifield==='from-now') fromNow = el.checked;
    else return;
    plan = null; notice = ''; repaint();
  }
  function onClick(e) {
    const btn = e.target.closest('button[data-ia]');
    if (!btn || btn.disabled) return;
    e.stopPropagation();
    const d = btn.dataset;
    switch (d.ia) {
      case 'expand-topic': expandedTopic = expandedTopic===d.topic ? '' : d.topic; repaint(); break;
      case 'topic-day': guide.filterTopic(d.topic,d.day || 'all'); break;
      case 'people-mode': Object.assign(directory,{mode:d.mode,group:'',detail:null,query:'',limit:32}); repaint(); break;
      case 'group': Object.assign(directory,{group:d.group,query:'',limit:32}); repaint(); break;
      case 'clear-group': Object.assign(directory,{group:'',query:'',limit:32}); repaint(); break;
      case 'person': directory.detail = d.id; repaint(); mount.scrollIntoView({block:'start'}); break;
      case 'back-person': directory.detail = null; repaint(); mount.scrollIntoView({block:'start'}); break;
      case 'more-people': directory.limit += 40; refreshPeople(); break;
      case 'event': guide.openEvent(d.id); break;
      case 'pick': {
        if (picked.has(d.topic)) picked.delete(d.topic); else picked.add(d.topic);
        store('interests',[...picked]); plan = null; notice = ''; repaint(); break;
      }
      case 'build': {
        calculate(); dropLimit = 12; repaint();
        const results = mount.querySelector('#ins-plan-results');
        if (results) { results.focus({preventScroll:true}); results.scrollIntoView({block:'start'}); }
        break;
      }
      case 'save-one': guide.saveIds([d.id]); notice = 'Saved to your schedule.'; repaint(); break;
      case 'save-plan': {
        const ids = arr(plan.items).map(x=>x.id).filter(id=>!savedIdsCache.has(String(id)));
        guide.saveIds(ids); notice = 'Saved '+plural(ids.length,'session','sessions')+' to your schedule.'; repaint(); break;
      }
      case 'more-drops': dropLimit += 12; repaint(); break;
    }
  }
  window.Insights = {
    render(which,node,api) {
      view = which; mount = node; guide = api; prepare();
      if (view==='planner' && plan) calculate();
      repaint();
    },
    openPerson(id) {
      if (view !== 'people') return false;
      peopleIndex();
      if (!metadata.has(String(id))) return false;
      directory.detail = String(id); repaint(); mount.scrollIntoView({block:'start'}); return true;
    },
    back() {
      if (view==='people' && directory.detail) { directory.detail=null; repaint(); return true; }
      if (view==='people' && directory.group) { directory.group=''; directory.query=''; repaint(); return true; }
      if (view==='topics' && expandedTopic) { expandedTopic=''; repaint(); return true; }
      return false;
    }
  };
})();
