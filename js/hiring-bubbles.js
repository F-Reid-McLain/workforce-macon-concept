/* ===== HIRING BUBBLES — homepage stop 4 =====
   The employers with the most active online job ads (March 2026 snapshot),
   as bubbles sized by their ads: area is proportional to the count. They
   fall in the first time the stop shows, then drift gently; hover, focus or
   tap one for its detail. js/lookups.js drives it (switch, filter, demo):

     WFBubbles.mount(wrap, rows, totalAds)   rows: [{ label, value }]
     WFBubbles.filter(q)                     dims the bubbles that don't match
     WFBubbles.pulse(k)                      lights the k-th largest for a moment
     WFBubbles.show(on)                      pauses the drift while hidden */
(function () {
    'use strict';
    if (!window.d3) return;
    const reduce = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
    const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    // Kind of employer, from its name (health systems and medical staffing; schools; everyone else)
    const KINDS = [
        { key: 'health', label: 'Health care', color: '#2dd4bf', test: /health|medical|amergis|river edge|chsga|cynet/i },
        { key: 'edu',    label: 'Education',   color: '#8fa6f0', test: /university|higher ed|education/i },
        { key: 'other',  label: 'Everyone else', color: '#f2c46b', test: () => true },
    ];
    const kindOf = name => KINDS.find(k => typeof k.test === 'function' ? k.test(name) : k.test.test(name));

    let sim = null, nodes = [], svg = null, tip = null, wrapEl = null, visible = false, onScreen = false, built = false;
    let total = 0, W = 0, H = 0, pinned = null;

    function mount(wrap, rows, totalAds) {
        wrapEl = wrap; total = totalAds;
        svg = d3.select(wrap).select('svg');
        tip = wrap.querySelector('.bubble-tip');
        const legend = wrap.querySelector('.bubble-legend');
        if (legend) legend.innerHTML = KINDS.map(k => `<span><i style="background:${k.color}"></i>${k.label}</span>`).join('');
        nodes = rows.map((r, i) => ({ ...r, i, kind: kindOf(r.label), phase: i * 1.7 }));
        layout();
        new IntersectionObserver(es => { onScreen = es.some(e => e.isIntersecting); wake(); }, { threshold: 0.2 }).observe(wrap);
        let t, lastH = innerHeight;
        addEventListener('resize', () => { clearTimeout(t); t = setTimeout(() => { if (Math.abs(wrap.clientWidth - W) > 40 || Math.abs(innerHeight - lastH) > 40) { lastH = innerHeight; layout(); } }, 250); });
    }

    // Size the bubbles so they fill about half the box: area stays proportional to job ads
    function layout() {
        // On wide screens the field takes what's left of one screen under the controls
        W = Math.max(280, wrapEl.clientWidth); H = W < 560 ? Math.round(W * 1.05) : Math.round(Math.max(260, Math.min(520, W * 0.55, innerHeight - 380)));
        svg.attr('viewBox', `0 0 ${W} ${H}`).attr('width', W).attr('height', H);
        const k = Math.sqrt(0.4 * W * H / (Math.PI * d3.sum(nodes, d => d.value)));
        nodes.forEach(d => {
            d.r = Math.sqrt(d.value) * k;
            if (d.x === undefined) { const a = d.i * 2.4, s = 12 + d.i * 3; d.x = W / 2 + Math.cos(a) * s; d.y = H / 2 + Math.sin(a) * s; }
        });

        const g = svg.selectAll('g.bubble').data(nodes, d => d.label).join(enter => {
            const b = enter.append('g').attr('class', 'bubble').attr('tabindex', 0).attr('role', 'button')
                .attr('aria-label', d => `${d.label}: ${d.value} active job ads`);
            const body = b.append('g').attr('class', 'bubble__body');
            body.append('circle');
            body.append('text').attr('class', 'bubble__name');
            body.append('text').attr('class', 'bubble__num');
            b.on('mouseenter focus', (e, d) => showTip(d)).on('mouseleave blur', (e, d) => { if (pinned !== d) hideTip(); })
             .on('click', (e, d) => { pinned = pinned === d ? null : d; pinned ? showTip(d) : hideTip(); })
             .on('keydown', (e, d) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pinned = d; showTip(d); } });
            return b;
        });
        g.select('circle').attr('r', d => d.r).attr('fill', d => d.kind.color);
        // Names inside the bubbles that have room; the count underneath
        g.select('.bubble__name').attr('dy', '-0.15em').style('font-size', d => Math.min(14, d.r / 3.1) + 'px')
            .text(d => d.r < 24 ? '' : fit(d.label, d.r));
        g.select('.bubble__num').attr('dy', d => d.r < 24 ? '0.35em' : '1.05em').style('font-size', d => Math.max(10, Math.min(15, d.r / 2.8)) + 'px')
            .text(d => d.r < 13 ? '' : d.value);

        if (sim) sim.stop();
        sim = d3.forceSimulation(nodes)
            .force('x', d3.forceX(W / 2).strength(0.045))
            .force('y', d3.forceY(H / 2).strength(W < 560 ? 0.05 : 0.09))
            .force('collide', d3.forceCollide(d => d.r + 2).iterations(3))
            .alphaDecay(0.03).on('tick', tick).stop();
        // Settle the layout before anyone sees it, so the bubbles pop in already in place
        for (let i = 0; i < (reduce || W < 560 ? 260 : 160); i++) sim.tick();
        tick();
        if (reduce || W < 560) { built = true; svg.classed('is-built', true); return; }
        sim.alpha(0.05);
        wake();
    }

    const fit = (name, r) => {
        const max = Math.max(4, Math.floor(r * 1.8 / (Math.min(14, r / 3.1) * 0.62)));
        const clean = name.replace(/, Inc\.$/, '').replace(/^Education, Georgia Department of - /, '');
        return clean.length <= max ? clean : clean.slice(0, max - 1).trim() + '…';
    };

    // A slow sideways sway on top of the layout, so the field never sits quite still
    function tick() {
        const t = performance.now() / 1000;
        svg.selectAll('g.bubble').attr('transform', d => {
            const sx = reduce ? 0 : Math.sin(t * 0.5 + d.phase) * 1.6, sy = reduce ? 0 : Math.cos(t * 0.43 + d.phase) * 1.6;
            d.x = Math.max(d.r, Math.min(W - d.r, d.x)); d.y = Math.max(d.r, Math.min(H - d.r, d.y));
            return `translate(${(d.x + sx).toFixed(1)},${(d.y + sy).toFixed(1)})`;
        });
        if (pinned || tip.classList.contains('is-on')) placeTip(tip._d);
    }

    // Drift only while the bubbles are on screen and their view is showing
    function wake() {
        if (!sim || reduce || W < 560) return;
        if (visible && onScreen) {
            if (!built) { built = true; svg.classed('is-built', true); }
            sim.alphaTarget(0.012).restart();
        } else sim.stop();
    }

    function showTip(d) {
        tip._d = d;
        tip.innerHTML = `<b>${esc(d.label)}</b><span>${d.value} active job ads · ${(100 * d.value / total).toFixed(1)}% of all ${total.toLocaleString()}</span>`;
        tip.classList.add('is-on');
        svg.selectAll('g.bubble').classed('is-hot', n => n === d);
        placeTip(d);
    }
    function hideTip() { tip.classList.remove('is-on'); svg.selectAll('g.bubble').classed('is-hot', false); }
    function placeTip(d) {
        if (!d) return;
        const s = svg.node().getBoundingClientRect().width / W || 1;
        tip.style.transform = `translate(${Math.round(d.x * s)}px, ${Math.round((d.y - d.r) * s - 10)}px) translate(-50%, -100%)`;
    }

    window.WFBubbles = {
        mount,
        filter(q) {
            q = (q || '').trim().toLowerCase();
            svg.selectAll('g.bubble').classed('is-dim', d => !!q && !d.label.toLowerCase().includes(q));
            return nodes.filter(d => !q || d.label.toLowerCase().includes(q)).length;
        },
        pulse(k) {
            const d = nodes[k]; if (!d) return;
            showTip(d);
            setTimeout(() => { if (tip._d === d && pinned !== d) hideTip(); }, 1400);
        },
        show(on) { visible = on; wake(); if (!on) { pinned = null; hideTip(); } },
    };
})();
