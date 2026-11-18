"""Cache public SC26 headshots for SC26 program contributors."""
import argparse
from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
import json
from pathlib import Path
import subprocess
from urllib.request import urlopen

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]


def download(person):
    path = ROOT / "app" / "portraits" / (person["id"] + ".jpg")
    if path.exists():
        return True
    try:
        try:
            with urlopen(person["photoUrl"], timeout=20) as response:
                data = response.read()
        except OSError:
            data = subprocess.run(["curl", "-fsSL", "--max-time", "24", person["photoUrl"]], check=True,
                                  stdout=subprocess.PIPE, stderr=subprocess.DEVNULL).stdout
        with Image.open(BytesIO(data)) as image:
            portrait = ImageOps.exif_transpose(image).convert("RGB")
            portrait.thumbnail((300, 360), Image.Resampling.LANCZOS)
            temporary = path.with_suffix(".part")
            portrait.save(temporary, "JPEG", quality=83, optimize=True)
            temporary.replace(path)
        return True
    except (OSError, ValueError, subprocess.CalledProcessError) as err:
        print(person["name"], err, flush=True)
        return False


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--count", type=int, default=None)
    args = parser.parse_args()
    people = json.loads((ROOT / "data" / "people.json").read_text())
    featured = {"714234", "395983", "656483", "676914", "240893", "349434", "140834"}
    available = [p for p in people if p.get("photoUrl")]
    def rank(p):
        keynote = any(a["format"] in {"Keynote", "Invited Talk", "Plenary"} for a in p["appearances"])
        return p["id"] in featured or "publications" in p, keynote, len(p["appearances"])
    selected = sorted(available, key=rank, reverse=True)[:args.count]
    (ROOT / "app" / "portraits").mkdir(parents=True, exist_ok=True)
    with ThreadPoolExecutor(max_workers=6) as pool:
        print(f"{sum(pool.map(download, selected))} / {len(selected)} headshots cached")


if __name__ == "__main__":
    main()
