"""Import the public SC26 contributor directory and optionally enrich it from the organizer's offline bundle.

Usage: python scripts/import_people.py DIRECTORY_HTML BUNDLE_DIR
Public source: https://sc26.conference-program.com/contributors/
"""
import argparse
import gzip
import json
from pathlib import Path
from urllib.parse import parse_qs, urlparse, urljoin

from lxml import html
import msgpack

ROOT = Path(__file__).resolve().parents[1]
SITE = "https://sc26.conference-program.com/"
COUNTRIES = {"USA": "United States of America", "Brasil": "Brazil"}


def clean(value):
    return " ".join(value.split())


def query(anchor):
    return {k: v[0] for k, v in parse_qs(urlparse(anchor.get("href")).query).items()}


def texts(node, xpath):
    return list(dict.fromkeys(clean(e.text_content()) for e in node.xpath(xpath) if clean(e.text_content())))


def attach(person, session, submission, title, category, role):
    key = session if submission in ("", "none") else f"{session}--{submission}"
    person["appearances"][key] = dict(id=key, sessionId=session, title=clean(title), format=category, role=role)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("directory", type=Path)
    parser.add_argument("bundle", type=Path)
    args = parser.parse_args()
    source = html.fromstring(args.directory.read_text(encoding="utf-8"))
    people = {}
    for entry in source.xpath('//div[@class="ll-person presenter-entry"]'):
        anchor = entry.xpath('.//a[@data-link-type="author-index.person"]')[0]
        uid = query(anchor)["uid"]
        person = people[uid] = {
            "id": uid, "name": clean(anchor.text_content()),
            "institutions": texts(entry, './/*[@class="presenter-institution"]'),
            "countries": [COUNTRIES.get(c, c) for c in texts(entry, './/*[@class="person-country"]')],
            "appearances": {}, "url": f"{SITE}presenter/?uid={uid}",
        }
        for block in entry.xpath('.//*[@class="presentation-list"]/div[a]'):
            a = block.xpath('./a')[0]
            q = query(a)
            attach(person, q["sess"], q.get("id", ""), a.text_content(), clean(block[0].text_content()),
                   "Contributor" if "id" in q else "Chair")

    for path in sorted(args.bundle.glob("*.msgpack")):
        with path.open("rb") as file:
            for row in msgpack.Unpacker(file, raw=False):
                if "/presenter/?uid=" not in row.get("url", ""):
                    continue
                uid = parse_qs(urlparse(row["url"]).query)["uid"][0]
                if uid not in people:
                    continue
                person = people[uid]
                page = html.fromstring(gzip.decompress(row["body"]).decode("utf-8"))
                images = page.xpath('//*[@class="presenter-photo"]//img/@src')
                if images and "wp_presenter_img_" in images[0]:
                    person["photoUrl"] = urljoin(SITE, images[0])
                # Profile cards recover the listed chair roles without links in the directory.
                for card in page.xpath('//*[@psid and @ssid]'):
                    title = texts(card, './/*[@class="title-link"]')
                    category = texts(card, './/*[@class="etypes-list"]/*')
                    if title and category:
                        role = "Chair" if card.getparent().get("class") == "chaired-session-list" else "Contributor"
                        attach(person, card.get("psid"), card.get("ssid"), title[0], category[0], role)

    # Link repeated poster displays and use the organizer's item-specific roles.
    program = ROOT / "data" / "program.json"
    if program.exists():
        for event in json.loads(program.read_text())["events"]:
            for uid in event["people"]:
                if uid not in people:
                    continue
                role_names = ["Author" if r == "authorpresenter" else r.replace("-", " ").title()
                              for r in event.get("roles", {}).get(uid, [])]
                if uid in event.get("presenters", []) and "Presenter" not in role_names:
                    role_names.append("Presenter")
                people[uid]["appearances"][event["id"]] = {
                    "id": event["id"], "sessionId": event["parentId"] or event["id"],
                    "title": event["title"], "format": event["format"], "role": ", ".join(role_names) or "Contributor",
                }

    supplements = ROOT / "scripts" / "portrait_sources.json"
    if supplements.exists():
        for uid, source in json.loads(supplements.read_text()).items():
            if uid in people:
                people[uid].update(source)

    unavailable_path = ROOT / "scripts" / "unavailable_portraits.json"
    unavailable = set(json.loads(unavailable_path.read_text())) if unavailable_path.exists() else set()
    for person in people.values():
        if person.get("photoUrl") in unavailable:
            person.pop("photoUrl")
        person["appearances"] = list(person["appearances"].values())
        portrait = ROOT / "app" / "portraits" / (person["id"] + ".jpg")
        if portrait.exists():
            person["photo"] = f"portraits/{portrait.name}"
    evidence = ROOT / "scripts" / "tas_evidence.json"
    if evidence.exists():
        for uid, publications in json.loads(evidence.read_text()).items():
            if uid in people:
                people[uid]["publications"] = publications
    (ROOT / "data").mkdir(exist_ok=True)
    (ROOT / "data" / "people.json").write_text(json.dumps(list(people.values()), ensure_ascii=False, separators=(",", ":")))
    print(len(people), "contributors;", sum("photoUrl" in p for p in people.values()), "profile photos")


if __name__ == "__main__":
    main()
