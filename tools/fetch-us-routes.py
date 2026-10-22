#!/usr/bin/env python3
"""Real paths of the US routes through Macon, for the Jobs title slide's map.

Pulls US 41, 80, 129 and 23 around Macon-Bibb from OpenStreetMap (Overpass API),
joins each route's road segments into continuous lines, simplifies them for a
county-scale map and writes data/us-routes-macon.geojson.

Both directions of one-way pairs are kept (at county scale they draw as one line),
road segments tagged with the route fill holes in OpenStreetMap's route records
(US 129 north of Macon, for one), and any small breaks left (under 3 km) are bridged
to the nearest point on the route, so every route reads as continuous. Routes that
share a road (US 41 and 129 south of town, for example) overlap, as they do on the
ground.

Map data © OpenStreetMap contributors, available under the Open Database License.
Run from the repo root:  python3 tools/fetch-us-routes.py
"""
import json, math, os, subprocess, sys, time

CACHE = sys.argv[sys.argv.index('--cache') + 1] if '--cache' in sys.argv else None   # optional: keep raw downloads here

BBOX = (32.45, -84.20, 33.20, -83.10)   # south, west, north, east: what the Jobs map can show
ROUTES = ['41', '80', '129', '23']
TOLERANCE = 0.0006                       # degrees (~60 m), Douglas-Peucker
OUT = 'data/us-routes-macon.geojson'

def overpass(query):
    # via curl: the macOS system Python's SSL library can't reach the Overpass server.
    # The public server rate-limits, answering with an empty or HTML page; wait and retry.
    for attempt in range(5):
        out = subprocess.run(['curl', '-sS', '--max-time', '180', '-A', 'WorkforceMacon-site-build/1.0',
                              '--data-urlencode', 'data=' + query, 'https://overpass-api.de/api/interpreter'],
                             capture_output=True, text=True).stdout
        if out.lstrip().startswith('{'):
            return json.loads(out)
        time.sleep(15 * (attempt + 1))
    raise SystemExit('Overpass kept refusing; try again in a few minutes')

def merge(segments):
    """Join segments that share an end point into as few lines as possible."""
    segs = [list(s) for s in segments if len(s) > 1]
    lines = []
    while segs:
        line = segs.pop(0)
        grew = True
        while grew:
            grew = False
            for i, s in enumerate(segs):
                if s[0] == line[-1]: line += s[1:]
                elif s[-1] == line[-1]: line += s[::-1][1:]
                elif s[-1] == line[0]: line = s[:-1] + line
                elif s[0] == line[0]: line = s[::-1][:-1] + line
                else: continue
                segs.pop(i); grew = True; break
        lines.append(line)
    return lines

km = lambda a, b: math.hypot((a[0] - b[0]) * 93.5, (a[1] - b[1]) * 111)
def nearest_on(line, p):
    best, bd = None, 1e9
    for a, b in zip(line, line[1:]):
        dx, dy = b[0] - a[0], b[1] - a[1]
        t = max(0, min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy or 1e-12)))
        q = (a[0] + t * dx, a[1] + t * dy)
        d = km(p, q)
        if d < bd: best, bd = q, d
    return best, bd

def bridge(lines, max_km=3.0):
    """Carry each loose end to the nearest point on another piece of the route, if it's close."""
    for i, l in enumerate(lines):
        for end in (0, -1):
            others = [nearest_on(o, l[end]) for j, o in enumerate(lines) if j != i]
            if not others: continue
            q, d = min(others, key=lambda x: x[1])
            if 0.02 < d <= max_km:
                if end == 0: l.insert(0, q)
                else: l.append(q)
    return lines

def simplify(pts, tol):
    if len(pts) < 3: return pts
    a, b = pts[0], pts[-1]
    dx, dy = b[0] - a[0], b[1] - a[1]
    n = math.hypot(dx, dy) or 1e-12
    far, idx = -1, 0
    for i in range(1, len(pts) - 1):
        d = abs(dy * pts[i][0] - dx * pts[i][1] + b[0] * a[1] - b[1] * a[0]) / n
        if d > far: far, idx = d, i
    if far <= tol: return [a, b]
    return simplify(pts[:idx + 1], tol)[:-1] + simplify(pts[idx:], tol)

features = []
s, w, n, e = BBOX
for ref in ROUTES:
    q = f'''[out:json][timeout:90];
relation["type"="route"]["route"="road"]["network"="US:US"]["ref"="{ref}"]({s},{w},{n},{e})->.r;
.r out body;
way(r.r)({s},{w},{n},{e})->.rw;
way["highway"]["ref"~"US {ref}(;|$)"]({s},{w},{n},{e})->.tw;
(.rw; .tw;);
out geom;'''
    cached = CACHE and os.path.join(CACHE, f'us-{ref}.json')
    if cached and os.path.exists(cached):
        data = json.load(open(cached))
    else:
        data = overpass(q)
        if cached: os.makedirs(CACHE, exist_ok=True); json.dump(data, open(cached, 'w'))
    roles = {}
    for el in data['elements']:
        if el['type'] == 'relation':
            for m in el.get('members', []):
                if m['type'] == 'way': roles.setdefault(m['ref'], set()).add(m.get('role', ''))
    segs = [[(round(p['lon'], 6), round(p['lat'], 6)) for p in el['geometry']]
            for el in data['elements'] if el['type'] == 'way']
    length = lambda l: sum(km(l[i], l[i + 1]) for i in range(len(l) - 1))
    # drop slivers (ramps, turn lanes) under 300 m, then close the small breaks between pieces
    lines = [l for l in merge(segs) if length(l) >= 0.3]
    # simplify first, then bridge, so a join isn't undone by simplifying afterwards; a couple of
    # passes, since one bridge can bring a piece close enough to the next
    lines = [simplify(l, TOLERANCE) for l in lines]
    for _ in range(3): lines = bridge(lines)
    print(f'US-{ref}: {len(segs)} OSM ways -> {len(lines)} lines, {sum(len(l) for l in lines)} points')
    features.append({'type': 'Feature', 'properties': {'route': f'US-{ref}', 'class': 'us'},
                     'geometry': {'type': 'MultiLineString', 'coordinates': [[list(p) for p in l] for l in lines]}})
    if not (cached and os.path.exists(cached)): time.sleep(8)   # be polite to the public Overpass server

json.dump({'type': 'FeatureCollection',
           'attribution': 'Map data © OpenStreetMap contributors, ODbL. Built by tools/fetch-us-routes.py',
           'features': features}, open(OUT, 'w'), separators=(',', ':'))
print('wrote', OUT)
