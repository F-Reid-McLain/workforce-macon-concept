#!/usr/bin/env python3
"""Real paths of the US routes through Macon, for the Jobs title slide's map.

Pulls US 41, 80, 129 and 23 around Macon-Bibb from OpenStreetMap (Overpass API),
joins each route's road segments into continuous lines, simplifies them for a
county-scale map and writes data/us-routes-macon.geojson.

Only one direction of a divided highway is kept (the relation's "backward" ways
are skipped), so roads aren't drawn twice. Routes that share a road (US 41 and 129
south of town, for example) overlap, as they do on the ground.

Map data © OpenStreetMap contributors, available under the Open Database License.
Run from the repo root:  python3 tools/fetch-us-routes.py
"""
import json, math, subprocess, time

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
way(r.r)({s},{w},{n},{e});
out geom;'''
    data = overpass(q)
    roles = {}
    for el in data['elements']:
        if el['type'] == 'relation':
            for m in el.get('members', []):
                if m['type'] == 'way': roles.setdefault(m['ref'], set()).add(m.get('role', ''))
    segs = [[(round(p['lon'], 6), round(p['lat'], 6)) for p in el['geometry']]
            for el in data['elements'] if el['type'] == 'way' and roles.get(el['id']) != {'backward'}]
    lines = [simplify(l, TOLERANCE) for l in merge(segs)]
    # drop slivers (one-way ramps and turn lanes) under half a kilometer
    km = lambda a, b: math.hypot((a[0] - b[0]) * 93.5, (a[1] - b[1]) * 111)
    lines = [l for l in lines if len(l) > 1 and sum(km(l[i], l[i + 1]) for i in range(len(l) - 1)) >= 0.5]
    print(f'US-{ref}: {len(segs)} OSM ways -> {len(lines)} lines, {sum(len(l) for l in lines)} points')
    features.append({'type': 'Feature', 'properties': {'route': f'US-{ref}', 'class': 'us'},
                     'geometry': {'type': 'MultiLineString', 'coordinates': [[list(p) for p in l] for l in lines]}})
    time.sleep(8)   # be polite to the public Overpass server

json.dump({'type': 'FeatureCollection',
           'attribution': 'Map data © OpenStreetMap contributors, ODbL. Built by tools/fetch-us-routes.py',
           'features': features}, open(OUT, 'w'), separators=(',', ':'))
print('wrote', OUT)
