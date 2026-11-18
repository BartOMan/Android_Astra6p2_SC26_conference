"""Build SC26's local schedule from the organizer's public full program and offline cache.

Requires Python 3.10+, lxml, msgpack, and curl. The package referenced by current.json
is content-checked. The full-program tables take precedence for published time and room.
"""
import argparse
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
import gzip
from hashlib import sha256
import json
from pathlib import Path
import re
import subprocess
from urllib.parse import parse_qs, urljoin, urlparse
from zoneinfo import ZoneInfo

from lxml import html
import msgpack

SITE = 'https://sc26.conference-program.com/'
OFFLINE = urljoin(SITE, 'wp-content/uploads/llvp-offline/')
TZ = ZoneInfo('America/Chicago')


def fetch(url, path, refresh=False):
    if refresh or not path.exists():
        tmp = path.with_suffix(path.suffix + '.part')
        subprocess.run(['curl', '-fsSL', '--retry', '2', '--max-time', '65', url, '-o', str(tmp)], check=True)
        tmp.replace(path)
    return path


def by_class(node, cls):
    return node.xpath('.//*[contains(concat(" ",normalize-space(@class)," "),$cls)]', cls=' '+cls+' ')


def content(node):
    return ' '.join(node.text_content().split())


def first(node, cls):
    els = by_class(node, cls)
    return els[0] if els else None


def val(node, cls):
    el = first(node, cls)
    return content(el) if el is not None else ''


def without_label(el, cls):
    if el is None:
        return ''
    for node in by_class(el, cls):
        node.drop_tree()
    return content(el)


def prose(element):
    if element is None:
        return ''
    for label in by_class(element,'info-label'):
        label.drop_tree()
    chunks=[]
    def walk(node):
        if not isinstance(node.tag,str): return
        tag=node.tag.lower()
        if tag in ('br','p','div','ul','ol','li','h3','h4'): chunks.append('\n')
        if tag=='li': chunks.append('• ')
        if node.text: chunks.append(node.text)
        for child in node:
            walk(child)
            if child.tail: chunks.append(child.tail)
        if tag in ('p','div','li'): chunks.append('\n')
    walk(element)
    lines=[' '.join(line.split()) for line in ''.join(chunks).splitlines()]
    return re.sub(r'\n{3,}', '\n\n','\n'.join(lines)).strip()


def store_time(obj, node):
    for utc_key, date_key, time_key in [('s_utc','date','start'),('e_utc','endDate','end')]:
        if node.get(utc_key):
            stamp = datetime.fromisoformat(node.get(utc_key).replace('Z','+00:00')).astimezone(TZ)
            obj[date_key], obj[time_key] = stamp.strftime('%Y-%m-%d'), stamp.strftime('%H:%M')


def prefer_format(formats):
    return next((f for f in ['Paper','Invited Talk','Panel','Tutorial','Workshop','Posters','Keynote'] if f in formats), formats[0] if formats else 'Program')


def id_of(sess, sub):
    return sess if sub == 'none' else f'{sess}--{sub}'


def get_tracks(scope):
    results = {}
    for group in by_class(scope,'tag-group-list'):
        category = next((s for s in group.get('class','').split() if s!='tag-group-list' and not s.startswith('tag_group')), '')
        values = []
        for t in by_class(group, 'program-track'):
            title = t.xpath('.//*[@title]/@title')
            values.append(title[0] if title else content(t))
        if values:
            results[category] = list(dict.fromkeys(results.get(category,[])+values))
    return results


