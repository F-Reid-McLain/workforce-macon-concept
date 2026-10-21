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

Every program keeps its `source` and the date it was `checked`. The build also checks every program link and swaps any dead link (404) for the page it was listed on.

**To refresh (about once a quarter):**
1. Compare Central Georgia Tech's current Programs of Study PDF against `sources/cgtc-programs.txt` and update the list and the date at the top.
2. Re-check anything in `sources/manual-programs.json`, especially entries marked `"verify": true`.
3. Run `python3 tools/build-programs.py` from the repo root (`--no-links` skips the link check).
4. Review the diff of `content/programs.json` before committing.

Lengths and costs follow each school's published rules (for example, CGTC's "associate degrees about 2 years, diplomas about 18 months, certificates under a year" and its 2025–26 tuition of $107 per credit hour). They're typical full-time figures, not quotes.
