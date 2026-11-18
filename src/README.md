# SC26 Field Guide for Android

An independent, offline guide to SC26 at McCormick Place in Chicago, November 15–20, 2026. The schedule is a November 18 snapshot. Each entry links to the organizer’s program for subsequent updates. All conference times are Chicago local time.

## On your phone

Open the signed APK on an Android 8.0 or newer phone with a current Android System WebView. If Android requests permission to install an app from the browser or file manager, follow the installer prompt. The same APK runs on ARM and x86 Android devices. The app stores saved sessions and interests on this device.

- **Schedule** opens on the conference day. Tap a column in the hourly chart or use date, time, format and room filters. Entering a search opens all dates and includes ancillary listings. Open a block to see its presentations, presenters and room.
- **Topics** shows when a topic is concentrated. Totals count distinct works and the day cells count scheduled appearances. A poster shown on three days appears in each of those day cells. Tap a cell for its schedule.
- **People** links conference profiles, professional photos, session roles and next speaking appearances. Switch between all contributors and speakers when comparing institutions or countries. Country and territory labels come from the official profile. Some profiles omit a country or list more than one affiliation.
- **People → IEEE TAS** shows a curated set of nine contributors with verified papers in IEEE Transactions on Applied Superconductivity. Paper counts refer to the linked selection. A profile may list additional publications.
- **Planner** accepts topic choices and custom words or phrases. Add a date and a room-change allowance. Your saved entries anchor the result. Saved conflicts are shown for you to resolve. Unscheduled visits to drop-in posters and art appear under the timed itinerary. A displayed poster alone does not establish when its author is present.
- **Saved** holds the entries you bookmarked and itinerary suggestions you accepted. Export them to a standard iCalendar file. Timed entries export as busy; drop-in windows export as free.
- **Venue map** opens the offline floor plans. Opening it from a session centers a marker on the room where SC26 supplies coordinates. Zoom and pan the floor or select another location. The off-site museum reception has its address and shuttle information.

## Program coverage

The source import reconciles the organizer’s eight daily tables, 2,436 calendar IDs and 162 live session rosters. The guide contains 2,335 dated entries spanning all six conference days and 66 room or location labels. The source archive also retains 190 job-category rows omitted from the guide. Technical exhibitor forums, panels, workshops, tutorials, SCinet presentations, papers, posters, keynotes and plenaries remain browsable. The initial technical filter can be changed to show ancillary listings. Vendor booth directories are outside the schedule.

The directory contains 3,977 official profiles with 1,061 published affiliation labels and 47 reported country or territory labels. Rankings count attributed works or speaking credits as labeled. A scheduled work can have several appearances, multiple coauthors or several topics. The app preserves distinct SC26 IDs even when profiles have the same display name.

Seven floor plans are bundled. SC26 supplies room markers for 64 of the 66 scheduled location labels. Central Concourse opens on West Level 3, and the off-site Griffin Museum opens with directions.

Sources: [SC26 program](https://sc26.conference-program.com/), [contributors](https://sc26.conference-program.com/contributors/), [official venue map](https://sc26.conference-program.com/map/), [reception details](https://sc26.supercomputing.org/attendees/receptions/). Journal records carry DOI links and bibliographic identifiers in the source data. The conference organizer and other credited institutions supply the photos and maps.

## Run or build

The complete app and conference data are included. To view the interface on a computer, open the separate SC26-Field-Guide.html download in a browser. You can also open `app/index.html` or serve the `app` folder over local HTTP. Rebuild the single-file edition with `python3 scripts/portable.py`. External source links need Internet access.

To build the APK on Linux, install Android SDK Platform 35, Android SDK Build Tools 35.0.0, a JDK with javac and keytool, bash and zip. From this directory:

```bash
export ANDROID_SDK_ROOT=/path/to/your/Android/Sdk
./android/build.sh
```

The result is `dist/SC26-Field-Guide.apk`. The build script creates a local signing key on first run. For your own signing identity, set `GUIDE_KEYSTORE` and `GUIDE_SIGN_PASSWORD`. Your rebuilt APK will carry your own signature. The delivered APK's private key is not included. No online service, backend, or runtime API key is needed.

## Verify or refresh

Run `node --test tests/*.cjs` from this directory with Node.js 20+. This checks overlap and transfer rules, keyword scoring, Chicago time, Unicode calendar export and all packaged entries. The `checks` directory contains Playwright interaction checks for a mobile viewport. To run them, install Playwright for Node and set `CHROMIUM` to a Chromium headless shell executable. For example, run `node checks/venue_ui.cjs` from this directory.

The input data is in `data/`. The app reads the joined snapshot in `app/data.js`. To regenerate that file from the included data, run `python3 scripts/build_data.py`. To retrieve a newer public snapshot, install Python 3.10+, lxml, msgpack, Pillow and curl, then run the following from this directory:

```bash
python3 scripts/import_program.py --cache .sc26-cache
curl -fsSL https://sc26.conference-program.com/contributors/ -o .sc26-cache/contributors.html
python3 scripts/import_people.py .sc26-cache/contributors.html .sc26-cache
python3 scripts/cache_portraits.py
python3 scripts/import_people.py .sc26-cache/contributors.html .sc26-cache
python3 scripts/build_data.py
python3 scripts/venue.py
```

Rebuild the APK after refreshing. Publication verification and supplementary photo credits are recorded in `scripts/tas_evidence.json` and `scripts/portrait_sources.json`. When the organizer changes its schema, review the importer’s checks before packaging a new edition.
