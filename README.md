# SC26 Field Guide for Android

An independent, offline conference companion for SC26, with a searchable program, personal itinerary planner, contributor directory, and venue maps. Created in ChatGPT using the Astra 6.2 model, this repository preserves the delivered Android app, browser edition, original source bundle, and extracted source code.

The bundled conference program is a **November 18, 2026 snapshot** for SC26 at McCormick Place in Chicago, November 15–20. Times are shown in Chicago local time. Follow the source links in each entry for subsequent organizer updates.

## Get started

- **Android:** [Download SC26-Field-Guide.apk](../../raw/refs/heads/main/SC26-Field-Guide.apk) and open it on an Android 8.0 or newer phone with a current Android System WebView. Android may ask you to allow installation from your browser or file manager.
- **Browser:** Download [SC26-Field-Guide.html](../../raw/refs/heads/main/SC26-Field-Guide.html) and open the downloaded file in a browser. It includes the app, data, maps, and portraits in one file.
- **Source:** Browse [src/](src/) or download the original [source ZIP](SC26-Field-Guide-Source.zip).

The guide works with bundled content offline. External conference and publication links require Internet access. Saved sessions and interests are stored locally on the device or browser.

## Features

- Search and filter the schedule by date, time, format, and room.
- Explore topic patterns across the conference and browse contributor profiles and speaking appearances.
- Build an itinerary from topics and custom keywords, accounting for saved sessions, overlaps, and room-change time.
- Bookmark sessions and export a personal schedule as an iCalendar file.
- Pan and zoom seven bundled venue floor plans, with room markers where coordinates are available.
- Explore a curated IEEE Transactions on Applied Superconductivity contributor view with supporting publication records.

The supplied documentation describes 2,335 dated program entries and 3,977 contributor profiles. These are snapshot counts, not a live feed. See the [original bundle README](src/README.md) for coverage, counting rules, source links, and data-refresh instructions.

## Repository layout

| Path | Contents |
| --- | --- |
| `SC26-Field-Guide.apk` | Original Android installation package |
| `SC26-Field-Guide.html` | Original standalone browser edition |
| `SC26-Field-Guide-Source.zip` | Original ChatGPT source bundle, preserved unchanged |
| `src/app/` | HTML, CSS, JavaScript, bundled data, maps, and portraits |
| `src/android/` | Java WebView wrapper, Android resources, manifest, and APK build script |
| `src/data/` | Imported program and contributor JSON snapshots |
| `src/scripts/` | Import, data-generation, portrait, venue, and portable-HTML tools |
| `src/tests/` | Node.js tests for planning, program data, and calendar export |
| `src/checks/` | Additional Playwright interaction checks |

## Run from source

No backend or runtime API key is required. Serve the web app locally with Python 3:

```bash
python3 -m http.server 8000 --directory src/app
```

Open <http://localhost:8000>. You can also open `src/app/index.html` directly.

To generate a fresh standalone browser edition:

```bash
cd src
python3 scripts/portable.py
```

The generated file is `src/dist/SC26-Field-Guide.html` relative to the repository root. The original root-level HTML remains preserved.

## Build the Android app

The project uses a shell build script and Android SDK tools directly. Install a JDK providing `javac` and `keytool`, Android SDK Platform 35, Android SDK Build Tools 35.0.0, Bash, and `zip`. Then run:

```bash
export ANDROID_SDK_ROOT=/path/to/Android/Sdk
cd src
./android/build.sh
```

The output is `src/dist/SC26-Field-Guide.apk` relative to the repository root. The manifest requires Android API 26 or newer and targets API 34; compilation uses Platform 35.

The script creates a local signing key on its first run. Set `GUIDE_KEYSTORE` and `GUIDE_SIGN_PASSWORD` to use your own signing identity. The original APK's private signing key is not included, so a rebuilt APK uses a different signature unless you supply the original key.

## Verification

With Node.js 20 or newer, run from the repository root:

```bash
node --test src/tests/*.cjs
```

All 19 included tests passed during repository setup. They cover itinerary compatibility, room-transfer rules, keyword matching, time conversion, and calendar serialization, including every packaged event. This does not establish Android device or browser interaction validation.

The optional Playwright checks live in `src/checks/`; see [the bundle instructions](src/README.md#verify-or-refresh) for dependencies and invocation. Run those checks from `src/`, generating the portable edition first for checks that use `dist/`.

## Sources and license

This is an independent project. Program entries link back to the conference organizer; it is not presented as an official SC26 app. Source attribution and supplementary photo and publication records are retained in the bundle documentation and `src/scripts/`.

The repository retains its [MIT license](LICENSE). Conference program content, contributor portraits, maps, and other credited third-party materials remain subject to their respective owners' rights; the repository license does not grant additional rights to those materials.
