/* Offline iCalendar export. All SC26 program days fall within Chicago standard time. */
(function(root){
  'use strict';
  const CRLF = '\r\n';
  const utc = date => date.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
  const asUTC = (day,time) => utc(new Date(day+'T'+time+':00-06:00'));
  const asText = raw => String(raw || '').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,'').replace(/\\/g,'\\\\').replace(/\r\n|\r|\n/g,'\\n').replace(/([,;])/g,'\\$1');
  function fold(line) {
    let count=0, result='';
    for(const ch of line) {
      const point=ch.codePointAt(0), size=point<=0x7f?1:point<=0x7ff?2:point<=0xffff?3:4;
      if (count+size>75) { result+=CRLF+' ';count=1; }
      result+=ch;count+=size;
    }
    return result;
  }
  function serialize(events, now=new Date()) {
    const out=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//SC26 Field Guide//Offline Itinerary//EN','CALSCALE:GREGORIAN','X-WR-CALNAME:SC26 itinerary'];
    const stamp=utc(now);
    for (const e of events) {
      const people=(e.people||[]).filter(p=>p.presenting).map(p=>p.name);
      const detail=[e.format,e.dropIn?'Drop-in display window':'',e.parentTitle,
        people.length?'Presenters: '+people.join(', '):'',e.url].filter(Boolean).join('\n');
      out.push('BEGIN:VEVENT','UID:'+asText(e.id)+'@sc26-field-guide.local','DTSTAMP:'+stamp,
        'DTSTART:'+asUTC(e.day||e.date,e.start),'DTEND:'+asUTC(e.day||e.date,e.end),
        'SUMMARY:'+asText(e.title),'LOCATION:'+asText(e.room),'DESCRIPTION:'+asText(detail),
        'TRANSP:'+(e.dropIn?'TRANSPARENT':'OPAQUE'));
      if (/^https:\/\/[^\s]+$/.test(e.url||'')) out.push('URL:'+e.url);
      out.push('END:VEVENT');
    }
    out.push('END:VCALENDAR');
    return out.map(fold).join(CRLF)+CRLF;
  }
  function exportSaved(guide) {
    const saved = new Set(guide.getSaved());
    const entries = guide.events.filter(e=>saved.has(e.id));
    if (!entries.length) return;
    const content=serialize(entries);
    if (root.GuideExport?.writeCalendar) {
      root.GuideExport.writeCalendar(content);
      return;
    }
    const a=document.createElement('a');
    a.href=URL.createObjectURL(new Blob([content],{type:'text/calendar;charset=utf-8'}));
    a.download='SC26-itinerary.ics';
    document.body.append(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(a.href),60000);
  }
  root.Itinerary={serialize,exportSaved};
  if (typeof module !== 'undefined' && module.exports) module.exports=root.Itinerary;
})(typeof window==='undefined'?globalThis:window);
