/* ===== YOUR COUNTY — homepage stop 4 =====
   Pick any of Macon-Bibb's 16 neighbors (on the map or from the list) to see
   how the two trade workers: jobs in Macon-Bibb held by the county's residents,
   Macon-Bibb residents working there, what those jobs pay, and the county's
   overall commuting balance. Dots stream along the route while it's on screen,
   one for roughly every 150 jobs, gold-to-teal by pay band like the story's.
   The map shades each county by the share of its residents' jobs that are in
   Macon-Bibb.

   Data: data/commute-region.json (LODES 2023 flows and pay bands, county
   shapes), data/Net Commuting LODES.csv, data/Population By County.csv (ACS 2024).
   Shared helpers (links, idle demo, count-ups) come from js/lookups.js. */
(function () {
    'use strict';
    if (!window.d3 || !window.WFTools) return;
    const T = window.WFTools;
    const BIBB = '13021';
    const reduce = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
    const fmt = n => Math.round(n).toLocaleString();
    const pct = v => Math.round(100 * v) + '%';
    const PAY = ['#a0aabe', '#f2c46b', '#2dd4bf'];   // ≤ $1,250 · $1,251–3,333 · > $3,333 a month (as in the story)
    const JOBS_PER_DOT = 150;

    const stop = document.getElementById('counties');
    const wrap = stop && stop.querySelector('.cty-map-wrap');
    if (!wrap) return;
    const svg = d3.select('#cty-map'), tip = wrap.querySelector('.cty-tip');
    const select = document.getElementById('cty-select'), card = document.getElementById('cty-card');
    const f5 = v => String(v).padStart(5, '0');

    Promise.all([
        d3.json('data/commute-region.json'),
        d3.csv('data/Net Commuting LODES.csv'),
        d3.csv('data/Population By County.csv'),
    ]).then(([region, netRows, popRows]) => {
        const net = new Map(netRows.map(r => [f5(r.FIPS), { net: +r.NetCommuting, jobs: +r.JobsLocatedHere, res: +r.EmployedResidents }]));
        const pop = new Map(popRows.map(r => [f5(r.FIPS), +String(r.Population).replace(/,/g, '')]));
        const flow = (a, b) => region.flows.find(f => f.from === a && f.to === b) || { jobs: 0, pay: [0, 0, 0] };
        const counties = region.counties.map(c => {
            const i = flow(c.fips, BIBB), o = flow(BIBB, c.fips), n = net.get(c.fips) || {};
            const short = c.name.replace(/ County$/, '');
            return { fips: c.fips, name: c.fips === BIBB ? 'Macon-Bibb' : short + ' County', short: c.fips === BIBB ? 'Macon-Bibb' : short,
                     rings: c.rings, in: i.jobs, pay: i.pay, out: o.jobs, net: n.net, jobs: n.jobs, res: n.res, pop: pop.get(c.fips),
                     share: n.res ? i.jobs / n.res : 0 };
        });
        const bibb = counties.find(c => c.fips === BIBB);
        const neighbors = counties.filter(c => c !== bibb);
        const totalIn = d3.sum(neighbors, c => c.in);

        // ----- Title slide -----
        const top = d3.greatest(neighbors, c => c.share);
        const totalEl = document.getElementById('cty-total'), find = document.getElementById('find-county');
        if (totalEl) totalEl.textContent = fmt(totalIn);
        if (find) find.innerHTML = `In <em>${top.name}</em>, <em>${pct(top.share)}</em> of the jobs residents hold are in <span class="nw">Macon-Bibb</span>.`;

        // ----- The list (alphabetical, so people can find their own county) -----
        select.innerHTML = neighbors.slice().sort((a, b) => a.name.localeCompare(b.name))
            .map(c => `<option value="${c.fips}">${c.name}: ${fmt(c.in)} jobs in Macon-Bibb</option>`).join('');

        // ----- Map -----
        const lat0 = d3.mean(counties.flatMap(c => c.rings.flat()), p => p[1]) * Math.PI / 180;
        const flat = c => ({ type: 'Feature', id: c.fips, geometry: { type: 'MultiPolygon',
            coordinates: c.rings.map(r => [r.map(p => [p[0] * Math.cos(lat0), p[1]])]) } });
        const features = counties.map(flat);
        const shade = d3.scaleSqrt().domain([0, d3.max(neighbors, c => c.share)]).range([0.06, 0.62]);
        const gMap = svg.append('g'), gFlow = svg.append('g').attr('class', 'cty-flows'), gLabel = svg.append('g').attr('class', 'cty-labels');
        let path = null, W = 0, H = 0, centers = new Map();

        function layout() {
            W = Math.max(280, wrap.clientWidth);
            H = Math.round(W < 560 ? W * 0.9 : Math.max(300, Math.min(W * 0.8, innerHeight - 250)));
            svg.attr('viewBox', `0 0 ${W} ${H}`).attr('width', W).attr('height', H);
            const proj = d3.geoIdentity().reflectY(true).fitExtent([[8, 8], [W - 8, H - 8]], { type: 'FeatureCollection', features });
            path = d3.geoPath(proj);
            counties.forEach((c, k) => {
                // Label and route from the largest piece of each county
                const biggest = d3.greatest(features[k].geometry.coordinates, poly => Math.abs(d3.polygonArea(poly[0])));
                centers.set(c.fips, path.centroid({ type: 'Polygon', coordinates: biggest }));
            });
            gMap.selectAll('path').data(counties, c => c.fips).join(enter => enter.append('path')
                    .attr('class', c => 'cty' + (c === bibb ? ' cty--bibb' : ''))
                    .attr('tabindex', c => c === bibb ? null : 0).attr('role', c => c === bibb ? 'img' : 'button')
                    .attr('aria-label', c => c === bibb ? 'Macon-Bibb' : `${c.name}: ${fmt(c.in)} jobs in Macon-Bibb`)
                    .on('mouseenter focus', (e, c) => showTip(c)).on('mouseleave blur', hideTip)
                    .on('click', (e, c) => { if (c !== bibb) choose(c, true); })
                    .on('keydown', (e, c) => { if ((e.key === 'Enter' || e.key === ' ') && c !== bibb) { e.preventDefault(); choose(c, true); } }))
                .attr('d', c => path(features[counties.indexOf(c)]))
                .style('--shade', c => c === bibb ? null : shade(c.share));
            gLabel.selectAll('text').data(counties, c => c.fips).join('text')
                .attr('class', c => c === bibb ? 'is-bibb' : null)
                .attr('x', c => centers.get(c.fips)[0]).attr('y', c => centers.get(c.fips)[1])
                .text(c => W < 420 && c !== bibb ? '' : c.short);
            if (current) route(current);
        }

        // ----- Dots along the route -----
        let dots = [], A = null, B = null, C1 = null, C2 = null, raf = null, onScreen = false;
        const bez = (p, c, q, u) => [(1 - u) * (1 - u) * p[0] + 2 * (1 - u) * u * c[0] + u * u * q[0], (1 - u) * (1 - u) * p[1] + 2 * (1 - u) * u * c[1] + u * u * q[1]];
        function route(c) {
            A = centers.get(c.fips); B = centers.get(BIBB);
            const dx = B[0] - A[0], dy = B[1] - A[1], len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len, bend = Math.min(70, len * 0.38);
            const mid = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
            C1 = [mid[0] + nx * bend, mid[1] + ny * bend];   // in to Macon-Bibb on one side…
            C2 = [mid[0] - nx * bend, mid[1] - ny * bend];   // …out to the county on the other
            const nIn = Math.max(3, Math.min(72, Math.round(c.in / JOBS_PER_DOT))), nOut = c.out ? Math.max(1, Math.min(40, Math.round(c.out / JOBS_PER_DOT))) : 0;
            // Pay bands spread across the incoming dots in proportion to the real mix
            const cum = d3.cumsum(c.pay), tot = cum[2] || 1;
            const bandAt = u => cum.findIndex(v => u * tot < v);
            dots = d3.range(nIn).map(i => ({ dir: 1, phase: i / nIn, color: PAY[Math.max(0, bandAt((i + 0.5) / nIn))] }))
                .concat(d3.range(nOut).map(i => ({ dir: -1, phase: i / nOut + 0.013, color: '#e8ecf3' })));
            gFlow.selectAll('path').data([C1, C2]).join('path').attr('class', (d, k) => k ? 'cty-route cty-route--out' : 'cty-route')
                .attr('d', (cp, k) => k ? `M${B}Q${cp} ${A}` : `M${A}Q${cp} ${B}`);
            gFlow.selectAll('circle').data(dots).join('circle').attr('r', d => d.dir > 0 ? 2.4 : 2).attr('fill', d => d.color);
            draw(performance.now());
            wake();
        }
        function draw(now) {
            const t = reduce ? 0 : now / 1000 * 0.16;
            gFlow.selectAll('circle').each(function (d) {
                const u = (d.phase + t) % 1;
                const p = d.dir > 0 ? bez(A, C1, B, u) : bez(B, C2, A, u);
                this.setAttribute('cx', p[0].toFixed(1)); this.setAttribute('cy', p[1].toFixed(1));
                this.setAttribute('opacity', (Math.sin(Math.PI * u) * 0.9 + 0.1).toFixed(2));
            });
        }
        const frame = now => { raf = null; draw(now); if (onScreen && !reduce) raf = requestAnimationFrame(frame); };
        const wake = () => { if (onScreen && !reduce && !raf && dots.length) raf = requestAnimationFrame(frame); };
        new IntersectionObserver(es => { onScreen = es.some(e => e.isIntersecting); wake(); }, { threshold: 0.1 }).observe(wrap);

        // ----- Hover detail -----
        function showTip(c) {
            tip.innerHTML = c === bibb
                ? `<b>Macon-Bibb</b><span>${fmt(bibb.jobs)} jobs here · ${fmt(totalIn)} held by people from its neighbors</span>`
                : `<b>${c.name}</b><span>${fmt(c.in)} jobs in Macon-Bibb · ${pct(c.share)} of its residents' jobs</span>`;
            const p = centers.get(c.fips), s = svg.node().getBoundingClientRect().width / W || 1;
            tip.style.transform = `translate(${Math.round(p[0] * s)}px, ${Math.round(p[1] * s - 14)}px) translate(-50%, -100%)`;
            tip.classList.add('is-on');
        }
        function hideTip() { tip.classList.remove('is-on'); }

        // ----- The card -----
        card.innerHTML = `<h4></h4>
            <div class="cty-big"><b data-k="in" data-f="int"></b><span>jobs in <span class="nw">Macon-Bibb</span> are held by <span data-name></span> residents</span></div>
            <div class="cty-share"><div class="cty-share__bar"><i></i></div><span data-share></span></div>
            <dl class="tool-stats">
                <div><dt>Reverse commute</dt><dd data-k="out" data-f="int"></dd></div>
                <div><dt>Net, all places</dt><dd data-net></dd></div>
                <div><dt>Residents</dt><dd data-k="pop" data-f="int"></dd></div>
                <div><dt>Jobs located there</dt><dd data-k="jobs" data-f="int"></dd></div>
            </dl>
            <div class="cty-pay">
                <p class="cty-pay__title">What its residents' Macon-Bibb jobs pay a month</p>
                <div class="cty-pay__bar">${PAY.map((c, k) => `<i style="background:${c}" data-band="${k}"></i>`).join('')}</div>
                <div class="cty-pay__key">${region.payBands.map((b, k) => `<span><i style="background:${PAY[k]}"></i>${b.replace('/month', '')}</span>`).join('')}</div>
                <p class="cty-pay__vs" data-vs></p>
            </div>`;
        const last = {}, localOver = region.localPay[2] / d3.sum(region.localPay);
        let current = null;
        function choose(c, byUser) {
            const changed = current !== c;
            current = c;
            select.value = c.fips;
            gMap.selectAll('path').classed('is-on', d => d === c);
            card.querySelector('h4').textContent = c.name;
            card.querySelector('[data-name]').textContent = c.name;
            ['in', 'out', 'pop', 'jobs'].forEach(k => { card.querySelector(`[data-k="${k}"]`).dataset.num = c[k] || 0; });
            T.countIn(card, last);
            card.querySelector('.cty-share__bar i').style.width = pct(c.share);
            card.querySelector('[data-share]').innerHTML = `<b>${pct(c.share)}</b> of all jobs held by ${c.name} residents`;
            const n = card.querySelector('[data-net]');
            n.textContent = c.net < 0 ? `${fmt(-c.net)} more workers than jobs` : `${fmt(c.net)} more jobs than workers`;
            n.className = c.net < 0 ? 'is-down' : 'is-up';
            const tot = d3.sum(c.pay) || 1;
            card.querySelectorAll('.cty-pay__bar i').forEach((el, k) => { el.style.width = (100 * c.pay[k] / tot).toFixed(1) + '%'; });
            const over = c.pay[2] / tot;
            card.querySelector('[data-vs]').innerHTML = `<b>${pct(over)}</b> pay more than $3,333 a month, compared with ${pct(localOver)} of jobs held by people who live and work in Macon-Bibb.`;
            if (changed) T.swap(card);
            route(c);
            if (byUser) T.remember('counties', c.name);
        }
        select.addEventListener('change', () => choose(neighbors.find(c => c.fips === select.value), true));

        layout();
        choose(d3.greatest(neighbors, c => c.in));
        let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(layout, 200); });
        T.register('counties', s => { const c = neighbors.find(c => T.slug(c.name) === s || T.slug(c.short) === s); if (c) choose(c); return !!c; });
        // Idle demo: the county most tied to Macon-Bibb, the next, then back to the biggest flow
        const byShare = neighbors.slice().sort((a, b) => b.share - a.share);
        T.attract(stop, [() => choose(byShare[0]), () => choose(byShare[1]), () => choose(d3.greatest(neighbors, c => c.in))]);
    }).catch(err => console.error('County explorer failed to load', err));
})();
