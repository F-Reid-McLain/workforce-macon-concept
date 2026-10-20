/* ===== SCROLL REVEAL — Workforce Data page =====
   Each chart and card group plays a short build-in the first time it
   scrolls into view: bars grow from the left, table rows and cards fade
   up in sequence, and numbers
   count up from zero. Everything plays once; later re-renders (Show All,
   tab switches, resizes) appear instantly, as before.

   The hidden "before" states live in css/reveal.css and only apply while
   <html> has .reveal-on, which the inline script in index.html's <head>
   adds (skipped for prefers-reduced-motion). This file marks each group
   .in-view as it arrives. */
(function () {
    'use strict';
    const root = document.documentElement;
    if (!root.classList.contains('reveal-on') || !('IntersectionObserver' in window)) {
        root.classList.remove('reveal-on');
        return;
    }
    window.WFReveal = true;

    // ----- Chart and card groups -----
    const GROUPS = [
        '.stats-grid', '.demo-stat-grid', '.demo-grid',
        '#age-bars', '#race-bars', '#edu-bars', '.occ-table',
        '#occ-proj-growth', '#occ-wage-mean', '#occ-demand-chart', '#hiring-chart', '#employers-chart',
    ];
    const STAGGER_MS = 1800;   // long enough for the last staggered item to finish

    const ITEMS = '.demo-bar-row, tbody tr, .kpi-block, .demo-stat, .demo-card';

    const groupObserver = new IntersectionObserver(entries => {
        entries.forEach(e => {
            if (!e.isIntersecting) return;
            const el = e.target;
            // Charts are empty (and the page short) until their data loads, so an
            // empty group can sit "in view" at load without anything to show.
            // Wait for its content, then check its real position again.
            if (!el.querySelector(ITEMS)) {
                if (el.dataset.revealWaiting) return;
                el.dataset.revealWaiting = '1';
                const mo = new MutationObserver(() => {
                    if (!el.querySelector(ITEMS)) return;
                    mo.disconnect();
                    delete el.dataset.revealWaiting;
                    groupObserver.unobserve(el);
                    requestAnimationFrame(() => groupObserver.observe(el));
                });
                mo.observe(el, { childList: true, subtree: true });
                return;
            }
            groupObserver.unobserve(el);
            el.classList.add('in-view', 'revealing');
            // Drop the stagger delays once the build-in is done, so later
            // re-renders inside this group don't inherit them
            setTimeout(() => el.classList.remove('revealing'), STAGGER_MS);
        });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.15 });

    document.querySelectorAll(GROUPS.join(',')).forEach(el => groupObserver.observe(el));

    // ----- Count-up numbers -----
    // Reads each number's own text (e.g. "$55,410", "+23,963", "77.3%", "~$50K"),
    // so no data code has to change. Text that isn't a single number
    // ("Health Care…", "60–70%") is left alone.
    const NUMBERS = '.kpi-val, .demo-stat-val, .ticker__num';
    const NUM_RE = /^([^\d]*?)(\d[\d,]*(?:\.\d+)?)([^\d]*)$/;
    const DURATION = 1200;
    const easeOut = t => 1 - Math.pow(1 - t, 3);

    function countUp(el) {
        const m = (el.textContent || '').trim().match(NUM_RE);
        if (!m) return false;
        const [, prefix, numText, suffix] = m;
        const target = parseFloat(numText.replace(/,/g, ''));
        const decimals = (numText.split('.')[1] || '').length;
        const grouped = numText.includes(',');
        const fmt = v => {
            const s = grouped ? v.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) : v.toFixed(decimals);
            return prefix + s + suffix;
        };
        const finalText = el.textContent;
        el.setAttribute('aria-label', finalText.trim());
        const start = performance.now();
        (function tick(now) {
            const k = Math.min(1, (now - start) / DURATION);
            el.textContent = k < 1 ? fmt(target * easeOut(k)) : finalText;
            if (k < 1) requestAnimationFrame(tick);
        })(start);
        return true;
    }

    const numberObserver = new IntersectionObserver(entries => {
        entries.forEach(e => {
            if (!e.isIntersecting) return;
            const el = e.target;
            numberObserver.unobserve(el);
            if (countUp(el)) return;
            // Still a placeholder ("—") because its data hasn't loaded:
            // count up as soon as the real number is written in
            const mo = new MutationObserver(() => {
                if (NUM_RE.test((el.textContent || '').trim()) || el.textContent.trim() !== '—') {
                    mo.disconnect();
                    countUp(el);
                }
            });
            mo.observe(el, { childList: true, characterData: true, subtree: true });
        });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.6 });

    document.querySelectorAll(NUMBERS).forEach(el => numberObserver.observe(el));
})();
