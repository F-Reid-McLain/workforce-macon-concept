/* ===== JOBS TITLE SLIDE MAP — homepage =====
   Behind "Registered nurses are Macon-Bibb's most common job": Macon-Bibb, its
   interstates and US routes drawing in (js/intro-map.js), then the region's Level I
   trauma center (Atrium Health Navicent The Medical Center, 777 Hemlock St) rising
   where it stands. On wide screens the headline holds the left half and Macon the
   right; on phones the headline sits on top and Macon below it. */
(function () {
    'use strict';
    const svgEl = document.getElementById('jobs-intro-map');
    if (!svgEl || !window.WFIntroMap) return;
    const HOSPITAL = [-83.6363, 32.8366];

    WFIntroMap.create({
        svg: svgEl,
        drawMs: 3000,
        base: { neighbors: [0, 0.3], bibb: [0.08, 0.4], ints: [0.3, 0.6], us: [0.5, 0.8], shields: [0.65, 0.75] },
        fit: (W, H, wide) => wide ? { x: W * 0.74, y: H * 0.54, w: 0.36, h: 0.5 } : { x: W / 2, y: H * 0.8, w: 0.62, h: 0.36 },
        layer({ svg, proj }) {
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
            return (p, stage) => {
                const rise = d3.easeBackOut.overshoot(1.4)(stage(0.75, 0.93));
                bld.attr('transform', `scale(1, ${Math.max(0.001, rise).toFixed(3)})`).style('opacity', stage(0.74, 0.79));
                halo.style('opacity', stage(0.88, 0.97));
                hLabel.style('opacity', stage(0.9, 1));
            };
        },
    });
})();
