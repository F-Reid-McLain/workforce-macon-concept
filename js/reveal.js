/* ===== SCROLL REVEAL — Workforce Data page =====
   Each tool stop rises in the first time it scrolls into view (its headline
   figures counting up), each bar chart's bars grow from the left, and the
   hiring total counts up from zero.
   Everything plays once; later re-renders (switches, filters, Show all,
   resizes) appear instantly.

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
    const GROUPS = ['#sector-commute-bars', '#hiring-bars'];
    const STAGGER_MS = 1800;   // long enough for the last staggered item to finish

    const ITEMS = '.demo-bar-row';

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
    // Reads the number's own text (e.g. "1,612"), so no data code has to
    // change. Text that isn't a single number is left alone.
    const NUMBERS = '.ticker__num';
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

    // ----- Stops build in -----
    // Each tool stop's kicker, headline and panel rise in as it arrives, and the
    // headline's gold figures count up (read when it arrives, after the data has
    // rewritten them)
    const stopObserver = new IntersectionObserver(entries => {
        entries.forEach(e => {
            if (!e.isIntersecting) return;
            stopObserver.unobserve(e.target);
            e.target.classList.add('in-view');
            e.target.querySelectorAll('.chapter-finding em').forEach(countUp);
        });
    }, { rootMargin: '0px 0px -15% 0px', threshold: 0.12 });
    document.querySelectorAll('.stop').forEach(el => stopObserver.observe(el));
})();
