"""Bundle buildable sources and the exact data snapshot, without SDKs or signing keys."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

ROOT=Path(__file__).resolve().parents[1]
paths=[ROOT/'README.md']
for name in ('android','app','checks','data','scripts','tests'):
    paths.extend(sorted(p for p in (ROOT/name).rglob('*')
                        if p.is_file() and '__pycache__' not in p.parts and not p.name.endswith('.part')))
out=ROOT/'dist'/'SC26-Field-Guide-Source.zip'
out.parent.mkdir(exist_ok=True)
with ZipFile(out,'w',ZIP_DEFLATED,compresslevel=6) as z:
    for path in paths:
        z.write(path, 'SC26-Field-Guide/'+path.relative_to(ROOT).as_posix())
with ZipFile(out) as z:
    assert z.testzip() is None
    assert len(z.namelist())==len(paths)
print(out.name,len(paths),'files')
