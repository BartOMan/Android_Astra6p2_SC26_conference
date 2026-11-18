"""Bundle the official SC26 floor plans and their published room coordinates."""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import json
import re
import subprocess
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
PAGE = 'https://sc26.conference-program.com/map/'
def fetch(url):
    return subprocess.check_output(['curl', '-fsSL', '--retry', '2', '--max-time', '60', url])

def main():
    url = re.search(rb'data-json="(https://mapplic.com/getMapData[^"]+)"', fetch(PAGE)).group(1).decode()
    data = json.loads(fetch(url))
    base = ROOT / 'app' / 'maps'
    base.mkdir(exist_ok=True, parents=True)

    def get_floor(info):
        raw = fetch(info['file'])
        doc = ET.fromstring(raw)
        if not doc.tag.endswith('}svg') or not re.fullmatch(r'[\w-]+', info['id']):
            raise ValueError(info['id'])
        width, height = [float(x) for x in doc.attrib['viewBox'].split()[2:]]
        if any(e.tag.endswith(('}script', '}foreignObject')) for e in doc.iter()):
            raise ValueError('Expected static floor map')
        (base / (info['id'] + '.svg')).write_bytes(raw)
        return {'id':info['id'], 'name':info['name'], 'w':width, 'h':height}

    with ThreadPoolExecutor(7) as pool:
        floors = list(pool.map(get_floor, data['layers']))
    spaces = []
    floor_by_id = {f['id']:f for f in floors}
    for p in data['locations']:
        if not p['id'].startswith('r') or not p.get('coord'): continue
        f = floor_by_id[p['layer']]
        # Coordinates are fractions of the map-wide canvas, even for the landscape overview.
        x, y = p['coord']
        spaces.append({'id':p['id'], 'name':p['title'], 'floor':f['id'],
                       'x':round(x * data['settings']['mapWidth'] / f['w'], 5),
                       'y':round(y * data['settings']['mapHeight'] / f['h'], 5)})
    out = {'floors':floors, 'spaces':spaces, 'source':PAGE}
    (ROOT/'app'/'maps.js').write_text('window.SC_MAPS='+json.dumps(out,ensure_ascii=False,separators=(',',':'))+';\n')
if __name__ == '__main__':
    main()
