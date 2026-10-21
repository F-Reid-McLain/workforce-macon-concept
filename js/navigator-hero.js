/* ===== HERO ANIMATION — Workforce Navigator =====
   Shows off the ecosystem map in the page's banner:
   1. Build-in, once the banner is on screen: the hub appears, its six kinds of help
      sprout, then every organization blooms out along its link, while the counts
      beside the headline tick up.
   2. Tour: the banner then drifts from one kind of help to the next, lighting its
      organizations and naming a few in the caption, and loops while left alone.
      Any click, key, scroll, touch or hover over the banner ends the tour and
      hands the map back; so does filtering the programs below.
   The map sits a little closer than a plain fit so its dots read at banner size.
   Off with reduced motion (the map simply appears) and in map-only embeds.
   Uses the map's globals from js/viz-engine.js (nodeSelection, linkSelection, svg,
   zoom, workforceData, computeFitTransform, isNodeVisible) and window.WFMap. */
(function () {
    'use strict';
    if (document.body.classList.contains('embed-mode') || !window.d3) return;
    const hero = document.querySelector('.nav-hero');
    if (!hero) return;
    const reduce = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
    if (!reduce) window.WFHeroReveal = true;   // the map engine leaves the reveal to us
    const phone = () => window.innerWidth <= 768;
    const note = document.getElementById('minimap-note');
    const DEFAULT_NOTE = note ? note.textContent : '';
    const CLOSER = 1.15;   // how much nearer than a plain fit the banner sits
    const KINDS = {
        'job-training': 'Job training & career services', 'colleges': 'Colleges & universities',
        'community-dev': 'Community & economic development', 'k12-secondary': 'K-12 & career academies',
        'special-population': 'Special populations & re-entry', 'faith-based': 'Faith-based & community',
    };
    const TOUR_ORDER = ['job-training', 'colleges', 'k12-secondary', 'community-dev', 'special-population', 'faith-based'];
    const STEP = 4800, FLY = 1600;

    const mapSize = () => {
        const vb = (svg.attr('viewBox') || '').split(/\s+/).map(Number);
        return [vb[2] || hero.clientWidth, vb[3] || hero.clientHeight];
    };
    // A plain fit, brought a little closer around the middle
    function restTransform() {
        const [W, H] = mapSize(), fit = computeFitTransform(W, H);
        const k = fit.k * CLOSER;
        return d3.zoomIdentity.translate(CLOSER * (fit.x - W / 2) + W / 2, CLOSER * (fit.y - H / 2) + H / 2).scale(k);
    }
    const settle = (ms = 900) => svg.transition().duration(ms).ease(d3.easeCubicInOut).call(zoom.transform, restTransform());

    // ----- 1. Build-in -----
    function countUp() {
        document.querySelectorAll('#hero-stats b[data-n]').forEach(b => {
            const to = +b.dataset.n;
            if (reduce) { b.textContent = to.toLocaleString(); return; }
            const t = d3.timer(e => { const k = Math.min(1, e / 1900); b.textContent = Math.round(to * d3.easeCubicOut(k)).toLocaleString(); if (k >= 1) t.stop(); });
        });
    }
    function buildIn(done) {
        const depth = d => d.type === 'hub' ? 0 : d.type === 'major-group' ? 1 : 2;
        // Organizations bloom in order around the hub, kind by kind
        const assets = workforceData.nodes.filter(d => d.type === 'asset');
        const hub = workforceData.nodes.find(d => d.type === 'hub') || { x: 0, y: 0 };
        assets.sort((a, b) => Math.atan2(a.y - hub.y, a.x - hub.x) - Math.atan2(b.y - hub.y, b.x - hub.x));
        const order = new Map(assets.map((d, i) => [d.id, i]));
        const nodeDelay = d => depth(d) === 0 ? 0 : depth(d) === 1 ? 500 + TOUR_ORDER.indexOf(d.id) * 110 : 1250 + order.get(d.id) * 45;
        nodeSelection.transition().delay(nodeDelay).duration(480).ease(d3.easeCubicOut).style('opacity', d => isNodeVisible(d) ? 1 : 0);
        // Links draw outward from the hub just ahead of the node at their far end
        linkSelection.each(function (l) {
            const len = this.getTotalLength ? this.getTotalLength() : 200;
            const far = depth(l.source) > depth(l.target) ? l.source : l.target;
            d3.select(this).style('opacity', (isNodeVisible(l.source) && isNodeVisible(l.target)) ? 1 : 0)
                .attr('stroke-dasharray', `${len} ${len}`).attr('stroke-dashoffset', len)
                .transition().delay(Math.max(0, nodeDelay(far) - 260)).duration(420).ease(d3.easeCubicOut).attr('stroke-dashoffset', 0)
                .on('end', function () { d3.select(this).attr('stroke-dasharray', null).attr('stroke-dashoffset', null); });
        });
        countUp();
        setTimeout(done, 1250 + assets.length * 45 + 600);
    }

    // ----- 2. Tour -----
    let touring = false, stopped = false, timers = [];
    const later = (fn, ms) => timers.push(setTimeout(fn, ms));
    function clusterTransform(kind) {
        const [W, H] = mapSize();
        const members = workforceData.nodes.filter(d => d.id === kind || d.category === kind);
        // Room for the labels that hang below each dot and run wider than it
        const x0 = d3.min(members, d => d.x - d.size - 80), x1 = d3.max(members, d => d.x + d.size + 80);
        const y0 = d3.min(members, d => d.y - d.size - 50), y1 = d3.max(members, d => d.y + d.size + 60);
        const k = Math.min(1.8, 0.82 * Math.min(W / (x1 - x0), H / (y1 - y0)));
        return d3.zoomIdentity.translate(W / 2 - k * (x0 + x1) / 2, H / 2 - k * (y0 + y1) / 2).scale(k);
    }
    function caption(kind) {
        const orgs = workforceData.nodes.filter(d => d.type === 'asset' && d.category === kind);
        const named = orgs.filter(d => !d.placeholder).slice(0, 2).map(d => d.name);
        const incl = named.length === 2 ? `, including ${named[0]} and ${named[1]}` : named.length ? `, including ${named[0]}` : '';
        return `${KINDS[kind] || kind}: ${orgs.length} organization${orgs.length === 1 ? '' : 's'}${incl}.`;
    }
    function tour(i = 0) {
        if (stopped) return;
        touring = true;
        if (i >= TOUR_ORDER.length) {   // back to the whole picture, then around again
            if (window.WFMap) WFMap.highlight(null);
            settle(1400);
            if (note) note.textContent = DEFAULT_NOTE;
            later(() => tour(0), 6500);
            return;
        }
        const kind = TOUR_ORDER[i];
        const members = workforceData.nodes.filter(d => d.category === kind).map(d => d.id);
        if (window.WFMap) WFMap.highlight([kind, 'hub'].concat(members));
        if (!phone()) svg.transition().duration(FLY).ease(d3.easeCubicInOut).call(zoom.transform, clusterTransform(kind));
        if (note) note.textContent = caption(kind);
        later(() => tour(i + 1), STEP);
    }
    // quiet: the finder has taken over the map and its caption, so leave both alone
    function stopTour(quiet) {
        if (stopped) return;
        stopped = true;
        timers.forEach(clearTimeout); timers = [];
        if (!touring) return;
        touring = false;
        settle();
        if (!quiet) {
            if (window.WFMap) WFMap.highlight(null);
            if (note) note.textContent = DEFAULT_NOTE;
        }
    }
    ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach(ev => addEventListener(ev, e => { if (e.isTrusted) stopTour(false); }, { passive: true }));
    hero.addEventListener('mouseenter', () => stopTour(false));
    document.addEventListener('finder:update', e => {
        const d = e.detail;
        if (d.door === 'training' && d.programs && !d.filtering) {
            const progs = document.querySelector('#hero-stats b[data-n="617"]');
            if (progs && d.programs.length) progs.dataset.n = d.programs.length;
        }
        if (d.filtering || d.door !== 'training') stopTour(true);
    });

    // The map re-fits itself after resizing and after the full-screen view closes; bring it closer again
    let rt;
    const reSettle = () => { clearTimeout(rt); rt = setTimeout(() => { if (!touring) settle(500); }, 700); };
    addEventListener('resize', reSettle);
    document.addEventListener('minimap:toggle', e => { if (!e.detail.open) reSettle(); else stopTour(false); });

    // ----- Start: once the map is built and the banner is on screen -----
    document.addEventListener('viz:ready', () => {
        svg.call(zoom.transform, restTransform());
        const orgs = document.querySelector('#hero-stats b[data-n="29"]');
        if (orgs) orgs.dataset.n = workforceData.nodes.filter(d => d.type === 'asset').length;
        if (reduce) { countUp(); return; }
        document.querySelectorAll('#hero-stats b[data-n]').forEach(b => { b.textContent = '0'; });
        const io = new IntersectionObserver(entries => {
            if (!entries.some(e => e.isIntersecting)) return;
            io.disconnect();
            buildIn(() => later(() => tour(0), 900));
        }, { threshold: 0.4 });
        io.observe(hero);
    }, { once: true });
})();
