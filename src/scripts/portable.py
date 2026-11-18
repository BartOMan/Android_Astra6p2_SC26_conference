"""Make one offline HTML edition of the exact Android guide for desktop or phone browsers."""
import base64
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
app = ROOT / 'app'
out = ROOT / 'dist' / 'SC26-Field-Guide.html'
out.parent.mkdir(exist_ok=True)
html = (app / 'index.html').read_text()
html = re.sub(r'<link rel="stylesheet" href="([^"]+)">', lambda m:'<style>'+ (app / m[1]).read_text()+'</style>', html)
scripts = re.findall(r'  <script defer src="([^"]+)"></script>\n', html)
html = re.sub(r'  <script defer src="[^"]+"></script>\n','',html)
assets = {}
for folder, mime in [('maps','image/svg+xml'),('portraits','image/jpeg')]:
    for p in sorted((app/folder).iterdir()):
        if p.suffix not in ('.jpg','.svg'):
            continue
        assets[p.relative_to(app).as_posix()]='data:'+mime+';base64,'+base64.b64encode(p.read_bytes()).decode()
js = ['window.SC_EMBEDDED='+json.dumps(assets,separators=(',',':'))+';']
for filename in scripts:
    source = (app/filename).read_text()
    # Keep imported text inside its script element when HTML parses the standalone edition.
    if filename in ('data.js','maps.js'):
        source=source.replace('<','\\u003c')
    js.append(re.sub(r'</script',lambda m:'<\\/script',source,flags=re.I))
html=html.replace('</body>',('<script>'+'</script>\n<script>'.join(js)+'</script>\n</body>'))
out.write_text(html)
print(out.name, out.stat().st_size,'bytes')