def detail(record, people):
    parsed = html.fromstring(gzip.decompress(record['body']).decode())
    node = parsed.xpath('//*[@conference][@session]')[0]
    sess, sub = node.get('session'), node.get('presentation','none')
    sess_mode = sub == 'none'
    title = without_label(first(node,'presentation-title'),'event-types-small')
    desc = prose(first(node,'session-description' if sess_mode else 'abstract'))
    formats = [content(f) for group in by_class(node,'event-types') for f in by_class(group,'event-type-name')]
    sections = by_class(node,'session-chairs-list-sect') if sess_mode else by_class(node,'presenter-details-sect')
    roles, presenting = {}, []
    for sec in sections:
        groups = [sec] if sess_mode else list(sec)
        for group in groups:
            if not isinstance(group.tag,str):
                continue
            role = 'session-chair' if sess_mode else group.get('class','contributor')
            for p in by_class(group,'ll-person'):
                name_el = first(p,'presenter-name')
                if name_el is None:
                    continue
                anchors = name_el.xpath('.//a[contains(@href,"uid=")]')
                if not anchors:
                    continue
                uid = parse_qs(urlparse(anchors[0].get('href')).query)['uid'][0]
                inst = [content(a) for a in by_class(p,'presenter-institution')]
                pics = p.xpath('.//img[contains(@class,"presenter-pic")]/@src')
                people.setdefault(uid,{'id':uid,'name':content(anchors[0]),'institutions':inst,'photo':urljoin(SITE,pics[0]) if pics else '', 'url':urljoin(SITE,'presenter/?uid='+uid)})
                roles.setdefault(uid,[])
                if role not in roles[uid]:
                    roles[uid].append(role)
                if 'presenting' in p.get('class','').split() and uid not in presenting:
                    presenting.append(uid)
    tracks={}
    for section in by_class(node,'presentation-track-sect'):
        tracks.update(get_tracks(section))
    event = dict(id=id_of(sess,sub), contentId=sub if not sess_mode else sess,
                 title=title, kind='block' if sess_mode else 'item', parentId='' if sess_mode else sess,
                 format=prefer_format(formats), formats=formats, room=val(node,'room'), description=desc,
                 topics=tracks.get('tag',[]), tags=tracks, people=list(roles), roles=roles, presenters=presenting,
                 url=record['url'], timing='exact', dropIn=False)
    store_time(event,node)
    rows = {row.get('ssid'):row for section in by_class(node,'session-contents') for row in section.xpath('.//tr[@ssid and @ssid!="none"]')}
    return event,rows


