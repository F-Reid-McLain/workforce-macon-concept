/* ===== JOBS TITLE SLIDE MAP — homepage =====
   Behind "Registered nurses are Macon-Bibb's most common job": a soft outline of
   Macon-Bibb, the interstates (then the US routes) drawing in from the edges toward
   Macon, and the region's Level I trauma center (Atrium Health Navicent The Medical
   Center, 777 Hemlock St) rising where it stands.
   The drawing plays (about three seconds) once the slide is centered, whether the
   snap glided it there (js/chapters.js) or present mode's arrow keys did, and pulls
   back quickly as soon as it moves away, so it builds fresh every visit. In present
   mode an arrow press while it's drawing finishes it, like a slide build
   (slide.wfFinishBuild, called by window.WFStops). Drawn and still with reduced motion. On wide screens the headline holds the left half and Macon the
   right; on phones the headline sits on top and Macon below it.
   Data: data/counties.geojson, data/major-highways.geojson (a coarse, regional file,
   so interstate ends that stop just short of the interstate they join are snapped
   onto it, the US routes, which the file stops a few miles short of town, are
   carried in to downtown where they meet, and roads are drawn as smooth curves). */
(function () {
    'use strict';
    if (!window.d3) return;
    const svgEl = document.getElementById('jobs-intro-map');
    if (!svgEl) return;
    const slide = svgEl.closest('.stop-intro');
    const svg = d3.select(svgEl);
    const reduce = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
    const HOSPITAL = [-83.6363, 32.8366];
    const DOWNTOWN = [-83.6290, 32.8380];   // where the US routes meet
    const INTERSTATES = new Set(['I-75', 'I-16', 'I-475']);
    const US_ROUTES = new Set(['US-41', 'US-80', 'US-129', 'US-23']);
    const LAT0 = 32.8 * Math.PI / 180;
    const flat = ([lon, lat]) => [lon * Math.cos(LAT0), lat];
    const smooth = d3.line().curve(d3.curveCatmullRom.alpha(0.5));
    const straight = pts => 'M' + pts.map(p => p.map(v => v.toFixed(1)).join(',')).join('L') + 'Z';   // county lines stay true
    const clamp = v => Math.max(0, Math.min(1, v));

    let counties = null, roads = null, parts = null;

    function projector(W, H, bibbRings) {
        const pts = bibbRings.flatMap(r => r.map(flat));
        const [x0, x1] = d3.extent(pts, p => p[0]), [y0, y1] = d3.extent(pts, p => p[1]);
        const wide = W >= 900;
        const k = wide ? Math.min(0.5 * H / (y1 - y0), 0.36 * W / (x1 - x0)) : Math.min(0.36 * H / (y1 - y0), 0.62 * W / (x1 - x0));
        const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
        const sx = wide ? W * 0.74 : W / 2, sy = wide ? H * 0.54 : H * 0.8;
        return p => { const [x, y] = flat(p); return [sx + k * (x - cx), sy - k * (y - cy)]; };
    }
    const rings = g => g.type === 'Polygon' ? g.coordinates : g.coordinates.flat();
    const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
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

    function draw() {
        if (!counties || !roads) return;
        const W = slide.clientWidth, H = slide.clientHeight;
        svg.attr('viewBox', `0 0 ${W} ${H}`).attr('width', W).attr('height', H).selectAll('*').remove();
        const bibbF = counties.features.find(f => f.properties.name === 'Bibb');
        const proj = projector(W, H, rings(bibbF.geometry));
        const center = proj([d3.mean(rings(bibbF.geometry)[0], p => p[0]), d3.mean(rings(bibbF.geometry)[0], p => p[1])]);

        const neighbors = svg.append('g').attr('class', 'im-neighbors').selectAll('path')
            .data(counties.features.filter(f => f !== bibbF)).join('path')
            .attr('d', f => rings(f.geometry).map(r => straight(r.map(proj))).join(''));
        const bibb = svg.append('path').attr('class', 'im-bibb')
            .attr('d', rings(bibbF.geometry).map(r => straight(r.map(proj))).join(''));

        // Roads in screen space; interstate ends within ~28px of another interstate are joined onto it
        const lines = [];
        roads.features.forEach(f => {
            const route = f.properties.route;
            const cls = INTERSTATES.has(route) ? 'im-interstate' : US_ROUTES.has(route) ? 'im-us' : null;
            if (!cls) return;
            (f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates).forEach(part => {
                part = part.slice();
                if (cls === 'im-us') {   // carry the end nearer town on in to downtown (if it stops within ~12 km)
                    const km = q => Math.hypot((q[0] - DOWNTOWN[0]) * 93.5, (q[1] - DOWNTOWN[1]) * 111);
                    const [a, b] = [km(part[0]), km(part[part.length - 1])];
                    if (Math.min(a, b) < 12 && Math.min(a, b) > 0.2) { if (a < b) part.unshift(DOWNTOWN); else part.push(DOWNTOWN); }
                }
                lines.push({ route, cls, pts: part.map(proj) });
            });
        });
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

        // The hospital stands on its spot (a small marker at its real location) and rises above the road
        const [hx, hy] = proj(HOSPITAL);
        const gH = svg.append('g').attr('class', 'im-hospital').attr('transform', `translate(${hx.toFixed(1)},${hy.toFixed(1)})`);
        const halo = gH.append('circle').attr('class', 'im-halo').attr('cy', -20).attr('r', 30);
        gH.append('circle').attr('class', 'im-spot').attr('r', 3.2);
        const bld = gH.append('g').attr('class', 'im-building');
        bld.append('ellipse').attr('class', 'im-shadow').attr('cx', 0).attr('cy', 0).attr('rx', 22).attr('ry', 3.5);
        bld.append('rect').attr('class', 'im-wing').attr('x', -21).attr('y', -18).attr('width', 42).attr('height', 18).attr('rx', 1.5);
        bld.append('rect').attr('class', 'im-tower').attr('x', -8).attr('y', -32).attr('width', 16).attr('height', 32).attr('rx', 1.5);
        const win = [];
        [-17, -12, 8, 13].forEach(x => [-14, -8].forEach(y => win.push([x, y])));
        [-4, 1].forEach(x => [-27, -21, -15].forEach(y => win.push([x, y])));
        bld.selectAll('rect.im-win').data(win).join('rect').attr('class', 'im-win').attr('x', d => d[0]).attr('y', d => d[1]).attr('width', 3.2).attr('height', 3.2).attr('rx', 0.6);
        bld.append('rect').attr('class', 'im-door').attr('x', -3.5).attr('y', -7).attr('width', 7).attr('height', 7).attr('rx', 1);
        bld.append('circle').attr('class', 'im-badge').attr('cx', 0).attr('cy', -40).attr('r', 7.5);
        bld.append('path').attr('class', 'im-cross').attr('d', 'M-1.6,-44.5h3.2v3h3v3.2h-3v3h-3.2v-3h-3v-3.2h3z');
        const hLabel = gH.append('text').attr('class', 'im-hlabel').attr('x', 28).attr('y', -30).text('Level I trauma center');

        // Lengths for the draw-on
        const prep = sel => sel.each(function () { const n = this.getTotalLength(); this.__len = n; d3.select(this).attr('stroke-dasharray', `${n} ${n}`); });
        prep(neighbors); prep(bibb); prep(ints); prep(us);
        parts = { neighbors, bibb, ints, us, shields, bld, halo, hLabel };
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
        dash(parts.neighbors, stage(0, 0.3));
        dash(parts.bibb, stage(0.08, 0.4));
        parts.ints.each(function (d, i) { d3.select(this).attr('stroke-dashoffset', this.__len * (1 - stage(0.3 + (i % 3) * 0.04, 0.6 + (i % 3) * 0.04))); });
        dash(parts.us, stage(0.5, 0.8));
        parts.shields.style('opacity', stage(0.65, 0.75));
        const rise = d3.easeBackOut.overshoot(1.4)(stage(0.75, 0.93));
        parts.bld.attr('transform', `scale(1, ${Math.max(0.001, rise).toFixed(3)})`).style('opacity', stage(0.74, 0.79));
        parts.halo.style('opacity', stage(0.88, 0.97));
        parts.hLabel.style('opacity', stage(0.9, 1));
        svgEl.classList.toggle('is-drawn', p >= 0.999);   // the halo pulses only when complete
    }

    // Play once the slide is centered; pull back (quicker) as soon as it moves off. The
    // small gap between the two keeps it from flickering.
    let cur = 0, target = 0, clock = null;
    const DRAW_MS = 3000, UNDRAW_MS = 650;
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
    Promise.all([d3.json('data/counties.geojson'), d3.json('data/major-highways.geojson')]).then(([c, r]) => {
        counties = c; roads = r;
        draw();
        if (!reduce) { addEventListener('scroll', onScroll, { passive: true }); aim(); }
    }).catch(err => console.error('Jobs map failed to load', err));
    let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(draw, 250); });
})();
