/* Venue geometry and locations are published by the SC26 schedule. */
(() => {
  'use strict';
  const {floors, spaces, source} = window.SC_MAPS;
  const key = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const byName = new Map(spaces.map(p => [key(p.name),p]));
  const byId = new Map(spaces.map(p => [key(p.id.slice(1)),p]));
  function resolve(room) {
    if (!room) return null;
    return byName.get(key(room)) || byId.get(key(room)) || null;
  }
  function open(room = '', eventId = null) {
    const g = window.Guide;
    const esc = g.esc;
    const selected = resolve(room);
    const offsite = room === 'Griffin Museum of Science & Industry';
    const concourse = room === 'Central Concourse';
    let space = selected;
    let floor = floors.find(f => f.id === (space ? space.floor : concourse ? 'west3' : 'overview'));
    let zoom = space ? 3 : 1;
    const choices = [...spaces].sort((a,b) => a.name.localeCompare(b.name, 'en', {numeric:true}));
    const title = room || 'McCormick Place';
    g.openSheet(title, `<div class="vm">
      ${eventId ? '<button type="button" class="vm-back">← Session details</button>' : ''}
      ${offsite ? '<p class="vm-unmapped"><strong>Off-site reception</strong><br>5700 S. DuSable Lake Shore Drive, Chicago. Conference shuttles use West Building gates 43 and 44, Thursday 6:30–10:30 PM. <a target="_blank" rel="noopener" href="https://sc26.supercomputing.org/attendees/receptions/">SC26 reception details</a> · <a target="_blank" rel="noopener" href="https://www.griffinmsi.org/directions-and-parking">Museum directions</a></p>' : concourse ? '<p class="vm-unmapped">The Central Concourse is on West Level 3. The schedule lists the concourse as the location.</p>' : room && !selected ? '<p class="vm-unmapped">SC26 lists this location as <strong>'+esc(room)+'</strong>. Choose a floor or a mapped room below.</p>' : ''}
      <label>Floor<select class="vm-floor">${floors.map(f=>'<option value="'+esc(f.id)+'">'+esc(f.name)+'</option>').join('')}</select></label>
      <label>Room or landmark<select class="vm-room"><option value="">Choose a location</option>${choices.map(s=>'<option value="'+esc(s.id)+'">'+esc(s.name)+'</option>').join('')}</select></label>
      <div class="vm-toolbar"><strong class="vm-caption"></strong><button class="vm-out" aria-label="Zoom out">−</button><button class="vm-in" aria-label="Zoom in">+</button></div>
      <div class="vm-viewport" aria-label="Scrollable floor plan" tabindex="0"><div class="vm-canvas"><img class="vm-image" alt=""><span class="vm-pin" hidden></span></div></div>
      <p class="vm-credit">Floor plans from the SC26 schedule. <a target="_blank" rel="noopener" href="${source}">Official interactive map ↗</a></p>
      </div>`);
    const root = document.querySelector('#sheet .vm');
    const find = s => root.querySelector(s);
    const view = find('.vm-viewport'), canvas = find('.vm-canvas'), img = find('.vm-image'), pin = find('.vm-pin');
    function draw(centerX,centerY) {
      find('.vm-floor').value = floor.id;
      find('.vm-room').value = space?.id || '';
      find('.vm-caption').textContent = space ? space.name+' · '+floor.name : floor.name;
      const file = 'maps/' + floor.id + '.svg';
      img.src = window.SC_EMBEDDED?.[file] || file;
      img.alt = 'SC26 floor plan · '+floor.name;
      // Explicit dimensions keep the published coordinate system intact while zooming.
      const width = Math.max(1,view.clientWidth-2) * zoom;
      const height = width * floor.h / floor.w;
      canvas.style.width = width+'px';
      canvas.style.height = height+'px';
      pin.hidden = !space;
      if (space) {
        pin.style.left = (space.x*100)+'%';
        pin.style.top = (space.y*100)+'%';
      }
      view.scrollLeft = width*(centerX ?? space?.x ?? 0.5) - view.clientWidth/2;
      view.scrollTop = height*(centerY ?? space?.y ?? 0.5) - view.clientHeight/2;
      find('.vm-out').disabled = zoom<=1;
      find('.vm-in').disabled = zoom>=8;
    }
    const changeZoom = factor => {
      const x = (view.scrollLeft+view.clientWidth/2)/canvas.offsetWidth;
      const y = (view.scrollTop+view.clientHeight/2)/canvas.offsetHeight;
      zoom=Math.min(8,Math.max(1,zoom*factor));draw(Math.min(1,x),Math.min(1,y));
    };
    find('.vm-in').onclick = () => changeZoom(1.6);
    find('.vm-out').onclick = () => changeZoom(1/1.6);
    find('.vm-floor').onchange = e => {floor = floors.find(f=>f.id===e.target.value);space=null;zoom=1;draw();};
    find('.vm-room').onchange = e => {
      space=spaces.find(s=>s.id===e.target.value)||null;
      if (space) floor=floors.find(f=>f.id===space.floor);
      zoom=space?3:1;draw();
    };
    if (eventId) find('.vm-back').onclick = () => g.openEvent(eventId);
    draw();
  }
  const style = document.createElement('style');
  style.textContent = `.vm{display:grid;gap:12px}.vm label{font:600 13px/1.4 system-ui;color:#314f43;display:grid;gap:4px}.vm select{background:#fffdf5;color:#173e32;font-size:16px;border:1px solid #bccabe;border-radius:8px;padding:9px;min-width:0;width:100%}.vm-toolbar{display:flex;align-items:center;gap:6px}.vm-caption{flex:1;font-size:14px}.vm-in,.vm-out,.vm-back{border:1px solid #b5c7b9;border-radius:9px;background:white;color:#194733;min-width:44px;min-height:44px;font-size:20px}.vm-in:disabled,.vm-out:disabled{opacity:.4}.vm-back{justify-self:start;font-size:14px;padding:0 12px}.vm-viewport{height:clamp(225px,43vh,430px);width:100%;overflow:auto;overscroll-behavior:contain;border:1px solid #baccc0;background:#fff;border-radius:12px;position:relative}.vm-canvas{position:relative}.vm-image{display:block;width:100%;height:100%;max-width:none;pointer-events:none}.vm-pin{position:absolute;width:15px;height:15px;transform:translate(-50%,-50%);border-radius:50%;border:2px solid white;background:#cf252a;box-shadow:0 0 0 5px #e03b3b55,0 1px 4px #592a28}.vm-pin[hidden]{display:none}.vm-credit,.vm-unmapped{font-size:13px;line-height:1.45;margin:0}.vm-credit a{color:#1c5e45;text-decoration:underline}`;
  document.head.append(style);
  window.Venue = {open,resolve};
})();
