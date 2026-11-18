"""Join the official event and contributor tables into the guide's offline index."""
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]
def read(filename):
    return json.loads((ROOT / 'data' / filename).read_text())

def main():
    program = read('program.json')
    people = read('people.json')
    people_by_id = {p['id']: p for p in people}
    source = {e['id']: e for e in program['events']}
    events = []
    for original in program['events']:
        if original['format'] == 'Job Posting':
            continue
        event = original.copy()
        parent = source.get(event['parentId'], {})
        event.update(day=event['date'], workId=event['contentId'], parentTitle=parent.get('title',''))
        # Recording and pass conditions can be announced at the session level.
        # A session-wide list of poster tracks need not apply to every poster.
        fallback = {k:v for k,v in parent.get('tags', {}).items()
                    if k in ('registration-category','recording') and k not in event.get('tags', {})}
        event['tags'] = {**fallback, **event.get('tags', {})}
        event['inheritedTags'] = list(fallback)
        people_at_event = []
        for uid in event['people']:
            profile = people_by_id[uid]
            roles = event['roles'].get(uid, [])
            presenting = uid in event['presenters']
            # SC26 distinguishes authorpresenter (a source role) from its presenting flag.
            normalized = [('Author' if r == 'authorpresenter' else r.replace('-',' ').capitalize()) for r in roles]
            if presenting and 'Presenter' not in normalized:
                normalized.append('Presenter')
            people_at_event.append(dict(id=uid,name=profile['name'],role=' · '.join(dict.fromkeys(normalized)),
                                        presenting=presenting))
        event['people'] = people_at_event
        del event['roles']
        events.append(event)
    ids = {e['id'] for e in events}
    assert len(ids) == len(events)
    assert all(not e['parentId'] or e['parentId'] in ids for e in events)
    bundle = {'events':events, 'people':people, 'meta':{
        **program['meta'], 'guideEntries':len(events),
        'excludedJobEntries':len(source)-len(events),
        'mapSource':'https://sc26.conference-program.com/map/',
        'directorySource':'https://sc26.conference-program.com/contributors/'}}
    (ROOT/'app'/'data.js').write_text('window.SC_DATA='+json.dumps(bundle,ensure_ascii=False,separators=(',',':'))+';\n')
    print(len(events), 'entries;', len(people), 'contributors')
if __name__=='__main__':
    main()
