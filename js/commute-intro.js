/* ===== COMMUTING INTRO — homepage =====
   A scroll story at the top of the Workforce Data page that ends as the
   page's interactive regional map, all in one deck.gl scene (no base map):

   1. The 17 counties as 3D blocks, all level at dawn.
   2. Through the day, dots (groups of commuters, LODES 2023) fly between
      Macon-Bibb and its neighbors; a county drops the moment its dots leave
      and rises when they land.
   3. After dark the camera turns overhead, the blocks flatten, and the
      counties recolor outward from Macon-Bibb into the net-commuting map,
      which then takes over: labels, stats, key, hover, highways, PNG.

   Time of day follows scroll position, smoothed so wheel ticks glide; the
   camera is keyframed by time, so nothing moves unless you scroll (apart
   from the load-in rise and a slight mouse tilt).

   Data: data/commute-region.json (county outlines + LODES flows to and from
   Macon-Bibb), data/Population By County.csv (ACS 2024), data/Net Commuting
   LODES.csv, data/major-highways.geojson. Commute timing is illustrative. */
(function () {
    'use strict';
    const section = document.getElementById('section-commute');
    if (!section || !window.deck || !window.d3) return;

    const BIBB = '13021';
    const mobile = window.innerWidth < 700;
    const reducedMotion = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
    const clamp01 = x => Math.max(0, Math.min(1, x));
    const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
    const lerp = (a, b, k) => a + (b - a) * k;
    const lerpAngle = (a, b, k) => a + ((((b - a) % 360) + 540) % 360 - 180) * k;
    const mixRGB = (a, b, k) => a.map((v, i) => Math.round(v + (b[i] - v) * k));
    const fmt = n => Math.round(n).toLocaleString();
    const fmtK = n => n >= 1000 ? (n / 1000).toFixed(n < 10000 ? 1 : 0) + 'K' : String(Math.round(n));
    const fmtTime = t => {
        const h = Math.floor(t), m = Math.round((t - h) * 4) * 15;
        const hh = (h + (m === 60 ? 1 : 0)) % 24, mm = m === 60 ? 0 : m;
        return `${hh % 12 === 0 ? 12 : hh % 12}:${String(mm).padStart(2, '0')} ${hh < 12 ? 'AM' : 'PM'}`;
    };
    const inRing = ([x, y], ring) => {
        let inside = false;
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
            const [xi, yi] = ring[i], [xj, yj] = ring[j];
            if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
        }
        return inside;
    };

    // Story colors, and the regional map's (same values the old 2D map used)
    const BLUE = [123, 143, 209], GOLD = [242, 196, 107];
    // The day's change on the blocks: Macon-Bibb's gain in see-through green; what each
    // neighbor loses as a faint red ghost of its night-time height
    const GAIN = [52, 211, 153], LOSS = [248, 113, 113];
    const PAY = [[160, 170, 190], [242, 196, 107], [45, 212, 191]];   // ≤ $1,250 · $1,251–3,333 · > $3,333 a month
    // The finished map matches the story's day: Macon-Bibb in see-through green (its gain),
    // counties that lose workers in see-through red (stronger = bigger net loss), any other
    // gaining county in a lighter green. Colors are pre-blended onto the page navy so they look
    // translucent but stay exact through the hand-off. Borders in navy so counties read as tiles.
    const NAVY = [14, 20, 32];
    const over = (c, a) => c.map((v, i) => Math.round(v * a + NAVY[i] * (1 - a)));   // c at opacity a over navy
    const MAP = { bibb: over([52, 211, 153], 0.62), bibbLine: [110, 231, 183], lossLow: over([248, 113, 113], 0.14), lossHigh: over([248, 113, 113], 0.5),
                  gainer: over([52, 211, 153], 0.4), border: NAVY };
    const HWY = {   // interstates read as primary: thick, bright, teal shield
        interstate: { order: 2, width: 3, alpha: 1, badge: [45, 212, 191], text: [10, 38, 34] },
        us:         { order: 1, width: 1.4, alpha: 0.65, badge: [26, 26, 26], text: [255, 255, 255] },
        state:      { order: 0, width: 0.75, alpha: 0.4, badge: [26, 26, 26], text: [255, 255, 255] },
    };

    // Sticky stage sits just under the fixed site header
    const header = document.querySelector('.main-header');
    const setTop = () => section.style.setProperty('--ci-top', (header ? header.offsetHeight : 0) + 'px');
    setTop();

    Promise.all([
        d3.json('data/commute-region.json'), d3.csv('data/Population By County.csv'),
        d3.csv('data/Net Commuting LODES.csv'), d3.json('data/major-highways.geojson').catch(() => null),
    ]).then(([region, popRows, netRows, highways]) => {
        const f5 = v => String(v).padStart(5, '0');
        // ----- Counties -----
        const pop = new Map(popRows.map(r => [f5(r.FIPS), +String(r.Population).replace(/,/g, '')]));
        const net = new Map(netRows.map(r => [f5(r.FIPS), +r.NetCommuting]));
        const counties = region.counties.filter(c => pop.has(c.fips));
        const rings = counties.flatMap(c => c.rings.map(ring => ({ fips: c.fips, ring })));
        const nameOf = new Map(counties.map(c => [c.fips, c.fips === BIBB ? 'Macon-Bibb' : c.name]));
        // Flat centroid of each county's largest ring
        const center = new Map(counties.map(c => [c.fips, d3.polygonCentroid(d3.greatest(c.rings, r => Math.abs(d3.polygonArea(r))))]));

        // ----- Commuters: each dot is a group of ~N people with its own times -----
        // Departures follow an illustrative morning curve (6:10–10 AM), returns 4:30–6:30 PM.
        const DEPART = [[6.15, 6.6, 6], [6.6, 7.1, 14], [7.1, 7.6, 22], [7.6, 8.1, 24], [8.1, 8.6, 16], [8.6, 9.2, 11], [9.2, 10, 7]];
        const depTotal = d3.sum(DEPART, d => d[2]);
        const departAt = q => {   // inverse of the cumulative curve
            let acc = 0;
            for (const [a, b, w] of DEPART) { const s = w / depTotal; if (q <= acc + s) return a + (b - a) * (q - acc) / s; acc += s; }
            return 10;
        };
        const returnAt = q => 16.5 + 2 * (Math.acos(1 - 2 * q) / Math.PI);   // everyone is home by 7 PM
        const TRAVEL = 0.5;
        // Commuting with everywhere else (LODES county totals), drawn as dots to and from the edge of
        // the map: all of Macon-Bibb's, and each neighbor's net exchange with places other than
        // Macon-Bibb. With these, every county's daytime change equals its LODES net (the map's figure).
        const EDGE = 'edge';
        const edgeFlows = Object.entries(region.elsewhere || {}).filter(([fips]) => pop.has(fips)).flatMap(([fips, e]) => {
            if (fips === BIBB) return [{ from: EDGE, to: fips, jobs: e.in }, { from: fips, to: EDGE, jobs: e.out }];
            const net = e.in - e.out;
            return net > 0 ? [{ from: EDGE, to: fips, jobs: net }] : net < 0 ? [{ from: fips, to: EDGE, jobs: -net }] : [];
        });
        const allFlows = region.flows.concat(edgeFlows);
        const PER_DOT = d3.sum(allFlows, f => f.jobs) / (mobile ? 260 : 480);
        let seed = 3; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
        // Each dot also carries a pay band (LODES earnings), split in proportion to its flow's mix
        const bandAt = (pay, q) => { const tot = d3.sum(pay); let acc = 0; for (let b = 0; b < pay.length; b++) { acc += pay[b] / tot; if (q < acc) return b; } return pay.length - 1; };
        const commuters = allFlows.flatMap(f => {
            const n = Math.max(1, Math.round(f.jobs / PER_DOT));
            return d3.range(n).map(i => {
                const t0 = departAt((i + rnd()) / n);
                const j = () => (rnd() - 0.5) * 0.06;
                return { from: f.from, to: f.to, people: f.jobs / n, t0, t1: Math.max(t0 + TRAVEL + 1, returnAt(rnd())), a: [j(), j()], b: [j(), j()],
                         band: f.pay ? bandAt(f.pay, (i + 0.5) / n) : -1, edge: f.from === EDGE || f.to === EDGE };
            });
        });
        function rawPeople(h) {
            const m = new Map(pop);
            commuters.forEach(d => {
                if (d.from !== EDGE && h >= d.t0 && h < d.t1 + TRAVEL) m.set(d.from, m.get(d.from) - d.people);   // left home
                if (d.to !== EDGE && h >= d.t0 + TRAVEL && h < d.t1) m.set(d.to, m.get(d.to) + d.people);        // at work
            });
            return m;
        }
        // Every neighbor loses workers on net (LODES), but dots in and out of it are timed
        // independently, so early arrivals could briefly lift it above its residents. Hold it at
        // or below its resident count; by midday this never binds.
        const capAtHome = new Set(counties.filter(c => c.fips !== BIBB).map(c => c.fips));
        let cache = { h: null, m: null };
        function peopleNow(h) {
            if (cache.h === h) return cache.m;
            const m = rawPeople(h);
            capAtHome.forEach(f => m.set(f, Math.min(m.get(f), pop.get(f))));
            cache = { h, m };
            return m;
        }
        const share = (fips, h) => peopleNow(h).get(fips) / pop.get(fips);
        // Blocks show change, not size: all start level; change drawn 2.5× (labels keep the true %)
        const BLOCK_H = 12000, EXAG = 2.5, ARC = 6000;
        const heightShare = (fips, h) => Math.max(0.08, 1 + (share(fips, h) - 1) * EXAG);

        // ----- Story numbers -----
        const inFromRegion = d3.sum(region.flows.filter(f => f.to === BIBB), f => f.jobs);
        const bibbDay = peopleNow(12.5).get(BIBB), bibbPop = pop.get(BIBB);
        const topSources = region.flows.filter(f => f.to === BIBB).sort((a, b) => b.jobs - a.jobs).slice(0, 3).map(f => nameOf.get(f.from));
        const regionPop = d3.sum(counties, c => pop.get(c.fips));
        const values = {
            regionPop: fmt(regionPop),
            inFromRegion: fmt(inFromRegion),
            farIn: fmt(Math.round(((region.elsewhere || {})[BIBB] || { in: 0 }).in / 100) * 100),
            perDot: '~' + fmt(Math.round(PER_DOT / 10) * 10),
            bibbDay: fmt(Math.round(bibbDay / 100) * 100),
            bibbPct: '+' + Math.round(100 * (bibbDay - bibbPop) / bibbPop) + '%',
            oneIn: '1 in ' + Math.round(region.bibbJobs / inFromRegion),
            topSources: topSources.slice(0, -1).join(', ') + ' and ' + topSources[topSources.length - 1],
            bibbNet: fmt(net.get(BIBB) || 0),
            statRegion: fmtK(regionPop), statBibb: fmtK(bibbPop),
            neighborPop: fmt(regionPop - bibbPop),
            payIn: Math.round(100 * d3.sum(region.flows.filter(f => f.to === BIBB), f => f.pay[2]) / inFromRegion) + '%',
            payLocal: Math.round(100 * region.localPay[2] / d3.sum(region.localPay)) + '%',
        };
        section.querySelectorAll('[data-ci]').forEach(el => { if (values[el.dataset.ci] !== undefined) el.textContent = values[el.dataset.ci]; });

        // Each dot's start and end points (county center plus a little jitter), computed once
        // Dots from or to "elsewhere" start or end beyond the region: from every direction for
        // Macon-Bibb, and outward past each neighbor for its exchange with the wider world
        const allPtsR = rings.flatMap(r => r.ring);
        const [ex0, ex1] = d3.extent(allPtsR, p => p[0]), [ey0, ey1] = d3.extent(allPtsR, p => p[1]);
        const rc = [(ex0 + ex1) / 2, (ey0 + ey1) / 2], rx = (ex1 - ex0) * 0.78, ry = (ey1 - ey0) * 0.78;
        const edgePoint = d => {
            const home = d.from === EDGE ? d.to : d.from, c = center.get(home);
            const ang = home === BIBB ? rnd() * 2 * Math.PI : Math.atan2(c[1] - rc[1], c[0] - rc[0]) + (rnd() - 0.5);
            return [rc[0] + Math.cos(ang) * rx, rc[1] + Math.sin(ang) * ry];
        };
        commuters.forEach(d => {
            const a = d.from === EDGE ? edgePoint(d) : center.get(d.from).map((v, i) => v + d.a[i]);
            const b = d.to === EDGE ? edgePoint(d) : center.get(d.to).map((v, i) => v + d.b[i]);
            d.ax = a[0]; d.ay = a[1]; d.bx = b[0]; d.by = b[1];
        });

        // ----- Opening: Macon-Bibb alone, then its neighbors rise in, largest commuter flow first -----
        const arrivalOrder = region.flows.filter(f => f.to === BIBB).sort((a, b) => b.jobs - a.jobs).map(f => f.from);
        const arriveAt = (fips, h) => {
            if (fips === BIBB) return 1;
            const i = Math.max(0, arrivalOrder.indexOf(fips));
            return smooth(5.05 + 0.05 * i, 5.3 + 0.05 * i, h);
        };

        // ----- The regional map's colors (net commuting, LODES) -----
        const isOtherGainer = fips => fips !== BIBB && (net.get(fips) || 0) > 0;
        const maxLoss = Math.max(1, ...counties.filter(c => c.fips !== BIBB).map(c => -(net.get(c.fips) || 0)));
        const mapColor = new Map(counties.map(c => {
            if (c.fips === BIBB) return [c.fips, MAP.bibb];
            if (isOtherGainer(c.fips)) return [c.fips, MAP.gainer];
            return [c.fips, mixRGB(MAP.lossLow, MAP.lossHigh, 0.15 + 0.85 * Math.sqrt(clamp01(-(net.get(c.fips) || 0) / maxLoss)))];
        }));
        if (!counties.some(c => isOtherGainer(c.fips))) section.querySelector('.ci-key__gainer')?.remove();
        // The recolor ripples outward from Macon-Bibb: each county's delay grows with distance
        const bc = center.get(BIBB);
        const dist = new Map(counties.map(c => { const p = center.get(c.fips); return [c.fips, Math.hypot(p[0] - bc[0], p[1] - bc[1])]; }));
        const maxDist = Math.max(...dist.values());
        const ripple = (fips, m) => { const d = dist.get(fips) / maxDist; return smooth(0.2 + 0.3 * d, 0.45 + 0.3 * d, m); };

        // ----- Highways (shown on the finished map, on click) -----
        const insideRegion = pt => rings.some(r => inRing(pt, r.ring));
        const hwyFeatures = highways ? highways.features.filter(f => HWY[f.properties.class]) : [];
        const hwyPaths = hwyFeatures.flatMap(f => (f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates)
            .map(path => ({ cls: f.properties.class, path }))).sort((a, b) => HWY[a.cls].order - HWY[b.cls].order);
        // One badge per route, at a point of the route that's inside the region
        const hwyLabelsGeo = Array.from(d3.group(hwyFeatures.filter(f => f.properties.route), f => f.properties.route), ([route, feats]) => {
            const pts = feats.flatMap(f => f.geometry.type === 'LineString' ? f.geometry.coordinates : f.geometry.coordinates.flat()).filter(insideRegion);
            return pts.length ? { route, cls: feats[0].properties.class, at: pts[Math.floor(pts.length / 2)] } : null;
        }).filter(Boolean).sort((a, b) => HWY[a.cls].order - HWY[b.cls].order);

        // ----- Stage -----
        const stage = document.getElementById('ci-stage');
        const mapEl = document.getElementById('ci-map');
        const tip = document.getElementById('ci-tip');
        const timePill = section.querySelector('.ci-time');
        const timeLabel = document.getElementById('ci-time-label');
        const timeIcon = document.getElementById('ci-time-icon');
        const hwyBtn = document.getElementById('ci-hwy');
        const pngBtn = document.getElementById('ci-png');
        const labelFont = getComputedStyle(document.querySelector('h2') || document.body).fontFamily;

        // Light through the day: moonlight, dawn, midday, evening. On the finished map it goes
        // flat and neutral, so counties show their map colors exactly.
        const LIGHT = [   // hour, ambient color, ambient, sun color, sun, sky glow
            [0,    [160, 178, 232], 0.5,  [180, 198, 255], 1.0,  [40, 60, 110]],
            [5.2,  [160, 178, 232], 0.5,  [180, 198, 255], 1.0,  [40, 60, 110]],
            [6.8,  [255, 230, 212], 0.55, [255, 204, 162], 1.5,  [150, 95, 95]],
            [9,    [255, 255, 255], 0.5,  [255, 246, 228], 1.7,  [80, 120, 150]],
            [16,   [255, 255, 255], 0.5,  [255, 246, 228], 1.7,  [80, 120, 150]],
            [18.5, [255, 214, 190], 0.46, [255, 172, 118], 1.4,  [160, 90, 70]],
            [20.5, [160, 178, 232], 0.5,  [180, 198, 255], 1.0,  [40, 60, 110]],
            [24,   [160, 178, 232], 0.5,  [180, 198, 255], 1.0,  [40, 60, 110]],
        ];
        const NEUTRAL_SKY = [62, 72, 88];
        const ambient = new deck.AmbientLight({ color: [255, 255, 255], intensity: 0.5 });
        const sun = new deck.DirectionalLight({ color: [255, 246, 228], intensity: 1.7, direction: [-0.75, -0.37, -0.55] });
        function setLight(h, flat) {
            const i = Math.max(0, LIGHT.findIndex(k => k[0] > h) - 1), a = LIGHT[i], b = LIGHT[i + 1] || a;
            const k = smooth(a[0], b[0], h);
            ambient.color = mixRGB(mixRGB(a[1], b[1], k), [255, 255, 255], flat);
            ambient.intensity = lerp(lerp(a[2], b[2], k), 1, flat);
            sun.color = mixRGB(a[3], b[3], k);
            sun.intensity = lerp(a[4], b[4], k) * (1 - flat);
            const dir = [-3 + 6 * smooth(6.5, 19, h), -1.5, -2.2], len = Math.hypot(...dir);
            sun.direction = dir.map(v => v / len);   // deck.gl only normalizes this in its constructor
            section.style.setProperty('--ci-sky', mixRGB(mixRGB(a[5], b[5], k), NEUTRAL_SKY, flat).join(', '));
        }

        // ----- Camera: keyframed by time of day, so it only moves as you scroll -----
        const V = (lon, lat, zoom, pitch, bearing) => ({ longitude: lon, latitude: lat, zoom: zoom - (mobile ? 0.9 : 0), pitch, bearing });
        const CAMERA = [
            [5,     V(bc[0], bc[1] + 0.2, 9.55, 58, -10)],   // welcome: Macon-Bibb alone, low in the frame under the headline
            [6,     V(-83.62, 32.62, 8.3, 54, 0)],     // its neighbors have arrived; everyone home
            [7.5,   V(-83.63, 32.68, 8.45, 60, -8)],   // rush hour
            [8.5,   V(-83.63, 32.68, 8.5, 60, -2)],    // who's coming in
            [12.5,  V(-83.62, 32.68, 8.4, 60, 6)],     // the workday
            [17.75, V(-83.62, 32.64, 8.3, 56, 0)],     // heading home
        ];
        function storyCamera(h) {
            if (h <= CAMERA[0][0]) return CAMERA[0][1];
            for (let i = 1; i < CAMERA.length; i++) {
                if (h <= CAMERA[i][0]) {
                    const [t0, a] = CAMERA[i - 1], [t1, b] = CAMERA[i], k = smooth(t0, t1, h);
                    return { longitude: lerp(a.longitude, b.longitude, k), latitude: lerp(a.latitude, b.latitude, k), zoom: lerp(a.zoom, b.zoom, k),
                             pitch: lerp(a.pitch, b.pitch, k), bearing: lerpAngle(a.bearing, b.bearing, k) };
                }
            }
            return CAMERA[CAMERA.length - 1][1];
        }
        // The finished map: straight overhead, fitted to the stage (room for the card on wide screens)
        const allPts = rings.flatMap(r => r.ring);
        const bounds = [[d3.min(allPts, p => p[0]), d3.min(allPts, p => p[1])], [d3.max(allPts, p => p[0]), d3.max(allPts, p => p[1])]];
        let flatView = null;
        function computeFlat() {
            const W = stage.clientWidth, H = stage.clientHeight;
            const padLeft = W > +(stage.dataset.padBreakpoint || Infinity) ? +(stage.dataset.padLeft || 0) : 0;
            const vp = new deck.WebMercatorViewport({ width: W, height: H })
                .fitBounds(bounds, { padding: { top: 56, bottom: 40, left: 24 + padLeft, right: 24 } });
            flatView = { longitude: vp.longitude, latitude: vp.latitude, zoom: vp.zoom, pitch: 0, bearing: 0 };
            // Highway badges that land on top of each other get pushed apart (in screen space);
            // an interstate keeps its spot and the other badge moves
            const fv = new deck.WebMercatorViewport({ width: W, height: H, ...flatView });
            const pts = hwyLabelsGeo.map(l => ({ ...l, xy: fv.project(l.at) }));
            const MIN = 48;
            for (let pass = 0; pass < 4; pass++) {
                for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
                    const a = pts[i], b = pts[j], dx = b.xy[0] - a.xy[0], dy = b.xy[1] - a.xy[1], d = Math.hypot(dx, dy) || 0.001;
                    if (d >= MIN) continue;
                    const need = MIN - d, ux = dx / d, uy = dy / d;
                    const aPin = a.cls === 'interstate' && b.cls !== 'interstate', bPin = b.cls === 'interstate' && a.cls !== 'interstate';
                    if (aPin) b.xy = [b.xy[0] + ux * need, b.xy[1] + uy * need];
                    else if (bPin) a.xy = [a.xy[0] - ux * need, a.xy[1] - uy * need];
                    else { a.xy = [a.xy[0] - ux * need / 2, a.xy[1] - uy * need / 2]; b.xy = [b.xy[0] + ux * need / 2, b.xy[1] + uy * need / 2]; }
                }
            }
            pts.forEach((p, i) => { const el = hwyEls[i]; el.style.left = p.xy[0] + 'px'; el.style.top = p.xy[1] + 'px'; });
            counties.forEach((c, i) => { const xy = fv.project(center.get(c.fips)); countyEls[i].style.left = xy[0] + 'px'; countyEls[i].style.top = xy[1] + 'px'; });
        }
        // The finished map's labels are plain HTML pinned over the canvas (crisper than
        // canvas text at these small sizes); the camera is static by the time they show
        const labelsEl = document.createElement('div');
        labelsEl.className = 'ci-maplabels';
        labelsEl.setAttribute('aria-hidden', 'true');
        const countyEls = counties.map(c => {
            const el = document.createElement('div');
            const v = net.get(c.fips) || 0;
            el.className = 'ci-maplabel' + (c.fips === BIBB ? ' ci-maplabel--bibb' : '') + (isOtherGainer(c.fips) ? ' ci-maplabel--pale' : '');
            el.innerHTML = `<b>${nameOf.get(c.fips)}</b><span>${fmtK(pop.get(c.fips))}</span><span>${c.fips === BIBB ? `+${fmt(v)} net` : `net: ${fmt(v)}`}</span>`;
            labelsEl.appendChild(el);
            return el;
        });
        const hwyLayerEl = document.createElement('div');
        hwyLayerEl.className = 'ci-hwylabels';
        hwyLayerEl.setAttribute('aria-hidden', 'true');
        const hwyEls = hwyLabelsGeo.map(l => {
            const el = document.createElement('span');
            el.className = 'ci-hwybadge ci-hwybadge--' + l.cls;
            el.textContent = l.route;
            hwyLayerEl.appendChild(el);
            return el;
        });
        mapEl.after(hwyLayerEl, labelsEl);
        computeFlat();

        // ----- Hand-off: the story becomes the map, staged across the evening -----
        const morphAt = h => clamp01((h - 18.75) / 2);   // 6:45 PM → 8:45 PM of story time
        const stagesOf = m => ({
            settle: smooth(0, 0.45, m),     // camera turns overhead while the blocks lower
            light: smooth(0.2, 0.7, m),     // light goes flat and neutral (with the color ripple)
            storyLabels: 1 - smooth(0.3, 0.5, m),
            mapLabels: smooth(0.6, 0.85, m),
            overlays: smooth(0.75, 1, m),   // stats, key, highways and PNG buttons
            live: m > 0.97,                 // the map takes over hover and clicks
        });

        // ----- State -----
        let target = 5, hour = 5, step = 0, rise = reducedMotion ? 1 : 0;
        let hwyOn = false, hwy = 0;
        const tilt = { x: 0, y: 0, tx: 0, ty: 0 };
        if (!reducedMotion && matchMedia('(hover: hover)').matches) {
            stage.addEventListener('mousemove', e => {
                const r = stage.getBoundingClientRect();
                tilt.tx = ((e.clientX - r.left) / r.width) * 2 - 1; tilt.ty = ((e.clientY - r.top) / r.height) * 2 - 1;
                wake();
            });
            stage.addEventListener('mouseleave', () => { tilt.tx = 0; tilt.ty = 0; wake(); });
        }

        function showTip(info) {
            const fips = info.object && info.object.fips;
            if (!fips || rise < 0.9) { tip.style.display = 'none'; return; }
            const m = morphAt(hour);
            if (m > 0.05 && m < 0.97) { tip.style.display = 'none'; return; }   // mid-transition: no tooltip
            if (m >= 0.97) {
                const v = net.get(fips) || 0, col = v > 0 ? '#34d399' : '#f87171';
                tip.innerHTML = `<b>${fips === BIBB ? 'Bibb' : nameOf.get(fips)} County</b>Population: <span>${fmt(pop.get(fips))}</span>` +
                    `<br>Net commuting balance: <span style="color:${col}">${v > 0 ? '+' : ''}${fmt(v)}</span>`;
            } else {
                const now = peopleNow(hour).get(fips), d = now - pop.get(fips);
                tip.innerHTML = `<b>${nameOf.get(fips)}</b>Residents: <span>${fmt(pop.get(fips))}</span>` +
                    (Math.abs(d) >= 1 ? `<br>Here right now: <span>${fmt(now)}</span> (${d > 0 ? '+' : ''}${fmt(d)})` : '');
            }
            tip.style.left = (info.x + 14) + 'px'; tip.style.top = (info.y + 12) + 'px'; tip.style.display = 'block';
        }
        const toggleHighways = () => { hwyOn = !hwyOn; hwyBtn.setAttribute('aria-pressed', String(hwyOn)); hwyBtn.classList.add('is-used'); wake(); };
        hwyBtn.addEventListener('click', toggleHighways);

        const deckgl = new deck.Deck({
            parent: mapEl, views: new deck.MapView({ repeat: false }), viewState: storyCamera(5), controller: false,
            useDevicePixels: Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2),
            effects: [new deck.LightingEffect({ ambient, sun })],
            onHover: showTip,
            onClick: info => { if (stagesOf(morphAt(hour)).live && info.object) toggleHighways(); },
            getCursor: ({ isHovering }) => isHovering && stagesOf(morphAt(hour)).live ? 'pointer' : 'default',
        });
        const MASK = new deck.MaskExtension();

        // ----- Layers -----
        const lift = (ring, z) => ring.map(([x, y]) => [x, y, z]);
        const translateZ = z => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, z, 1];
        function layers() {
            const m = morphAt(hour), S = stagesOf(m);
            const p = rise * (1 - S.settle);   // blocks lower to flat as the camera turns overhead
            const k = fips => heightShare(fips, hour);
            const arr = fips => arriveAt(fips, hour);
            const homeTop = fips => arr(fips) * p * BLOCK_H * Math.min(1, k(fips)), fullTop = fips => arr(fips) * p * BLOCK_H * k(fips);
            const material = { ambient: lerp(0.6, 1, S.light), diffuse: 0.42 * (1 - S.light), shininess: 8, specularColor: [40, 40, 40].map(v => v * (1 - S.light)) };
            const geoKey = Math.round(p * 1000) + '|' + hour.toFixed(3);
            const colorKey = m.toFixed(3);
            const fill = (fips, story) => m > 0 ? mixRGB(story, mapColor.get(fips), ripple(fips, m)) : story;
            const out = [
                new deck.SolidPolygonLayer({ id: 'mask-region', data: rings, getPolygon: r => r.ring, operation: 'mask' }),
                new deck.SolidPolygonLayer({ id: 'home', data: rings, extruded: true, pickable: true, material, getPolygon: r => r.ring,
                    getElevation: r => homeTop(r.fips), getFillColor: r => fill(r.fips, BLUE).concat(Math.round(255 * smooth(0, 0.4, arr(r.fips)))),
                    updateTriggers: { getElevation: geoKey, getFillColor: colorKey + '|' + (hour < 6 ? hour.toFixed(3) : 'in') } }),
            ];
            // Green: the extra people who came in to work, stacked on each gaining county.
            // Red ghost: the part of a county's night-time height that has left for work.
            // One small layer per county, lifted with modelMatrix so its outline is never re-tessellated;
            // both are see-through, so they don't write depth (the blocks beneath stay visible).
            const seeThrough = { depthWriteEnabled: false };
            rings.forEach((r, i) => {
                const lo = homeTop(r.fips), hi = fullTop(r.fips), night = arr(r.fips) * p * BLOCK_H;
                if (hi - lo >= 1) out.push(new deck.SolidPolygonLayer({ id: 'gain-' + i, data: [r], extruded: true, pickable: true, material,
                    getPolygon: d => d.ring, modelMatrix: translateZ(lo), getElevation: hi - lo, getFillColor: GAIN.concat(150),
                    parameters: seeThrough }));
                if (night - hi >= 1) out.push(new deck.SolidPolygonLayer({ id: 'loss-' + i, data: [r], extruded: true, pickable: false, material,
                    getPolygon: d => d.ring, modelMatrix: translateZ(hi), getElevation: night - hi, getFillColor: LOSS.concat(42),
                    parameters: seeThrough }));
            });
            out.push(
                // County edges: story outlines on the block tops, ending as the map's borders
                new deck.PathLayer({ id: 'edges', data: rings, getPath: r => lift(r.ring, fullTop(r.fips) + 20), widthUnits: 'pixels',
                    getWidth: r => r.fips === BIBB ? 2.5 : 1,
                    getColor: r => r.fips === BIBB ? mixRGB([180, 140, 70], MAP.bibbLine, S.light).concat(230)
                        : mixRGB([255, 255, 255], MAP.border, S.light).concat(lerp(120, 255, S.light) * arr(r.fips)),
                    updateTriggers: { getPath: geoKey, getColor: colorKey + '|' + (hour < 6 ? hour.toFixed(3) : 'in') } }),
                // Night-time height of counties that emptied out
                new deck.PathLayer({ id: 'night', data: rings.filter(r => k(r.fips) < 0.998), visible: S.settle < 0.99, opacity: 1 - S.settle,
                    getPath: r => lift(r.ring, p * BLOCK_H), widthUnits: 'pixels', getWidth: 1.2, getColor: LOSS.concat(150), updateTriggers: { getPath: geoKey } }),
            );
            // Commuters on the road right now, each trailing a short comet tail
            const onRoad = (d, h) => (h > d.t0 && h < d.t0 + TRAVEL) || (h > d.t1 && h < d.t1 + TRAVEL);
            const tops = new Map(counties.map(c => [c.fips, fullTop(c.fips)]));   // once per frame, not per dot
            const dotPosAt = (d, h) => {
                const u = clamp01(h < d.t1 ? (h - d.t0) / TRAVEL : 1 - (h - d.t1) / TRAVEL);   // 0 = home, 1 = work
                const za = d.from === EDGE ? 0 : tops.get(d.from), zb = d.to === EDGE ? 0 : tops.get(d.to);
                return [d.ax + (d.bx - d.ax) * u, d.ay + (d.by - d.ay) * u, za + (zb - za) * u + Math.sin(Math.PI * u) * ARC];
            };
            // "Who's coming in": from 8:10 AM the dots take their pay colors and keep them
            const payMix = smooth(8.1, 8.45, hour);
            // (dots from farther away have no pay data, so they keep their in/out color)
            const dotColor = d => { const c = d.to === BIBB ? GOLD : [255, 255, 255]; return d.band < 0 ? c : mixRGB(c, PAY[d.band], payMix); };
            // Farther-away dots are a little smaller and fainter: LODES sometimes places jobs at a
            // company's reporting address, so long-distance flows are less certain than local ones
            const dotAlpha = d => d.edge ? 165 : 245, dotSize = d => (mobile ? 2.4 : 3) * (d.edge ? 0.8 : 1);
            const moving = m < 0.15 ? commuters.filter(d => onRoad(d, hour)) : [];
            if (moving.length && rise > 0.9) {
                const TRAIL = 4, STEP = 0.014;
                const trail = moving.flatMap(d => d3.range(1, TRAIL + 1).filter(k => onRoad(d, hour - k * STEP)).map(k => ({ d, k })));
                out.push(
                    new deck.ScatterplotLayer({ id: 'trails', data: trail, getPosition: t => dotPosAt(t.d, hour - t.k * STEP),
                        getFillColor: t => dotColor(t.d).concat(Math.round((t.d.edge ? 120 : 200) * (1 - t.k / (TRAIL + 1)))),
                        radiusUnits: 'pixels', getRadius: t => dotSize(t.d) * 0.9 * (1 - 0.1 * t.k), billboard: true,
                        parameters: { depthCompare: 'always' }, updateTriggers: { getPosition: geoKey, getFillColor: payMix } }),
                    new deck.ScatterplotLayer({ id: 'dots', data: moving, getPosition: d => dotPosAt(d, hour),
                        getFillColor: d => dotColor(d).concat(dotAlpha(d)),
                        stroked: true, getLineColor: [40, 35, 25, 200], lineWidthUnits: 'pixels', getLineWidth: 0.6,
                        radiusUnits: 'pixels', getRadius: dotSize, billboard: true,
                        parameters: { depthCompare: 'always' }, updateTriggers: { getPosition: geoKey, getFillColor: payMix } }),
                );
            }
            // Story labels: county name and its change right now (text rebuilt only when a figure changes)
            // Built from the first frame (names start fully transparent), so the label font
            // texture is made during the welcome screen rather than mid-scroll
            if (S.storyLabels > 0.01) {
                const pct = c => Math.round((share(c.fips, hour) - 1) * 100);
                const textKey = counties.map(pct).join();
                // One shared layer. Names fade in with their counties; the dark outline (a single
                // value for the whole layer) waits until everyone has arrived, so no outline shows
                // ahead of a county that isn't there yet.
                const nameAlpha = c => c.fips === BIBB ? smooth(5.15, 5.5, hour) : smooth(0.5, 1, arr(c.fips));
                out.push(new deck.TextLayer({ id: 'names', data: counties, opacity: S.storyLabels,
                    getPosition: d => { const ctr = center.get(d.fips); return [ctr[0], ctr[1], fullTop(d.fips) + 900]; },
                    getText: d => pct(d) !== 0 ? `${nameOf.get(d.fips)}\n${pct(d) > 0 ? '+' : ''}${pct(d)}%` : nameOf.get(d.fips),
                    getSize: d => d.fips === BIBB ? (mobile ? 14 : 17) : (mobile ? 10 : 12), lineHeight: 1.1,
                    getColor: d => (d.fips === BIBB ? [242, 196, 107] : [245, 240, 228]).concat(Math.round(255 * nameAlpha(d))),
                    fontFamily: labelFont, fontWeight: 600, billboard: true, fontSettings: { sdf: true },
                    outlineWidth: 4 * smooth(5.8, 6.0, hour), outlineColor: [16, 23, 26, 230],
                    parameters: { depthCompare: 'always', depthWriteEnabled: false },
                    updateTriggers: { getPosition: geoKey, getText: textKey, getColor: hour < 6 ? hour.toFixed(3) : 'in' } }));
            }
            // Highways (click the finished map), clipped to the region; badges stay whole
            if (hwy > 0.01 && hwyPaths.length) out.push(
                new deck.PathLayer({ id: 'highways', data: hwyPaths, opacity: hwy, getPath: d => d.path, widthUnits: 'pixels',
                    getWidth: d => HWY[d.cls].width, getColor: d => [255, 255, 255, Math.round(255 * HWY[d.cls].alpha)],
                    capRounded: true, jointRounded: true, extensions: [MASK], maskId: 'mask-region' }),
            );
            return out;
        }

        // ----- Live pulse: Macon-Bibb's head count through the day -----
        const pulseEl = section.querySelector('.ci-pulse');
        const pulseNum = document.getElementById('ci-pulse-num');
        const pulseChg = document.getElementById('ci-pulse-chg');
        const PW = 260, PH = 48, H0 = 5, H1 = 21;
        const series = d3.range(H0, H1 + 0.001, 0.1).map(h => [h, peopleNow(h).get(BIBB)]);
        const yMax = d3.max(series, d => d[1]), yMin = bibbPop - (yMax - bibbPop) * 0.25;
        const px = h => (h - H0) / (H1 - H0) * PW, py = v => PH - 4 - (v - yMin) / (yMax - yMin) * (PH - 8);
        const line = d3.line(d => px(d[0]), d => py(d[1]))(series);
        const area = d3.area(d => px(d[0]), () => py(bibbPop), d => py(Math.max(bibbPop, d[1])))(series);
        section.querySelector('.ci-pulse__chart').innerHTML =
            `<path d="${area}" fill="rgba(52,211,153,0.28)"/><line x1="0" x2="${PW}" y1="${py(bibbPop)}" y2="${py(bibbPop)}" stroke="rgba(255,255,255,0.35)" stroke-dasharray="3 3"/>` +
            `<path d="${line}" fill="none" stroke="#f2c46b" stroke-width="1.6"/>`;
        // The playhead is an HTML dot moved with a transform (compositor-only, no SVG repaint)
        const pulseDot = section.querySelector('.ci-pulse__dot');
        let lastPulse = '';
        function updatePulse() {
            const now = peopleNow(hour).get(BIBB), d = (now - bibbPop) / bibbPop;
            const hh = Math.min(H1, Math.max(H0, hour));
            pulseDot.style.transform = `translate(${px(hh).toFixed(1)}px, ${py(now).toFixed(1)}px)`;
            // Text only changes when the count moves by 50 or more (fewer repaints while scrolling)
            const key = String(Math.round(now / 50));
            if (key === lastPulse) return;
            lastPulse = key;
            pulseNum.textContent = fmt(Math.round(now / 50) * 50);
            pulseChg.textContent = Math.abs(d) < 0.005 ? 'all residents home' : `${d > 0 ? '+' : '−'}${Math.abs(Math.round(d * 100))}% vs. residents`;
            pulseChg.classList.toggle('is-up', d >= 0.005);
        }

        let lastScene = '';
        function render() {
            const m = morphAt(hour), S = stagesOf(m);
            const sceneKey = [hour.toFixed(4), rise.toFixed(3), hwy.toFixed(3), step].join();
            if (sceneKey !== lastScene) {
                lastScene = sceneKey;
                setLight(hour, S.light);
                deckgl.setProps({ layers: layers() });
            }
            timeLabel.textContent = fmtTime(Math.min(hour, 20.75));
            timeIcon.textContent = hour >= 6.5 && hour < 19 ? '☀' : '☾';
            timePill.style.opacity = String(1 - smooth(0.4, 0.7, m));
            section.style.setProperty('--ci-map', S.overlays.toFixed(3));
            section.style.setProperty('--ci-maplabels', S.mapLabels.toFixed(3));
            section.style.setProperty('--ci-hwy', hwy.toFixed(3));
            section.style.setProperty('--ci-settle', S.settle.toFixed(3));
            section.style.setProperty('--ci-bg', smooth(0.5, 0.9, m).toFixed(3));   // stage fades into the page as the map forms
            section.style.setProperty('--ci-pulse', (smooth(5.6, 5.95, hour) * (1 - smooth(18.9, 19.5, hour))).toFixed(3));
            updatePulse();
            section.classList.toggle('is-map', S.live);
            if (m > 0.05 && m < 0.97) tip.style.display = 'none';
        }

        // ----- Scroll → target time; the shown time glides after it -----
        const steps = Array.from(section.querySelectorAll('.ci-step'));
        let anchors = [];
        const measure = () => {
            setTop();
            anchors = steps.map(el => { const r = el.getBoundingClientRect(); return { t: +el.dataset.time, y: r.top + scrollY + r.height / 2 - innerHeight / 2, el }; });
        };
        function onScroll() {
            const y = scrollY;
            let t = anchors[0].t;
            if (y > anchors[0].y) {
                t = anchors[anchors.length - 1].t;
                for (let i = 1; i < anchors.length; i++) if (y <= anchors[i].y) { const a = anchors[i - 1], b = anchors[i]; t = a.t + (b.t - a.t) * (y - a.y) / (b.y - a.y); break; }
            }
            let idx = 0;
            anchors.forEach((a, i) => { if (y >= a.y - innerHeight * 0.35) idx = i; });
            anchors.forEach((a, i) => a.el.classList.toggle('is-active', i === idx));
            target = t; step = idx;
            // A big jump (link, scrollbar drag) lands directly instead of fast-forwarding the day
            if (reducedMotion || Math.abs(t - hour) > 2.5) hour = t;
            wake();
        }
        addEventListener('scroll', onScroll, { passive: true });
        addEventListener('resize', () => { measure(); computeFlat(); lastScene = ''; onScroll(); });

        // ----- Animation loop: runs while something is still moving and the story is on screen -----
        let onScreen = true, loopRAF = null, lastNow = performance.now(), lastView = '';
        const riseStart = performance.now() + 300;
        function wake() { if (onScreen && !loopRAF) { lastNow = performance.now(); loopRAF = requestAnimationFrame(frame); } }
        function frame(now) {
            loopRAF = null;
            const dt = Math.min(64, now - lastNow); lastNow = now;
            let busy = false;
            // Time glides toward the scroll position (wheel ticks become smooth motion)
            if (Math.abs(target - hour) > 0.0005) { hour += (target - hour) * (1 - Math.exp(-dt / 140)); busy = true; } else hour = target;
            if (rise < 1) { rise = reducedMotion ? 1 : smooth(0, 1, (now - riseStart) / 1400); busy = true; }
            const hTarget = hwyOn ? 1 : 0;
            if (Math.abs(hTarget - hwy) > 0.005) { hwy += (hTarget - hwy) * (1 - Math.exp(-dt / 90)); busy = true; } else hwy = hTarget;
            tilt.x += (tilt.tx - tilt.x) * 0.06; tilt.y += (tilt.ty - tilt.y) * 0.06;
            if (Math.abs(tilt.tx - tilt.x) + Math.abs(tilt.ty - tilt.y) > 0.002) busy = true;

            // Camera: the story path, blended into the overhead map view; mouse tilt fades out with it
            const S = stagesOf(morphAt(hour)), c = storyCamera(hour), f = flatView, e = S.settle, free = 1 - e;
            const vs = {
                longitude: lerp(c.longitude, f.longitude, e), latitude: lerp(c.latitude, f.latitude, e), zoom: lerp(c.zoom, f.zoom, e),
                pitch: Math.max(0, lerp(c.pitch, 0, e) - tilt.y * 5 * free), bearing: lerpAngle(c.bearing, 0, e) + tilt.x * 7 * free,
            };
            const viewKey = [vs.longitude, vs.latitude, vs.zoom, vs.pitch, vs.bearing].map(v => v.toFixed(5)).join();
            if (viewKey !== lastView) { lastView = viewKey; deckgl.setProps({ viewState: vs }); }
            render();
            if (onScreen && busy) loopRAF = requestAnimationFrame(frame);
        }
        new IntersectionObserver(([e]) => {
            onScreen = e.isIntersecting;
            // The page's section menu steps aside while the story is on screen
            document.body.classList.toggle('ci-on-screen', onScreen);
            if (onScreen) wake();
        }).observe(section);

        // ----- PNG of the finished map (the canvas plus the stats box and key) -----
        pngBtn.addEventListener('click', () => {
            deckgl.redraw('png');
            const src = mapEl.querySelector('canvas');
            const scale = src.width / stage.clientWidth;
            const out = document.createElement('canvas');
            out.width = src.width; out.height = src.height;
            const g = out.getContext('2d');
            g.fillStyle = '#1b2230'; g.fillRect(0, 0, out.width, out.height);
            g.drawImage(src, 0, 0);
            g.scale(scale, scale);
            const H = stage.clientHeight, W = stage.clientWidth;
            // The map's labels are HTML on screen; draw them into the image too
            const textAt = (txt, x, y, font, color, shadow = true) => {
                g.font = font; g.textAlign = 'center'; g.fillStyle = color;
                g.shadowColor = shadow ? 'rgba(0,0,0,0.85)' : 'transparent'; g.shadowOffsetX = g.shadowOffsetY = 1; g.shadowBlur = 2;
                g.fillText(txt, x, y);
            };
            if (!hwyOn) counties.forEach((c, i) => {
                const x = parseFloat(countyEls[i].style.left), y = parseFloat(countyEls[i].style.top), bibb = c.fips === BIBB, pale = isOtherGainer(c.fips);
                const [name, popTxt, netTxt] = Array.from(countyEls[i].children, el => el.textContent);
                textAt(name, x, y - 8, `700 ${bibb ? 14 : 12}px sans-serif`, '#fff');
                textAt(popTxt, x, y + 5, '500 10.5px sans-serif', bibb || pale ? '#d1fae5' : '#d8d8d8');
                textAt(netTxt, x, y + 18, '500 10.5px sans-serif', bibb || pale ? '#d1fae5' : '#d8d8d8');
            });
            if (hwyOn) hwyLabelsGeo.forEach((l, i) => {
                const x = parseFloat(hwyEls[i].style.left), y = parseFloat(hwyEls[i].style.top), inter = l.cls === 'interstate';
                g.shadowColor = 'transparent'; g.font = `700 ${inter ? 10.5 : 9}px sans-serif`;
                const w = g.measureText(l.route).width + 12, h = inter ? 17 : 15;
                g.fillStyle = inter ? '#2dd4bf' : '#1a1a1a'; g.beginPath(); g.roundRect(x - w / 2, y - h / 2, w, h, 3); g.fill();
                if (!inter) { g.strokeStyle = 'rgba(255,255,255,0.65)'; g.stroke(); }
                g.textAlign = 'center'; g.fillStyle = inter ? '#0a2622' : '#fff'; g.fillText(l.route, x, y + 3.5);
            });
            g.shadowColor = 'transparent'; g.textAlign = 'left';
            const box = (x, y, w, h) => { g.fillStyle = 'rgba(16,23,32,0.85)'; g.strokeStyle = 'rgba(255,255,255,0.15)'; g.beginPath(); g.roundRect(x, y, w, h, 6); g.fill(); g.stroke(); };
            box(12, H - 92, 170, 80);
            g.fillStyle = '#fff'; g.font = '700 16px sans-serif'; g.fillText(values.statRegion, 24, H - 66);
            g.fillStyle = '#9aa3b2'; g.font = '600 8px sans-serif'; g.fillText('TOTAL REGIONAL POPULATION', 24, H - 54);
            g.fillStyle = '#34d399'; g.font = '700 16px sans-serif'; g.fillText(values.statBibb, 24, H - 32);
            g.fillStyle = '#9aa3b2'; g.font = '600 8px sans-serif'; g.fillText('MACON-BIBB POPULATION', 24, H - 20);
            const keys = [['Macon-Bibb County', MAP.bibb], ['Net loss of workers', MAP.lossHigh]].concat(counties.some(c => isOtherGainer(c.fips)) ? [['Net gain of workers', MAP.gainer]] : []);
            const kh = 22 + keys.length * 18;
            box(W - 186, H - kh - 12, 174, kh);
            g.fillStyle = '#9aa3b2'; g.font = '600 8px sans-serif'; g.fillText('MAP KEY', W - 174, H - kh + 4);
            keys.forEach(([label, col], i) => {
                g.fillStyle = `rgb(${col})`; g.fillRect(W - 174, H - kh + 12 + i * 18, 10, 10);
                g.fillStyle = '#e6e9ee'; g.font = '500 11px sans-serif'; g.fillText(label, W - 158, H - kh + 21 + i * 18);
            });
            const a = document.createElement('a');
            a.download = 'macon-regional-map.png'; a.href = out.toDataURL('image/png'); a.click();
        });

        // ----- Moments: links into the story (#6am, #8am, #pay, #noon, #evening, #map), a copy-link
        // button on each card, and present mode (fullscreen; arrow keys step card by card) -----
        const goToStep = (el, smooth) => {
            measure();
            const a = anchors.find(x => x.el === el);
            if (a) scrollTo({ top: Math.max(0, a.y), behavior: smooth ? 'smooth' : 'instant' });
        };
        const momentStep = name => steps.find(el => el.dataset.moment === name);
        const goToHash = () => { const el = momentStep(location.hash.slice(1)); if (el) goToStep(el, false); };
        addEventListener('hashchange', goToHash);
        steps.filter(el => el.dataset.moment).forEach(el => {
            const card = el.querySelector('.ci-card');
            if (!card) return;
            const btn = document.createElement('button');
            btn.type = 'button'; btn.className = 'ci-linkbtn'; btn.textContent = 'Link to this moment';
            btn.addEventListener('click', () => {
                const url = location.origin + location.pathname + '#' + el.dataset.moment;
                const reset = () => setTimeout(() => { btn.textContent = 'Link to this moment'; }, 1800);
                const copied = () => { btn.textContent = 'Link copied'; reset(); };
                const fallback = () => { history.replaceState(null, '', '#' + el.dataset.moment); btn.textContent = 'Link is in the address bar'; reset(); };
                if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(url).then(copied, fallback); else fallback();
            });
            card.appendChild(btn);
        });

        let presenting = false;
        function setPresenting(on) {
            if (on === presenting) return;
            presenting = on;
            const at = steps[Math.max(0, step)];
            document.body.classList.toggle('ci-presenting', on);
            if (on && !document.fullscreenElement && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
            if (!on && document.fullscreenElement) document.exitFullscreen().catch(() => {});
            // The header hides while presenting, so the stage moves up: re-measure, then land on the same card
            requestAnimationFrame(() => { computeFlat(); lastScene = ''; goToStep(at, false); onScroll(); });
        }
        document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && presenting) setPresenting(false); });
        document.getElementById('ci-present').addEventListener('click', () => setPresenting(true));
        addEventListener('keydown', e => {
            if (e.target.closest && e.target.closest('input, textarea, select, [contenteditable]')) return;
            if (!presenting) {
                if ((e.key === 'p' || e.key === 'P') && onScreen && !e.metaKey && !e.ctrlKey) { e.preventDefault(); setPresenting(true); }
                return;
            }
            if (e.key === 'Escape') { setPresenting(false); return; }
            const dir = ['ArrowRight', 'ArrowDown', 'PageDown', ' '].includes(e.key) ? 1 : ['ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.key) ? -1 : 0;
            if (!dir) return;
            e.preventDefault();
            goToStep(steps[Math.max(0, Math.min(steps.length - 1, step + dir))], true);
        });

        measure(); onScroll();
        if (reducedMotion) hour = target;
        if (location.hash) goToHash();
        section.classList.add('is-ready');
    }).catch(err => console.error('Commuting intro failed to load', err));
})();
