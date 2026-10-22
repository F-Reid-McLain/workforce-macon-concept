/* ===== JOBS TITLE SLIDE MAP — homepage =====
   Behind "Registered nurses are Macon-Bibb's most common job": a soft outline of
   Macon-Bibb traces itself, the interstates (then the US routes) draw in from the
   edges toward Macon, and the region's Level I trauma center (Atrium Health Navicent
   The Medical Center, 777 Hemlock St) rises where it stands. Plays once when the
   slide is mostly on screen; appears already drawn with reduced motion.
   On wide screens the headline holds the left half and Macon the right; on phones
   the headline sits on top and Macon below it.
   Data: data/counties.geojson, data/major-highways.geojson. */
(function () {
    'use strict';
    if (!window.d3) return;
    const svgEl = document.getElementById('jobs-intro-map');
    if (!svgEl) return;
    const slide = svgEl.closest('.stop-intro');
    const svg = d3.select(svgEl);
    const reduce = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
    const HOSPITAL = [-83.6363, 32.8366];
    const INTERSTATES = new Set(['I-75', 'I-16', 'I-475']);
    const US_ROUTES = new Set(['US-41', 'US-80', 'US-129', 'US-23']);
    const LAT0 = 32.8 * Math.PI / 180;
    const flat = ([lon, lat]) => [lon * Math.cos(LAT0), lat];

    let counties = null, roads = null, played = false;

    // Planar projection with Macon-Bibb placed low and centered in the slide
    function projector(W, H, bibb) {
        const pts = bibb.flatMap(r => r.map(flat));
        const [x0, x1] = d3.extent(pts, p => p[0]), [y0, y1] = d3.extent(pts, p => p[1]);
        // Wide screens: the text holds the left half, Macon sits in the right half.
        // Narrow screens: the text sits on top, Macon below it.
        const wide = W >= 900;
        const k = wide ? Math.min(0.5 * H / (y1 - y0), 0.36 * W / (x1 - x0)) : Math.min(0.36 * H / (y1 - y0), 0.62 * W / (x1 - x0));
        const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
        const sx = wide ? W * 0.74 : W / 2, sy = wide ? H * 0.54 : H * 0.8;
        return p => { const [x, y] = flat(p); return [sx + k * (x - cx), sy - k * (y - cy)]; };
    }
    const rings = g => g.type === 'Polygon' ? g.coordinates : g.coordinates.flat();
    const line = pts => 'M' + pts.map(p => p.map(v => v.toFixed(1)).join(',')).join('L');

    function draw() {
        if (!counties || !roads) return;
        const W = slide.clientWidth, H = slide.clientHeight;
        svg.attr('viewBox', `0 0 ${W} ${H}`).attr('width', W).attr('height', H).selectAll('*').remove();
        const bibbF = counties.features.find(f => f.properties.name === 'Bibb');
        const proj = projector(W, H, rings(bibbF.geometry));
        const center = proj([d3.mean(rings(bibbF.geometry)[0], p => p[0]), d3.mean(rings(bibbF.geometry)[0], p => p[1])]);

        // Neighbors, very faint, then Macon-Bibb
        svg.append('g').attr('class', 'im-neighbors').selectAll('path')
            .data(counties.features.filter(f => f !== bibbF)).join('path')
            .attr('d', f => rings(f.geometry).map(r => line(r.map(proj)) + 'Z').join(''));
        const bibb = svg.append('path').attr('class', 'im-bibb')
            .attr('d', rings(bibbF.geometry).map(r => line(r.map(proj)) + 'Z').join(''));

        // Roads: each split where it passes closest to Macon, both halves drawn from the far end in
        const halves = [];
        roads.features.forEach(f => {
            const route = f.properties.route;
            const cls = INTERSTATES.has(route) ? 'im-interstate' : US_ROUTES.has(route) ? 'im-us' : null;
            if (!cls) return;
            const parts = f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates;
            parts.forEach(part => {
                const pts = part.map(proj);
                let near = 0;
                pts.forEach((p, i) => { if (Math.hypot(p[0] - center[0], p[1] - center[1]) < Math.hypot(pts[near][0] - center[0], pts[near][1] - center[1])) near = i; });
                const a = pts.slice(0, near + 1), b = pts.slice(near).reverse();
                [a, b].forEach(h => { if (h.length > 1) halves.push({ route, cls, pts: h }); });
            });
        });
        const gRoads = svg.append('g').attr('class', 'im-roads');
        const roadPaths = gRoads.selectAll('path').data(halves).join('path').attr('class', d => d.cls).attr('d', d => line(d.pts));

        // Labels for the two interstates that meet here, out toward the edges
        const labelAt = (route, pick) => {
            // the first point on each half that's inside a ring around Macon: far enough out to read, still on screen
            const options = halves.filter(h => h.route === route)
                .map(h => h.pts.find(q => Math.hypot(q[0] - center[0], q[1] - center[1]) < Math.min(W, H) * 0.42) || h.pts[h.pts.length - 1]);
            return options.length ? options.reduce(pick) : null;
        };
        const labels = [['I-75', (a, b) => (a[1] < b[1] ? a : b)], ['I-16', (a, b) => (a[0] > b[0] ? a : b)]]
            .map(([route, pick]) => ({ route, at: labelAt(route, pick) })).filter(l => l.at);
        const gLabels = svg.append('g').attr('class', 'im-labels').selectAll('g').data(labels).join('g')
            .attr('transform', l => `translate(${l.at[0].toFixed(1)},${l.at[1].toFixed(1)})`);
        gLabels.append('rect').attr('x', -20).attr('y', -10).attr('width', 40).attr('height', 20).attr('rx', 5);
        gLabels.append('text').attr('text-anchor', 'middle').attr('dy', '0.35em').text(l => l.route);

        // The trauma center, rising where it stands
        const [hx, hy] = proj(HOSPITAL);
        const gH = svg.append('g').attr('class', 'im-hospital').attr('transform', `translate(${hx.toFixed(1)},${hy.toFixed(1)})`);
        gH.append('circle').attr('class', 'im-halo').attr('r', 16);
        const bld = gH.append('g').attr('class', 'im-building');
        bld.append('rect').attr('x', -11).attr('y', -22).attr('width', 22).attr('height', 22).attr('rx', 2);
        bld.append('path').attr('class', 'im-cross').attr('d', 'M-2.5,-17h5v4.5h4.5v5h-4.5v4.5h-5v-4.5h-4.5v-5h4.5z');
        gH.append('text').attr('class', 'im-hlabel').attr('x', 18).attr('y', -6).text('Level I trauma center');

        const set = () => svg.classed('is-drawn', true);
        if (played || reduce) { set(); return; }
        // Hidden until it plays: every line waits at the start of its stroke
        const hide = sel => sel.each(function () { const n = this.getTotalLength(); d3.select(this).attr('stroke-dasharray', `${n} ${n}`).attr('stroke-dashoffset', n); });
        hide(bibb); hide(roadPaths);
        draw.play = () => {
            played = true;
            const ease = d3.easeCubicInOut;
            bibb.transition().duration(1200).ease(ease).attr('stroke-dashoffset', 0);
            roadPaths.transition().delay(d => d.cls === 'im-interstate' ? 600 + Math.random() * 300 : 1400 + Math.random() * 400)
                .duration(d => d.cls === 'im-interstate' ? 1400 : 1100).ease(ease).attr('stroke-dashoffset', 0);
            setTimeout(set, 2300);   // labels, then the hospital rises (css)
        };
    }

    Promise.all([d3.json('data/counties.geojson'), d3.json('data/major-highways.geojson')]).then(([c, r]) => {
        counties = c; roads = r;
        draw();
        if (reduce) return;
        const io = new IntersectionObserver(entries => {
            if (!entries.some(e => e.isIntersecting)) return;
            io.disconnect();
            if (draw.play) draw.play();
        }, { threshold: 0.5 });
        io.observe(slide);
    }).catch(err => console.error('Jobs map failed to load', err));
    let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(draw, 250); });
})();