def main(cache, dest, reuse_session_pages=False):
    cache.mkdir(parents=True,exist_ok=True)
    home = fetch(SITE,cache/'home',True)
    daily_links = re.findall(r'source="([^"]*wp_program_view_all_(\d{4}-\d{2}-\d{2}).txt[^"]*)"',home.read_text())
    assert daily_links, 'No day tables found'
    def table(item):
        path, date = item
        return fetch(urljoin(SITE,path),cache/date,True)
    with ThreadPoolExecutor(6) as pool:
        files = list(pool.map(table,daily_links))
    day_variants={}
    for f in files:
        for row in html.fromstring(f.read_text()).xpath('//tr[@psid and @ssid]'):
            source_id=id_of(row.get('psid'),row.get('ssid'))
            day_variants.setdefault(source_id,{})[(row.get('s_utc'),row.get('e_utc'))]=row

    build = json.loads(fetch(OFFLINE+'current.json',cache/'manifest',True).read_bytes())
    layer = next(x for x in build['layers'] if x['name']=='Schedule details')
    murl = urljoin(OFFLINE,layer['manifest'])
    manifest = json.loads(fetch(murl,cache/'m3',True).read_bytes())
    def chunk(entry):
        path=cache/Path(entry['path']).name
        if not path.exists() or sha256(path.read_bytes()).hexdigest()!=entry['sha256']:
            fetch(urljoin(murl,entry['path']),path,True)
        assert sha256(path.read_bytes()).hexdigest()==entry['sha256'],path
        return path
    with ThreadPoolExecutor(5) as pool:
        bundles=list(pool.map(chunk,manifest['chunks']))
    events, people, occ_rows, calendars, canonical = {}, {}, {}, set(), {}
    for path in bundles:
        with path.open('rb') as stream:
            for r in msgpack.Unpacker(stream,raw=False):
                if r.get('status_code')!=200:
                    continue
                url=urlparse(r.get('url',''))
                query=parse_qs(url.query)
                if url.path.endswith('/get_cal/') and 'id' in query:
                    calendars.add(query['id'][0])
                if url.path not in ['/session/','/presentation/'] or 'sess' not in query:
                    continue
                event, rows=detail(r,people)
                events[event['id']]=event
                if event['kind']=='item':
                    canonical[event['contentId']]=event
                for sub,row in rows.items():
                    occ_rows[id_of(event['id'],sub)] = row

    # Check every block with a child roster against its live public session page.
    # The offline export can lag behind the web schedule as the conference runs.
    live_dir=cache/'current'
    live_dir.mkdir(exist_ok=True)
    session_ids=sorted(set(eid.split('--')[0] for eid in occ_rows))
    def live_session(session_id):
        path=fetch(events[session_id]['url'],live_dir/session_id,refresh=not reuse_session_pages)
        node=html.fromstring(path.read_text())
        contents=first(node,'session-contents')
        if contents is None:
            raise ValueError('Missing live session contents for '+session_id)
        return session_id,{id_of(session_id,r.get('ssid')):r for r in contents.xpath('.//tr[@ssid and @ssid!="none"]')}
    with ThreadPoolExecutor(6) as pool:
        live_rows={k:v for _,rows in pool.map(live_session,session_ids) for k,v in rows.items()}
    added_rows=sorted(live_rows.keys()-occ_rows.keys())
    removed_rows=sorted(occ_rows.keys()-live_rows.keys())
    retimed_rows=sorted(k for k in occ_rows.keys()&live_rows.keys() if
                        (occ_rows[k].get('s_utc'),occ_rows[k].get('e_utc'))!=(live_rows[k].get('s_utc'),live_rows[k].get('e_utc')))
    def add_detail(event_id):
        sess,sub=event_id.split('--')
        url=urljoin(SITE,f'presentation/?id={sub}&sess={sess}')
        path=fetch(url,live_dir/(sess+'--'+sub),refresh=not reuse_session_pages)
        record={'url':url,'body':gzip.compress(path.read_bytes())}
        return detail(record,people)[0]
    with ThreadPoolExecutor(5) as pool:
        for e in pool.map(add_detail,[k for k in added_rows if k.split('--')[1] not in canonical]):
            canonical[e['contentId']]=e
            events[e['id']]=e
    for event_id in removed_rows:
        if event_id not in day_variants: events.pop(event_id,None)
    occ_rows=live_rows

    # A poster's detail link can point to Tuesday even on Wednesday's session page.
    # The occurrence's parent and the nested row's times identify the correct visit.
    for event_id,row in occ_rows.items():
        parent_id,content_id=event_id.split('--')
        parent=events[parent_id]
        if event_id not in events:
            events[event_id]=dict(canonical[content_id],id=event_id,parentId=parent_id,room=parent['room'])
        e=events[event_id]
        store_time(e,row)
        if (parent['format'] in ['Posters','Art of HPC'] or 'Poster' in parent['title']) and e['start']==parent['start'] and e['end']==parent['end']:
            # Timed doctoral/blitz presentations remain separate from poster display windows.
            flexible = ('display' in parent['title'].lower() or 'reception' in parent['title'].lower() or 'exhibition' in parent['title'].lower())
            if flexible:
                e['dropIn'],e['timing']=True,'block'
        if not e['topics'] and parent['topics']:
            e['topics']=list(parent['topics'])
            e['topicsInherited']=True

    day_rows, repeated = {}, []
    for source_id, variants in day_variants.items():
        for i,((start,_),row) in enumerate(sorted(variants.items())):
            if i == 0:
                day_rows[source_id]=row
                continue
            # Several meet-and-greets reuse the full session AND presentation ID on
            # multiple dates. A linked detail/calendar represents only the first visit.
            event_id=source_id+'@'+start[:16].replace(':','')
            events[event_id]=dict(events[source_id],id=event_id)
            store_time(events[event_id],row)
            day_rows[event_id]=row
            repeated.append(event_id)
    changed_times, changed_rooms, day_only = [], [], []
    for event_id,row in day_rows.items():
        if event_id not in events:
            assert '--' not in event_id,event_id
            day_only.append(event_id)
            formats=[content(n) for sec in by_class(row,'type-td') for n in by_class(sec,'event-type-name')]
            trackcell=first(row,'full-tag-td')
            tracks=get_tracks(trackcell) if trackcell is not None else {}
            events[event_id]=dict(id=event_id,contentId=event_id,kind='item',parentId='',title=val(row,'presentation-title'),
                format=prefer_format(formats),formats=formats,description='',room='',topics=tracks.get('tag',[]),tags=tracks,
                people=[],presenters=[],roles={},timing='exact',dropIn=False,url=SITE)
        e=events[event_id]
        old_time=(e.get('date'),e.get('start'),e.get('end'))
        store_time(e,row)
        new_time=(e.get('date'),e.get('start'),e.get('end'))
        if old_time[0] and old_time!=new_time:
            changed_times.append(dict(id=event_id,bundle=old_time,publishedTable=new_time))
        room=val(row,'presentation-location')
        if room and e['room'] and room!=e['room']:
            changed_rooms.append(dict(id=event_id,bundle=e['room'],publishedTable=room))
        # Read credited people only from the row's speaker cell, never nested child tables.
        for box in row.xpath('./td[contains(@class,"speaker-td")]'):
            for person in by_class(box,'ll-person'):
                anchors=person.xpath('.//a[contains(@href,"uid=")]')
                if not anchors: continue
                uid=parse_qs(urlparse(anchors[0].get('href')).query)['uid'][0]
                people.setdefault(uid,{'id':uid,'name':content(anchors[0]),'institutions':[], 'photo':'','url':urljoin(SITE,'presenter/?uid='+uid)})
                if uid not in e['people']:
                    e['people'].append(uid)
                    e['roles'][uid]=['contributor']
                if 'presenting' in person.get('class','').split() and uid not in e['presenters']:
                    e['presenters'].append(uid)

        if room: e['room']=room
        title=val(row,'presentation-title')
        if title and title!=e['title']:e['scheduleTitle']=title

    for e in events.values():
        if e['parentId'] not in events: e['parentId']=''
        if e['endDate']==e['date']:del e['endDate']
    child_counts=Counter(e['parentId'] for e in events.values() if e['parentId'])
    for e in events.values():
        if e['kind']=='block' and not child_counts[e['id']]: e['kind']='item'
    assert calendars<=events.keys()|set(removed_rows),f'Missing published calendar entries {calendars-events.keys()-set(removed_rows)}'
    assert day_rows.keys()<=events.keys()
    assert all(e.get('title') and e.get('start') and e.get('end') and e.get('date') for e in events.values())
    source_build=build['built_at']
    output={'meta':{'source':SITE,'timezone':'America/Chicago','offlineBuilt':source_build,
                    'scheduleGenerated':html.fromstring(files[0].read_text()).get('generated'),
                    'reconciliation':{'dayTableCount':len(files),'scheduleOnly':len(day_only),'additionalRepeatAppearances':repeated,'timeOverrides':changed_times,'roomOverrides':changed_rooms,
                    'liveSessionPages':len(session_ids),'addedLiveRows':added_rows,'removedLiveRows':removed_rows,'retimedLiveRows':retimed_rows},
                    'calendarEntries':len(calendars),'dailyTableRows':len(day_rows),'detailPresentations':len(canonical),
                    'sessionOccurrences':len(occ_rows),'calendarCoverage':len(calendars&events.keys()),'programEntries':len(events)},
            'events':sorted(events.values(),key=lambda e:(e['date'],e['start'],e['room'],e['title'])),
            'people':sorted(people.values(),key=lambda p:p['name'])}
    dest.parent.mkdir(parents=True,exist_ok=True)
    dest.write_text(json.dumps(output,ensure_ascii=False,separators=(',',':')))
    print(json.dumps(output['meta'],indent=2))
    print('People',len(people),'child groups',len(child_counts),'drop-in entries',sum(e['dropIn'] for e in events.values()))
    print(Counter(e['format'] for e in events.values()))


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cache',type=Path,default=Path('/tmp/sc26-source'))
    parser.add_argument('--out',type=Path,default=Path('data/program.json'))
    parser.add_argument('--reuse-session-pages',action='store_true',help='Use previously downloaded live session HTML files from this cache')
    args=parser.parse_args()
    main(args.cache,args.out,args.reuse_session_pages)
