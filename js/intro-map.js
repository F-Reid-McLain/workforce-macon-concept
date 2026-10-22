/* ===== TITLE SLIDE MAPS — shared base (homepage) =====
   A map of Macon-Bibb behind a title slide: faint neighboring counties and Macon-Bibb's
   outline drawing in, the interstates (and optionally the US routes) drawing in from
   the edges toward Macon, then whatever the slide adds on top (its "layer").
   Used by js/jobs-intro-map.js (the trauma center) and js/growth-intro-map.js (new
   manufacturers).

   The drawing plays once the slide is centered, whether the snap glided it there
   (js/chapters.js) or present mode's arrow keys did, and pulls back quickly as soon as
   it moves away, so it builds fresh every visit. In present mode an arrow press while
   it's drawing finishes it, like a slide build (slide.wfFinishBuild, called by
   window.WFStops). Drawn and still with reduced motion.

   Data: data/counties.geojson; data/major-highways.geojson for the interstates (a
   coarse, regional file, so interstate ends that stop just short of the interstate
   they join are snapped onto it); data/us-routes-macon.geojson for the US routes,
   their real paths through Macon from OpenStreetMap (tools/fetch-us-routes.py).
   Roads are drawn as smooth curves.

   WFIntroMap.create({
     svg,              the <svg> inside the .stop-intro
     drawMs,           how long the build plays
     base,             when each base part draws, as [from, to] in build progress (0-1):
                       { neighbors, bibb, ints, us (or null to leave them out), shields }
     fit(W, H, wide),  where Macon-Bibb sits: { x, y } its center in px, { w, h } the
                       share of the width and height its outline may fill; with
                       at: [lon, lat], that point goes at { x, y } instead (to zoom
                       in on part of the county)
     layer(ctx)        draws the slide's own parts once the base is in; returns
                       render(p, stage), called on every frame. ctx: { svg, proj, W,
                       H, wide, center, slide, bounds, bibbRings } (bounds: Macon-Bibb's box on
                       screen; bibbRings: its outline on screen)
   }) */
