/* ===== JOBS TITLE SLIDE MAP — homepage =====
   Behind "Registered nurses are Macon-Bibb's most common job": Macon-Bibb, its
   interstates and US routes drawing in (js/intro-map.js), then the region's Level I
   trauma center (Atrium Health Navicent The Medical Center, 777 Hemlock St) rising
   where it stands, after the region's other hospitals appear as smaller buildings
   (whichever fall inside the map). On wide screens the headline holds the left half
   and Macon the right; on phones the headline has a screen of its own, then Macon
   fills the next. */
(function () {
    'use strict';
    const svgEl = document.getElementById('jobs-intro-map');
    if (!svgEl || !window.WFIntroMap) return;
    const HOSPITAL = [-83.6363, 32.8366];
    // The region's other general hospitals: CMS Hospital General Information (2025), placed
    // by the Census Bureau's geocoder from each address (Putnam General from OpenStreetMap,
    // where the geocoder matched the wrong street). Atrium Health Navicent Peach (Byron) is
    // left out: neither could place it. Macon's are named; elsewhere, the town.
    const OTHERS = [
        { at: [-83.61802, 32.84593], name: 'Piedmont Macon' },
        { at: [-83.69331, 32.86758], name: 'Piedmont Macon North' },
        { at: [-83.62952, 32.61815], name: 'Warner Robins' },
        { at: [-83.94643, 33.03202], name: 'Forsyth' },
        { at: [-83.24509, 33.08845], name: 'Milledgeville' },
        { at: [-83.34684, 32.38383], name: 'Cochran' },
        { at: [-84.33623, 32.88719], name: 'Thomaston' },
        { at: [-83.68678, 33.31384], name: 'Monticello' },
        { at: [-83.97843, 33.30353], name: 'Jackson' },
        { at: [-83.37141, 33.33526], name: 'Eatonton' },
    ];

    // Each hospital's name goes to whichever side (right, left, above, below, then the corners) stays on the map and
    // clear of the trauma center, the key and the names already placed; with no room, it goes unnamed
    function placeLabels(svgNode, obstacles, labels) {
        const box = svgNode.getBoundingClientRect(), pad = 4;
        const hit = (a, b) => a.left < b.right + 2 && a.right > b.left - 2 && a.top < b.bottom + 2 && a.bottom > b.top - 2;
        const taken = obstacles.map(n => n.getBoundingClientRect());
        const SIDES = [[10, -4, 'start'], [-10, -4, 'end'], [0, -17, 'middle'], [0, 14, 'middle'],
                       [8, 14, 'start'], [-8, 14, 'end'], [8, -17, 'start'], [-8, -17, 'end']];
        labels.each(function () {
            const t = d3.select(this);
            const ok = SIDES.find(([x, y, a]) => {
                t.attr('x', x).attr('y', y).attr('text-anchor', a);
                const r = this.getBoundingClientRect();
                return r.left >= box.left + pad && r.right <= box.right - pad && r.top >= box.top + pad && r.bottom <= box.bottom - pad && !taken.some(o => hit(r, o));
            });
            if (ok) taken.push(this.getBoundingClientRect()); else t.attr('display', 'none');
        });
    }

    WFIntroMap.create({
        svg: svgEl,
        drawMs: 3000,
        base: { neighbors: [0, 0.3], bibb: [0.08, 0.4], ints: [0.3, 0.6], us: [0.5, 0.8], shields: [0.65, 0.75] },
        // phones: zoomed in with the hospital a little left of the middle (its label runs to the right)
        fit: (W, H, wide) => wide ? { x: W * 0.74, y: H * 0.54, w: 0.36, h: 0.5 } : { x: W * (W < 360 ? 0.32 : 0.4), y: H * 0.52, w: 1.5, h: 1.1, at: HOSPITAL },
        shieldReach: wide => wide ? 0.42 : 0.8,   // phones: out toward the edges, clear of the hospital
        layer({ svg, proj, wide, W, H }) {
            // The other hospitals: a small building with a red cross where each stands (only those
            // the map shows, clear of its edges), under the trauma center so it stays on top
            const k = wide ? 1 : 1.15;
            const others = OTHERS.map(o => ({ ...o, xy: proj(o.at) }))
                .filter(o => o.xy[0] > (wide ? W * 0.5 : 20) && o.xy[0] < W - 20 && o.xy[1] > 40 && o.xy[1] < H - 40);   // (wide: the headline holds the left half)
            const gO = svg.append('g').attr('class', 'im-others');
            const og = gO.selectAll('g').data(others).join('g').attr('class', 'im-other')
                .attr('transform', o => `translate(${o.xy[0].toFixed(1)},${o.xy[1].toFixed(1)}) scale(${k})`);
            og.append('circle').attr('class', 'im-ospot').attr('r', 2.4);
            const ob = og.append('g').attr('class', 'im-obuild');
            ob.append('rect').attr('class', 'im-obody').attr('x', -7).attr('y', -13).attr('width', 14).attr('height', 13).attr('rx', 1.2);
            ob.append('path').attr('class', 'im-ocross').attr('d', 'M-1.3,-11h2.6v2.6h2.6v2.6h-2.6v2.6h-2.6v-2.6h-2.6v-2.6h2.6z');
            const oLabel = og.append('text').attr('class', 'im-olabel').attr('x', 10).attr('y', -4).text(o => o.name);
            // A key, once there's more than one kind on the map
            const key = svg.append('g').attr('class', 'im-key').attr('transform', wide ? `translate(${(W * 0.56).toFixed(1)},${(H - 64).toFixed(1)})` : `translate(16,${(H * 0.12 + 14).toFixed(1)})`);
            const kt = key.append('g');
            kt.append('rect').attr('class', 'im-badge').attr('x', -5).attr('y', -9).attr('width', 10).attr('height', 10).attr('rx', 5);
            kt.append('text').attr('class', 'im-keytext').attr('x', 11).attr('y', 0).text('Level I trauma center');
            const ko = key.append('g').attr('transform', 'translate(0,18)');
            ko.append('rect').attr('class', 'im-obody').attr('x', -5).attr('y', -9).attr('width', 10).attr('height', 10).attr('rx', 1);
            ko.append('path').attr('class', 'im-ocross').attr('d', 'M-1,-7.6h2v2h2v2h-2v2h-2v-2h-2v-2h2z');
            ko.append('text').attr('class', 'im-keytext').attr('x', 11).attr('y', 0).text('Hospital');
            if (!others.length) key.remove();

            // The trauma center stands on its spot (a small marker at its real location) and rises above the road
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
            // phones: thumb-sized (a little less on narrow ones, so the hospitals beside it keep room for their names)
            if (!wide) gH.attr('transform', `translate(${hx.toFixed(1)},${hy.toFixed(1)}) scale(${W < 380 ? 1.2 : 1.45})`);
            const hLabel = gH.append('text').attr('class', 'im-hlabel').attr('x', 28).attr('y', -30).text('Level I trauma center');
            placeLabels(svg.node(), [bld.node(), hLabel.node(), key.node()], oLabel);   // (the building and its name, not its glow)
            return (p, stage) => {
                // the other hospitals pop up one after another, just before the trauma center rises
                og.each(function (o, i) {
                    const t = stage(0.6 + i * 0.012, 0.7 + i * 0.012);
                    d3.select(this).select('.im-obuild').attr('transform', `scale(${Math.max(0.001, d3.easeBackOut(t)).toFixed(3)})`).style('opacity', t > 0 ? 1 : 0);
                    d3.select(this).select('.im-ospot').style('opacity', t > 0 ? 1 : 0);
                });
                oLabel.style('opacity', stage(0.72, 0.82));
                key.style('opacity', stage(0.9, 1));
                const rise = d3.easeBackOut.overshoot(1.4)(stage(0.75, 0.93));
                bld.attr('transform', `scale(1, ${Math.max(0.001, rise).toFixed(3)})`).style('opacity', stage(0.74, 0.79));
                halo.style('opacity', stage(0.88, 0.97));
                hLabel.style('opacity', stage(0.9, 1));
            };
        },
    });
})();
