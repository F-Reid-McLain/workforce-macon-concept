/* ===== CHAPTERS — scroll progress for the homepage's sticky moments =====
   Any element with [data-scrub] is a tall section whose inner stage sticks
   while it scrolls. This sets --p on it (0 as it reaches the top of the
   window, 1 as it's about to leave), smoothed so wheel ticks glide, and fires
   a 'chapter:progress' event ({ detail: { p } }) for scripts that draw with it
   (the industries donut). CSS reads --p directly (the paycheck bars).

   On phones the stages aren't sticky, and with reduced motion there's nothing
   to scrub: those get p = 1 as soon as they come into view. */
(function () {
    'use strict';
    const els = Array.from(document.querySelectorAll('[data-scrub]'));
    if (!els.length) return;
    const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const flat = () => window.innerWidth < 700;
    const header = document.querySelector('.main-header');

    const state = new Map(els.map(el => [el, { target: 0, shown: 0, onScreen: false }]));
    const publish = (el, p) => {
        el.style.setProperty('--p', p.toFixed(4));
        el.dispatchEvent(new CustomEvent('chapter:progress', { bubbles: true, detail: { p } }));
    };

    function measure() {
        const top = header ? header.offsetHeight : 0;
        state.forEach((s, el) => {
            if (reduce || flat()) { s.target = s.onScreen ? 1 : s.target; return; }
            const r = el.getBoundingClientRect(), span = r.height - (innerHeight - top);
            s.target = Math.max(0, Math.min(1, span > 0 ? (top - r.top) / span : 1));
        });
    }

    let raf = null, last = performance.now();
    function frame(now) {
        raf = null;
        const dt = Math.min(64, now - last); last = now;
        let busy = false;
        state.forEach((s, el) => {
            if (!s.onScreen && s.shown === s.target) return;
            const k = reduce || flat() ? 1 : 1 - Math.exp(-dt / 140);
            const next = Math.abs(s.target - s.shown) < 0.0005 ? s.target : s.shown + (s.target - s.shown) * k;
            if (next !== s.shown) { s.shown = next; publish(el, next); }
            if (s.shown !== s.target) busy = true;
        });
        if (busy) raf = requestAnimationFrame(frame);
    }
    const wake = () => { measure(); if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } };

    const io = new IntersectionObserver(entries => { entries.forEach(e => { state.get(e.target).onScreen = e.isIntersecting; }); wake(); }, { threshold: 0 });
    els.forEach(el => io.observe(el));
    addEventListener('scroll', wake, { passive: true });
    addEventListener('resize', wake);
    els.forEach(el => publish(el, 0));
    wake();
})();