window.WFIntroMap = (function () {
    'use strict';
    if (!window.d3) return null;
    const reduce = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
    const DOWNTOWN = [-83.6290, 32.8380];   // downtown Macon, for slides that mark it
    const INTERSTATES = new Set(['I-75', 'I-16', 'I-475']);
    const US_ROUTES = new Set(['US-41', 'US-80', 'US-129', 'US-23']);
    const LAT0 = 32.8 * Math.PI / 180;
    const flat = ([lon, lat]) => [lon * Math.cos(LAT0), lat];
    const smooth = d3.line().curve(d3.curveCatmullRom.alpha(0.5));
    const straight = pts => 'M' + pts.map(p => p.map(v => v.toFixed(1)).join(',')).join('L') + 'Z';   // county lines stay true
    const clamp = v => Math.max(0, Math.min(1, v));
    const rings = g => g.type === 'Polygon' ? g.coordinates : g.coordinates.flat();
    const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    let data = null;
    const load = () => data || (data = Promise.all([d3.json('data/counties.geojson'), d3.json('data/major-highways.geojson'),
        d3.json('data/us-routes-macon.geojson').catch(() => null)]));

    // Nearest point on a polyline to p
    function nearestOn(line, p) {
        let best = null, bd = Infinity;
        for (let i = 1; i < line.length; i++) {
            const [a, b] = [line[i - 1], line[i]], dx = b[0] - a[0], dy = b[1] - a[1];
            const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
            const q = [a[0] + t * dx, a[1] + t * dy], d = dist(p, q);
            if (d < bd) { bd = d; best = q; }
        }
        return [best, bd];
    }

    function create(opts) {
        const svgEl = opts.svg, slide = svgEl.closest('.stop-intro'), svg = d3.select(svgEl);
        const base = opts.base;
        let counties = null, roads = null, usRoutes = null, parts = null, renderLayer = null;

        function draw() {
            if (!counties || !roads) return;
            const W = slide.clientWidth, H = slide.clientHeight, wide = W >= 900;
            svg.attr('viewBox', `0 0 ${W} ${H}`).attr('width', W).attr('height', H).selectAll('*').remove();
            const bibbF = counties.features.find(f => f.properties.name === 'Bibb');
            // Planar projection fitted to Macon-Bibb where the slide wants it
            const pts = rings(bibbF.geometry).flatMap(r => r.map(flat));
            const [x0, x1] = d3.extent(pts, p => p[0]), [y0, y1] = d3.extent(pts, p => p[1]);
            const fit = opts.fit(W, H, wide);
            const k = Math.min(fit.h * H / (y1 - y0), fit.w * W / (x1 - x0));
            const [cx, cy] = fit.at ? flat(fit.at) : [(x0 + x1) / 2, (y0 + y1) / 2];
            const proj = p => { const [x, y] = flat(p); return [fit.x + k * (x - cx), fit.y - k * (y - cy)]; };
            const center = proj([d3.mean(rings(bibbF.geometry)[0], p => p[0]), d3.mean(rings(bibbF.geometry)[0], p => p[1])]);

            const neighbors = svg.append('g').attr('class', 'im-neighbors').selectAll('path')
                .data(counties.features.filter(f => f !== bibbF)).join('path')
                .attr('d', f => rings(f.geometry).map(r => straight(r.map(proj))).join(''));
            const bibb = svg.append('path').attr('class', 'im-bibb')
                .attr('d', rings(bibbF.geometry).map(r => straight(r.map(proj))).join(''));

            // Roads in screen space; interstate ends within ~28px of another interstate are joined onto it
            const lines = [];
            const add = (f, cls) => (f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates)
                .forEach(part => lines.push({ route: f.properties.route, cls, pts: part.map(proj) }));
            roads.features.forEach(f => { if (INTERSTATES.has(f.properties.route)) add(f, 'im-interstate'); });
            // US routes: their real paths (OpenStreetMap) where that file loaded, else the regional file's
            if (base.us) (usRoutes ? usRoutes.features : roads.features.filter(f => US_ROUTES.has(f.properties.route))).forEach(f => add(f, 'im-us'));
            const inter = lines.filter(l => l.cls === 'im-interstate');
            inter.forEach(l => {
                [0, l.pts.length - 1].forEach(end => {
                    const tip = l.pts[end], prev = l.pts[end === 0 ? 1 : end - 1];
                    let best = null;
                    inter.forEach(o => {
                        if (o === l || o.route === l.route) return;
                        const [q, d] = nearestOn(o.pts, tip);
                        // only carry the road forward to meet the other one, never back on itself
                        const ahead = (tip[0] - prev[0]) * (q[0] - tip[0]) + (tip[1] - prev[1]) * (q[1] - tip[1]) > 0;
                        if (d > 1 && d < 28 && ahead && (!best || d < best[1])) best = [q, d];
                    });
                    if (best) { if (end === 0) l.pts.unshift(best[0]); else l.pts.push(best[0]); }
                });
            });
            // Each road split where it passes closest to Macon, both halves drawn from the far end in
            const halves = [];
            lines.forEach(l => {
                let near = 0;
                l.pts.forEach((p, i) => { if (dist(p, center) < dist(l.pts[near], center)) near = i; });
                [l.pts.slice(0, near + 1), l.pts.slice(near).reverse()].forEach(h => { if (h.length > 1) halves.push({ route: l.route, cls: l.cls, pts: h }); });
            });
            const gRoads = svg.append('g').attr('class', 'im-roads');
            const us = gRoads.selectAll('path.im-us').data(halves.filter(h => h.cls === 'im-us')).join('path').attr('class', 'im-us').attr('d', d => smooth(d.pts));
            const ints = gRoads.selectAll('path.im-interstate').data(halves.filter(h => h.cls === 'im-interstate')).join('path').attr('class', 'im-interstate').attr('d', d => smooth(d.pts));

            // Interstate shields out toward the edges: I-75 to the north, I-16 to the southeast
            const shieldAt = (route, pick) => {
                const options = halves.filter(h => h.route === route)
                    .map(h => h.pts.find(q => dist(q, center) < Math.min(W, H) * 0.42) || h.pts[h.pts.length - 1]);
                return options.length ? options.reduce(pick) : null;
            };
            const labels = [['I-75', (a, b) => (a[1] < b[1] ? a : b)], ['I-16', (a, b) => (a[0] > b[0] ? a : b)]]
                .map(([route, pick]) => ({ route, at: shieldAt(route, pick) })).filter(l => l.at);
            const shields = svg.append('g').attr('class', 'im-labels').selectAll('g').data(labels).join('g')
                .attr('transform', l => `translate(${l.at[0].toFixed(1)},${l.at[1].toFixed(1)})`);
            shields.append('rect').attr('x', -20).attr('y', -10).attr('width', 40).attr('height', 20).attr('rx', 5);
            shields.append('text').attr('text-anchor', 'middle').attr('dy', '0.35em').text(l => l.route);

            // Lengths for the draw-on
            const prep = sel => sel.each(function () { const n = this.getTotalLength(); this.__len = n; d3.select(this).attr('stroke-dasharray', `${n} ${n}`); });
            prep(neighbors); prep(bibb); prep(ints); prep(us);
            parts = { neighbors, bibb, ints, us, shields };
            const [bx0, by0] = proj([x0 / Math.cos(LAT0), y1]), [bx1, by1] = proj([x1 / Math.cos(LAT0), y0]);
            renderLayer = opts.layer({ svg, proj, W, H, wide, center, slide, bounds: { x0: bx0, y0: by0, x1: bx1, y1: by1 },
                                       bibbRings: rings(bibbF.geometry).map(r => r.map(proj)), DOWNTOWN });
            render(reduce ? 1 : cur);
        }

        // How centered the slide is: 0 while it's away, 1 while it's centered
        function progress() {
            const r = slide.getBoundingClientRect(), vh = innerHeight;
            const off = Math.abs(r.top + r.height / 2 - vh / 2);
            return clamp(1.15 - off / (0.55 * vh));
        }
        function render(p) {
            if (!parts) return;
            const stage = (a, b) => clamp((p - a) / (b - a));
            const dash = (sel, t) => sel.attr('stroke-dashoffset', function () { return this.__len * (1 - t); });
            dash(parts.neighbors, stage(...base.neighbors));
            dash(parts.bibb, stage(...base.bibb));
            const [ia, ib] = base.ints;
            parts.ints.each(function (d, i) { d3.select(this).attr('stroke-dashoffset', this.__len * (1 - stage(ia + (i % 3) * 0.04, ib + (i % 3) * 0.04))); });
            if (base.us) dash(parts.us, stage(...base.us));
            parts.shields.style('opacity', stage(...base.shields));
            if (renderLayer) renderLayer(p, stage);
            svgEl.classList.toggle('is-drawn', p >= 0.999);   // pulses run only once it's complete
        }

        // Play once the slide is centered; pull back (quicker) as soon as it moves off. The
        // small gap between the two keeps it from flickering.
        let cur = 0, target = 0, clock = null;
        const DRAW_MS = opts.drawMs || 3000, UNDRAW_MS = 650;
        const stopClock = () => { if (clock) { clock.stop(); clock = null; } };
        function animateTo(t) {
            stopClock();
            target = t;
            const from = cur, ms = (t ? DRAW_MS : UNDRAW_MS) * Math.abs(t - from), t0 = performance.now();
            clock = d3.timer(() => {
                const k = ms ? clamp((performance.now() - t0) / ms) : 1;
                cur = from + (t - from) * k;
                render(cur);
                if (k >= 1) stopClock();
            });
        }
        function aim() {
            const p = progress(), t = p >= 0.92 ? 1 : p < 0.9 ? 0 : target;
            if (t !== target) animateTo(t);
        }
        // Present mode: an arrow press while it's drawing finishes it (true) instead of moving on
        slide.wfFinishBuild = () => {
            if (!clock || target !== 1) return false;
            stopClock(); cur = 1; render(1);
            return true;
        };
        let raf = null;
        const onScroll = () => { if (!raf) raf = requestAnimationFrame(() => { raf = null; aim(); }); };
        const ready = Promise.all([load(), opts.ready || null]).then(([[c, r, u]]) => {
            counties = c; roads = r; usRoutes = u;
            draw();
            if (!reduce) { addEventListener('scroll', onScroll, { passive: true }); aim(); }
        }).catch(err => console.error('Title slide map failed to load', err));
        let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(draw, 250); });
        return { ready, redraw: draw };
    }

    return { create, reduce };
})();
