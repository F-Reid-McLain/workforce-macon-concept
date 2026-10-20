/* ===== COMMUTING INTRO — homepage =====
   A short scroll story at the top of the Workforce Data page: the 17-county
   region as 3D blocks, one per county, all level at dawn. As you scroll
   through the day, dots (groups of commuters, LODES 2023) fly between
   Macon-Bibb and its neighbors; a county drops the moment its dots leave and
   rises when they land, so Macon-Bibb visibly grows while its neighbors
   shrink, then everything settles back in the evening.

   Built with deck.gl (no base map). Data: data/commute-region.json (county
   outlines + LODES flows to and from Macon-Bibb) and data/Population By
   County.csv (residents, ACS 2024). Commute timing is illustrative. */
(function () {
    'use strict';
    const section = document.getElementById('section-commute');
    if (!section || !window.deck || !window.d3) return;

    const BIBB = '13021';
    const mobile = window.innerWidth < 700;
    const reducedMotion = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
    const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    const fmt = n => Math.round(n).toLocaleString();
    const fmtTime = t => {
        const h = Math.floor(t), m = Math.round((t - h) * 4) * 15;
        const hh = (h + (m === 60 ? 1 : 0)) % 24, mm = m === 60 ? 0 : m;
        return `${hh % 12 === 0 ? 12 : hh % 12}:${String(mm).padStart(2, '0')} ${hh < 12 ? 'AM' : 'PM'}`;
    };

    // Sticky stage sits just under the fixed site header
    const header = document.querySelector('.main-header');
    const setTop = () => section.style.setProperty('--ci-top', (header ? header.offsetHeight : 0) + 'px');
    setTop();

    Promise.all([d3.json('data/commute-region.json'), d3.csv('data/Population By County.csv')]).then(([region, popRows]) => {
        // ----- Counties -----
        const pop = new Map(popRows.map(r => [String(r.FIPS).padStart(5, '0'), +String(r.Population).replace(/,/g, '')]));
        const counties = region.counties.filter(c => pop.has(c.fips));
        const rings = counties.flatMap(c => c.rings.map(ring => ({ fips: c.fips, ring })));
        const nameOf = new Map(counties.map(c => [c.fips, c.fips === BIBB ? 'Macon-Bibb' : c.name]));
        // Flat centroid of each county's largest ring
        const center = new Map(counties.map(c => [c.fips, d3.polygonCentroid(d3.greatest(c.rings, r => Math.abs(d3.polygonArea(r)))) ]));

        // ----- Commuters: each dot is a group of ~N people with its own times -----
        // Departures follow an illustrative morning curve (6:10–10 AM), returns 4:30–7 PM.
        const DEPART = [[6.15, 6.6, 6], [6.6, 7.1, 14], [7.1, 7.6, 22], [7.6, 8.1, 24], [8.1, 8.6, 16], [8.6, 9.2, 11], [9.2, 10, 7]];
        const depTotal = d3.sum(DEPART, d => d[2]);
        const departAt = q => {   // inverse of the cumulative curve
            let acc = 0;
            for (const [a, b, w] of DEPART) { const s = w / depTotal; if (q <= acc + s) return a + (b - a) * (q - acc) / s; acc += s; }
            return 10;
        };
        const returnAt = q => 16.5 + 2.5 * (Math.acos(1 - 2 * q) / Math.PI);   // eased spread over 4:30–7 PM
        const TRAVEL = 0.5;
        const totalPeople = d3.sum(region.flows, f => f.jobs);
        const PER_DOT = totalPeople / (mobile ? 140 : 230);
        let seed = 3; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
        const commuters = region.flows.flatMap(f => {
            const n = Math.max(1, Math.round(f.jobs / PER_DOT));
            return d3.range(n).map(i => {
                const t0 = departAt((i + rnd()) / n);
                const j = () => (rnd() - 0.5) * 0.06;
                return { from: f.from, to: f.to, people: f.jobs / n, t0, t1: Math.max(t0 + TRAVEL + 1, returnAt(rnd())), a: [j(), j()], b: [j(), j()] };
            });
        });
        function rawPeople(h) {
            const m = new Map(pop);
            commuters.forEach(d => {
                if (h >= d.t0 && h < d.t1 + TRAVEL) m.set(d.from, m.get(d.from) - d.people);   // left home
                if (h >= d.t0 + TRAVEL && h < d.t1) m.set(d.to, m.get(d.to) + d.people);      // at work
            });
            return m;
        }
        // Dots in and out of a neighbor are timed independently; a county that loses
        // people overall is held at its resident count rather than flashing a brief gain
        const midday = rawPeople(12.5);
        const capAtHome = new Set(counties.filter(c => c.fips !== BIBB && midday.get(c.fips) < pop.get(c.fips)).map(c => c.fips));
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
        const values = {
            regionPop: fmt(d3.sum(counties, c => pop.get(c.fips))),
            inFromRegion: fmt(inFromRegion),
            perDot: '~' + fmt(Math.round(PER_DOT / 10) * 10),
            bibbDay: fmt(Math.round(bibbDay / 100) * 100),
            bibbPct: '+' + Math.round(100 * (bibbDay - bibbPop) / bibbPop) + '%',
            oneIn: '1 in ' + Math.round(region.bibbJobs / inFromRegion),
            topSources: topSources.slice(0, -1).join(', ') + ' and ' + topSources[topSources.length - 1],
        };
        section.querySelectorAll('[data-ci]').forEach(el => { if (values[el.dataset.ci] !== undefined) el.textContent = values[el.dataset.ci]; });

        // ----- Scene -----
        const mapEl = document.getElementById('ci-map');
        const tip = document.getElementById('ci-tip');
        const timeLabel = document.getElementById('ci-time-label');
        const timeIcon = document.getElementById('ci-time-icon');
        const labelFont = getComputedStyle(document.querySelector('h2') || document.body).fontFamily;

        // Light through the day: moonlight, dawn, midday, evening
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
        const ambient = new deck.AmbientLight({ color: [255, 255, 255], intensity: 0.5 });
        const sun = new deck.DirectionalLight({ color: [255, 246, 228], intensity: 1.7, direction: [-0.75, -0.37, -0.55] });
        let lightHour = -1;
        function setLight(h) {
            if (h === lightHour) return;
            lightHour = h;
            const i = Math.max(0, LIGHT.findIndex(k => k[0] > h) - 1), a = LIGHT[i], b = LIGHT[i + 1] || a;
            const k = smooth(a[0], b[0], h), mix = (x, y) => Array.isArray(x) ? x.map((v, j) => Math.round(v + (y[j] - v) * k)) : x + (y - x) * k;
            ambient.color = mix(a[1], b[1]); ambient.intensity = mix(a[2], b[2]);
            sun.color = mix(a[3], b[3]); sun.intensity = mix(a[4], b[4]);
            const dir = [-3 + 6 * smooth(6.5, 19, h), -1.5, -2.2], len = Math.hypot(...dir);
            sun.direction = dir.map(v => v / len);   // deck.gl only normalizes this in its constructor
            section.style.setProperty('--ci-sky', mix(a[5], b[5]).join(', '));
        }

        // Camera: one beat per step; the mouse tilts around it
        const V = (lon, lat, zoom, pitch, bearing) => ({ longitude: lon, latitude: lat, zoom: zoom - (mobile ? 0.9 : 0), pitch, bearing });
        const VIEWS = [
            V(-83.62, 33.05, 8.0, 58, -10),    // welcome: the region low in the frame, under the headline
            V(-83.62, 32.62, 8.3, 54, 0),      // dawn, everyone home
            V(-83.63, 32.68, 8.45, 60, -8),    // rush hour
            V(-83.62, 32.68, 8.4, 60, 6),      // the workday
            V(-83.62, 32.64, 8.3, 56, 0),      // heading home
        ];
        let base = { ...VIEWS[0] }, tween = null, lastView = 0;
        const tilt = { x: 0, y: 0, tx: 0, ty: 0 };
        const stage = document.getElementById('ci-stage');
        if (!reducedMotion && matchMedia('(hover: hover)').matches) {
            stage.addEventListener('mousemove', e => {
                const r = stage.getBoundingClientRect();
                tilt.tx = ((e.clientX - r.left) / r.width) * 2 - 1; tilt.ty = ((e.clientY - r.top) / r.height) * 2 - 1;
            });
            stage.addEventListener('mouseleave', () => { tilt.tx = 0; tilt.ty = 0; });
        }

        let hour = 5, step = 0, rise = reducedMotion ? 1 : 0;
        const deckgl = new deck.Deck({
            parent: mapEl, views: new deck.MapView({ repeat: false }), viewState: base, controller: false,
            effects: [new deck.LightingEffect({ ambient, sun })],
            onHover: info => {
                const fips = info.object && info.object.fips;
                if (!fips) { tip.style.display = 'none'; return; }
                const now = peopleNow(hour).get(fips), d = now - pop.get(fips);
                tip.innerHTML = `<b>${nameOf.get(fips)}</b>Residents: <span>${fmt(pop.get(fips))}</span>` +
                    (Math.abs(d) >= 1 ? `<br>Here right now: <span>${fmt(now)}</span> (${d > 0 ? '+' : ''}${fmt(d)})` : '');
                tip.style.left = (info.x + 14) + 'px'; tip.style.top = (info.y + 12) + 'px'; tip.style.display = 'block';
            },
        });

        function layers() {
            const p = rise;
            const k = r => heightShare(r.fips, hour);
            const homeTop = r => p * BLOCK_H * Math.min(1, k(r)), fullTop = r => p * BLOCK_H * k(r);
            const gainers = rings.filter(r => k(r) > 1.002), losers = rings.filter(r => k(r) < 0.998);
            const lift = (ring, z) => ring.map(([x, y]) => [x, y, z]);
            const material = { ambient: 0.6, diffuse: 0.42, shininess: 8, specularColor: [40, 40, 40] };
            const key = [hour, p];
            const moving = commuters.filter(d => (hour > d.t0 && hour < d.t0 + TRAVEL) || (hour > d.t1 && hour < d.t1 + TRAVEL));
            const top = fips => p * BLOCK_H * heightShare(fips, hour);
            const dotPos = d => {
                const u = hour < d.t1 ? (hour - d.t0) / TRAVEL : 1 - (hour - d.t1) / TRAVEL;   // 0 = home, 1 = work
                const a = center.get(d.from), b = center.get(d.to);
                const ax = a[0] + d.a[0], ay = a[1] + d.a[1], bx = b[0] + d.b[0], by = b[1] + d.b[1];
                const za = top(d.from), zb = top(d.to);
                return [ax + (bx - ax) * u, ay + (by - ay) * u, za + (zb - za) * u + Math.sin(Math.PI * u) * ARC];
            };
            return [
                new deck.SolidPolygonLayer({ id: 'home', data: rings, extruded: true, pickable: true, material, getPolygon: r => r.ring,
                    getElevation: homeTop, getFillColor: [123, 143, 209], updateTriggers: { getElevation: key } }),
                new deck.SolidPolygonLayer({ id: 'gain', data: gainers, extruded: true, pickable: true, material, getPolygon: r => lift(r.ring, homeTop(r)),
                    getElevation: r => fullTop(r) - homeTop(r), getFillColor: [242, 196, 107], updateTriggers: { getPolygon: key, getElevation: key } }),
                new deck.PathLayer({ id: 'edges', data: rings, getPath: r => lift(r.ring, fullTop(r) + 20), widthUnits: 'pixels',
                    getWidth: r => r.fips === BIBB ? 2.5 : 1, getColor: r => r.fips === BIBB ? [180, 140, 70, 230] : [255, 255, 255, 120], updateTriggers: { getPath: key } }),
                new deck.PathLayer({ id: 'night', data: losers, getPath: r => lift(r.ring, p * BLOCK_H), widthUnits: 'pixels',
                    getWidth: 1.2, getColor: [255, 255, 255, 150], updateTriggers: { getPath: key } }),
                new deck.ScatterplotLayer({ id: 'dots', data: moving, visible: moving.length > 0 && p > 0.9,
                    getPosition: dotPos, getFillColor: d => d.to === BIBB ? [242, 196, 107, 245] : [255, 255, 255, 240],
                    stroked: true, getLineColor: [40, 35, 25, 200], lineWidthUnits: 'pixels', getLineWidth: 0.6,
                    radiusUnits: 'pixels', getRadius: mobile ? 2.4 : 3, billboard: true,
                    parameters: { depthCompare: 'always' }, updateTriggers: { getPosition: [hour, p] } }),
                new deck.TextLayer({ id: 'names', data: counties, visible: p > 0.9 && step > 0,
                    getPosition: c => { const ctr = center.get(c.fips); return [ctr[0], ctr[1], p * BLOCK_H * heightShare(c.fips, hour) + 900]; },
                    getText: c => {
                        const pct = Math.round((share(c.fips, hour) - 1) * 100);
                        return pct !== 0 ? `${nameOf.get(c.fips)}\n${pct > 0 ? '+' : ''}${pct}%` : nameOf.get(c.fips);
                    },
                    getSize: c => c.fips === BIBB ? (mobile ? 14 : 17) : (mobile ? 10 : 12), lineHeight: 1.1,
                    getColor: c => c.fips === BIBB ? [242, 196, 107, 255] : [245, 240, 228, 230], fontFamily: labelFont, fontWeight: 600,
                    billboard: true, fontSettings: { sdf: true }, outlineWidth: 4, outlineColor: [16, 23, 26, 230],
                    parameters: { depthCompare: 'always', depthWriteEnabled: false }, updateTriggers: { getPosition: key, getText: key } }),
            ];
        }

        function render() {
            setLight(hour);
            deckgl.setProps({ layers: layers() });
            timeLabel.textContent = fmtTime(hour);
            timeIcon.textContent = hour >= 6.5 && hour < 19 ? '☀' : '☾';
            if (step !== lastView) {
                lastView = step;
                const to = VIEWS[Math.min(step, VIEWS.length - 1)];
                tween = reducedMotion ? null : { from: { ...base }, to, start: performance.now(), dur: 1800 };
                if (!tween) base = { ...to };
            }
        }

        // ----- Scroll ⇄ time: each step's data-time is reached at its center -----
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
            hour = t; step = idx;
            render();
        }
        let scrollRAF = null;
        addEventListener('scroll', () => { if (!scrollRAF) scrollRAF = requestAnimationFrame(() => { scrollRAF = null; onScroll(); }); }, { passive: true });
        addEventListener('resize', () => { measure(); onScroll(); });

        // ----- Animation loop: camera tween, mouse tilt, first rise — only while on screen -----
        const ease = x => x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
        const lerpAngle = (a, b, k) => a + ((((b - a) % 360) + 540) % 360 - 180) * k;
        let onScreen = true, loopRAF = null, lastKey = '';
        const riseStart = performance.now() + 300;
        function frame(now) {
            loopRAF = null;
            if (rise < 1) { rise = smooth(0, 1, (now - riseStart) / 1400); render(); }
            if (tween) {
                const k = ease(Math.min(1, (now - tween.start) / tween.dur)), a = tween.from, b = tween.to;
                base = { longitude: a.longitude + (b.longitude - a.longitude) * k, latitude: a.latitude + (b.latitude - a.latitude) * k,
                         zoom: a.zoom + (b.zoom - a.zoom) * k, pitch: a.pitch + (b.pitch - a.pitch) * k, bearing: lerpAngle(a.bearing, b.bearing, k) };
                if (k >= 1) tween = null;
            }
            tilt.x += (tilt.tx - tilt.x) * 0.06; tilt.y += (tilt.ty - tilt.y) * 0.06;
            const vs = { ...base, bearing: base.bearing + tilt.x * 7, pitch: Math.max(0, base.pitch - tilt.y * 5) };
            const key = [vs.longitude, vs.latitude, vs.zoom, vs.pitch, vs.bearing].map(v => v.toFixed(4)).join();
            if (key !== lastKey) { lastKey = key; deckgl.setProps({ viewState: vs }); }
            if (onScreen) loopRAF = requestAnimationFrame(frame);
        }
        new IntersectionObserver(([e]) => {
            onScreen = e.isIntersecting;
            // The page's section menu steps aside while the story is on screen
            document.body.classList.toggle('ci-on-screen', onScreen);
            if (onScreen && !loopRAF) loopRAF = requestAnimationFrame(frame);
        }).observe(section);

        measure(); onScroll();
        section.classList.add('is-ready');
    }).catch(err => console.error('Commuting intro failed to load', err));
})();
