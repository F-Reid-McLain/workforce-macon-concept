/* Long in-page jumps (the "Skip to the data" link, the section rail) would otherwise
   smooth-scroll through thousands of pixels of the 3D story. Instead: a quick fade
   out, an instant jump, and a fade back in. Short jumps keep native smooth scrolling. */
(function () {
    'use strict';
    const main = document.querySelector('main');
    if (!main) return;
    const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.addEventListener('click', e => {
        const a = e.target.closest('a[href^="#"]');
        const target = a && a.hash.length > 1 && document.getElementById(a.hash.slice(1));
        if (!target) return;
        const top = Math.max(0, target.getBoundingClientRect().top + scrollY - (parseFloat(getComputedStyle(target).scrollMarginTop) || 0));
        if (Math.abs(top - scrollY) < innerHeight * 1.5) return;
        e.preventDefault();
        const land = () => { scrollTo({ top, behavior: 'instant' }); history.pushState(null, '', a.hash); };
        if (reduce) { land(); return; }
        main.style.transition = 'opacity 0.18s ease';
        main.style.opacity = '0';
        setTimeout(() => {
            land();
            requestAnimationFrame(() => { main.style.opacity = '1'; });
            setTimeout(() => { main.style.transition = ''; }, 260);
        }, 180);
    });
})();

/* Settling onto sections (desktop and laptop). From the finished regional map onward,
   when a scroll ends the page glides onto the next stop in the direction you were
   scrolling: the map, each title slide (centered) and each tool (top). A small nudge
   is enough to move on, and a tiny one settles back. CSS scroll-snap can't do this: it
   snaps to the nearest point, so short wheel scrolls kept falling back onto the map.
   The 3D story before the map scrolls freely, and so does the footer past the close. */
(function () {
    'use strict';
    const map = document.getElementById('section-region');
    if (!map) return;
    const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const enabled = () => innerWidth > 900 && innerHeight >= 600 && !document.body.classList.contains('ci-presenting');
    const NUDGE = 60;   // px: less than this and the page settles back where it was

    function points() {
        const top = el => el.getBoundingClientRect().top + scrollY;
        const center = el => top(el) + el.offsetHeight / 2 - innerHeight / 2;
        const pts = [center(map)];
        document.querySelectorAll('.stop-intro, .stop, #custom-research').forEach(el => pts.push(el.classList.contains('stop-intro') ? center(el) : top(el)));
        return pts.map(Math.round).sort((a, b) => a - b);
    }

    // from: where the page last came to rest. A glide only moves it once it lands, so a
    // gesture that interrupts a glide is still measured from the stop it started at.
    let from = scrollY, glideTo = null, pending = null;
    function settle() {
        const y = scrollY;
        if (glideTo !== null) {
            if (Math.abs(y - glideTo) <= 3) { from = y; glideTo = null; return; }
            glideTo = null;   // interrupted: measure from the last resting place
        }
        if (!enabled()) { from = y; return; }
        const pts = points(), first = pts[0], last = pts[pts.length - 1], moved = y - from;
        let target = null;
        if (y < first) {
            // Coming down out of the story: settle onto the map once it's mostly in view
            if (moved > 0 && y > first - innerHeight * 0.5) target = first;
        } else if (y <= last) {
            if (Math.abs(moved) < NUDGE) target = pts.reduce((a, b) => Math.abs(b - y) < Math.abs(a - y) ? b : a);
            else if (moved > 0) target = pts.find(p => p >= y - 1);
            else target = pts.slice().reverse().find(p => p <= y + 1);
        }
        if (target === null || Math.abs(target - y) <= 2) { from = y; return; }
        glideTo = target;
        scrollTo({ top: target, behavior: reduce ? 'instant' : 'smooth' });
    }
    // Wait a beat after a scroll ends, in case the wheel is still turning
    const soon = () => { clearTimeout(pending); pending = setTimeout(settle, 120); };
    ['wheel', 'touchmove'].forEach(ev => addEventListener(ev, () => clearTimeout(pending), { passive: true }));
    if ('onscrollend' in window) addEventListener('scrollend', soon);
    else { let t; addEventListener('scroll', () => { clearTimeout(t); t = setTimeout(soon, 100); }, { passive: true }); }
})();
