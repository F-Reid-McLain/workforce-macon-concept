# Tools

## `build-programs.py`: the Workforce Navigator's program catalog

Builds `content/programs.json`, which lists every program the Navigator's organizations offer, from:

| Source | How it's read |
|---|---|
| Middle Georgia State | live, from its degree table (mga.edu/degrees) |
| Mercer | live, from the API behind its Program Finder (Macon and online programs only) |
| Central Georgia Tech | `sources/cgtc-programs.txt`, transcribed from its Programs of Study PDF |
| Everyone else | `sources/manual-programs.json`, checked by hand |

Central Georgia Tech's campuses and credit hours come from its catalog: run `python3 tools/parse-cgtc-catalog.py catalog.pdf` (needs `pip install pypdf`) to refresh `sources/cgtc-catalog.json`.

**The inclusion rule: a program is listed only if it appears on an active web page from the organization that offers it.**
- Central Georgia Tech programs link to their own program page (or the division page that lists them). A program that no live CGTC page mentions is left out, and the build names it. The pages are saved to `sources/cgtc-pages.json` and used if the site is down.
- For everyone else, a program whose page is gone (404) is left out and named in the build output.

Every program keeps its `source` and the date it was `checked`. The build also checks every program link (see the inclusion rule below).

**To refresh (about once a quarter):**
1. Compare Central Georgia Tech's current Programs of Study PDF against `sources/cgtc-programs.txt` and update the list and the date at the top.
2. Re-check anything in `sources/manual-programs.json`, especially entries marked `"verify": true`.
3. Run `python3 tools/build-programs.py` from the repo root (`--no-links` skips the link check).
4. Review the diff of `content/programs.json` before committing.

Lengths and costs follow each school's published rules (for example, CGTC's "associate degrees about 2 years, diplomas about 18 months, certificates under a year" and its 2025–26 tuition of $107 per credit hour). They're typical full-time figures, not quotes.

## Map roads

- `fetch-us-routes.py` pulls the real paths of US 41, 80, 129 and 23 around Macon from OpenStreetMap into `data/us-routes-macon.geojson`, for the Jobs title slide's map. Rerun it only if the routes need refreshing: `python3 tools/fetch-us-routes.py`. Map data © OpenStreetMap contributors (ODbL), credited in the slide's source line.
- `render-story.js` makes marketing stills of the 3D commuting story (see the top of the file).
- `render-poster.js` renders the phone opening's stand-in picture of Macon-Bibb (`assets/story/opening-phone.png`), shown while the 3D starts up. Rerun it after changing the story's opening camera or lighting, and paste the CSS numbers it prints into `.ci-poster` in `css/commute-intro.css`.

## `phone-check.js`: the homepage as an iPhone sees it

Runs the homepage in WebKit (Safari's engine) with a real iPhone's visible area. The address bar and toolbar leave an iPhone 15 only 393 × 659, not its full screen. It then checks what shrinking a desktop browser misses:
- Safari-only bugs and page errors;
- sideways scrolling;
- tap targets smaller than a thumb;
- the final map's card fitting on screen;
- each title slide's words and self-drawing map;
- the key taps: pick a county, search a job (and the keyboard closing), open a donut sector, tap a plant.

It saves a screenshot of every stop to `phone-check/` (don't commit that folder).

    npm install playwright && npx playwright install webkit     (once)
    python3 -m http.server 8765
    node tools/phone-check.js                         (iPhone 15)
    node tools/phone-check.js --device "iPhone SE"     (the smallest: 320 × 568)

Run it after any change to the homepage's layout or scripts; every line should say `ok`. For load speed on a slow phone, run Lighthouse's mobile audit (`npx lighthouse <url> --form-factor=mobile`), with the Chrome flag `--use-angle=metal`. Without it, Chrome draws the 3D story in software, and the scores come out far worse than a real phone.
