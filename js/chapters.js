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

/* The section rail steps aside while the footer is on screen, so it doesn't sit over
   the footer's links (css/chapters.css). */
(function () {
    'use strict';
    const footer = document.querySelector('.main-footer');
    if (!footer || !('IntersectionObserver' in window)) return;
    new IntersectionObserver(es => document.body.classList.toggle('footer-in-view', es[0].isIntersecting)).observe(footer);
})();

/* Settling onto sections. From the finished regional map onward, when a scroll ends the
   page glides onto the next stop in the direction you were scrolling: the map, each title
   slide (centered) and each tool (top). A small nudge is enough to move on, and a tiny one
   settles back. CSS scroll-snap can't do this: it snaps to the nearest point, so short wheel
   scrolls kept falling back onto the map (and on phones, "proximity" snapping only caught
   swipes that happened to stop right at a stop).
   Phones settle the same way once a swipe's momentum has run out, onto their own screens:
   a map slide's words, then its map (a screen each there), and each tool's top; a tool
   taller than the screen scrolls freely between its top and bottom.
   The 3D story before the map scrolls freely, and so does the footer past the close.
   Also window.WFStops, the homepage stops in order, which present mode's arrow keys
   step through once past the story (js/commute-intro.js). */
(function () {
    'use strict';
    const map = document.getElementById('section-region');
    if (!map) return;
    const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const phone = () => innerWidth <= 900;
    // (phones in swipe scenes are moved by js/scenes-phone.js instead)
    const enabled = () => !document.documentElement.classList.contains('scenes') && (phone() || innerHeight >= 600) && !document.body.classList.contains('ci-presenting');
    const HEADER = 64;   // phones: the fixed header's room above a tool
    const NUDGE = 60;   // px: less than this and the page settles back where it was

    const top = el => el.getBoundingClientRect().top + scrollY;
    const center = el => top(el) + el.offsetHeight / 2 - innerHeight / 2;
    // The stops after the map, in order: { y, el }
    const stops = () => [...document.querySelectorAll('.stop-intro, .stop, #custom-research')]
        .map(el => ({ el, y: Math.round(el.classList.contains('stop-intro') ? center(el) : top(el)) }))
        .sort((a, b) => a.y - b.y);
    // Phones: each map slide's two screens, each tool's top (and its bottom when it's taller
    // than the screen), the close centered. spans: the tall tools' free stretches.
    let spans = [];
    function phonePoints() {
        const out = [];
        spans = [];
        document.querySelectorAll('.stop-intro, .stop, #custom-research').forEach(el => {
            if (el.classList.contains('stop-intro--map')) {
                // from the slide's own box: its words slide and fade in as they arrive, so their
                // box is somewhere else mid-build. Words fill its first screen, the map its last.
                out.push(top(el), top(el) + el.offsetHeight - innerHeight);
            } else if (el.classList.contains('stop-intro')) out.push(center(el));
            else {
                const a = top(el) - HEADER, b = top(el) + el.offsetHeight - innerHeight;
                out.push(a);
                if (b > a + 40) { out.push(b); spans.push([a, b]); }
            }
        });
        return out;
    }
    const mapPoint = () => Math.round(phone() ? top(map) + map.offsetHeight - innerHeight : center(map));
    const points = () => [mapPoint()].concat(phone() ? phonePoints().map(Math.round) : stops().map(s => s.y)).sort((a, b) => a - b);

    // from: where the page last came to rest. A glide only moves it once it lands, so a
    // gesture that interrupts a glide is still measured from the stop it started at.
    let from = scrollY, glideTo = null, pending = null, quietUntil = 0, lastInput = 0;
    const STILL = 260;   // ms without wheel or touch input before the page settles
    const land = y => { from = y; glideTo = null; held = null; quietUntil = performance.now() + 450; };
    function settle() {
        const wait = STILL - (performance.now() - lastInput);
        if (wait > 0) { pending = setTimeout(settle, wait); return; }   // the wheel is still turning
        const y = scrollY;
        if (glideTo !== null) {
            // Landed, or close enough that the leftover drift is just momentum
            if (Math.abs(y - glideTo) < NUDGE) { if (Math.abs(y - glideTo) > 2) scrollTo({ top: glideTo, behavior: 'instant' }); land(glideTo); return; }
            glideTo = null;   // a real new gesture: measure from the last resting place
        }
        if (!enabled()) { from = y; return; }
        const pts = points(), first = pts[0], last = pts[pts.length - 1], moved = y - from;
        if (spans.some(([a, b]) => y > a + 2 && y < b - 2)) { from = y; return; }   // inside a tall tool: read freely
        let target = null;
        if (y < first) {
            // Coming down out of the story: settle onto the map once it's mostly in view
            if (moved > 0 && y > first - innerHeight * 0.5) target = first;
        } else if (y <= last) {
            // A nudge settles back; anything more moves one stop on from where the page last
            // rested, never more, however far the momentum carried it (a flick used to coast past a
            // stop and settle on the one after; a slow read out of a tall tool's foot was pulled on)
            if (Math.abs(moved) < NUDGE) target = pts.reduce((a, b) => Math.abs(b - y) < Math.abs(a - y) ? b : a);
            else if (moved > 0) target = pts.find(p => p > from + 1);
            else target = pts.slice().reverse().find(p => p < from - 1);
            if (target === undefined) target = null;
        }
        if (target === null || Math.abs(target - y) <= 2) { from = y; return; }
        // Settling back after a tiny nudge doesn't hold the wheel: the nudge may be the
        // slow start of a real swipe, which should carry on through
        if (target === from) { scrollTo({ top: target, behavior: reduce ? 'instant' : 'smooth' }); return; }
        glideTo = target;
        scrollTo({ top: target, behavior: reduce ? 'instant' : 'smooth' });
    }
    // A trackpad keeps sending small "momentum" wheel events for a second or so after the
    // fingers lift. While a glide runs, and just after it lands, those are swallowed, so
    // the tail of one swipe can't carry the page on past the stop it chose. A real new
    // swipe starts with a bigger delta and gets through.
    // And one gesture moves at most one stop: scrolling that would carry the page past the next
    // stop holds it there, like a page's edge (in a tall tool, its foot), until the gesture ends,
    // or a fresh push (bigger than the dying momentum before it) carries on to the stop after.
    let held = null, lastAbs = 0;
    addEventListener('wheel', e => {
        const settling = glideTo !== null || performance.now() < quietUntil;
        if (settling && enabled() && Math.abs(e.deltaY) < 40 && scrollY >= points()[0] - 2) {
            e.preventDefault();
            if (glideTo === null) quietUntil = Math.min(performance.now() + 250, quietUntil + 250);   // let the tail run out
            return;
        }
        const dy = e.deltaY, abs = Math.abs(dy);
        if (enabled() && glideTo === null && dy) {
            if (held !== null && abs > lastAbs * 1.5 + 2) { from = held; held = null; }   // a fresh push: on to the next stop
            const pts = points();
            if (scrollY >= pts[0] - innerHeight) {
                const next = dy > 0 ? pts.find(p => p > from + 1) : pts.slice().reverse().find(p => p < from - 1);
                if (next !== undefined && (dy > 0 ? scrollY + dy > next : scrollY + dy < next)) {
                    e.preventDefault();
                    if (Math.abs(scrollY - next) > 1) scrollTo({ top: next, behavior: 'instant' });
                    held = next;
                }
            }
        }
        lastAbs = abs;
        lastInput = performance.now();
        clearTimeout(pending);
    }, { passive: false });
    addEventListener('touchmove', () => { lastInput = performance.now(); clearTimeout(pending); }, { passive: true });
    // Settle once scrolling has ended and the wheel has been still for a moment (slow
    // wheels and gentle swipes send input in a trickle); a glide that reaches its stop
    // is recorded straight away
    const soon = () => {
        clearTimeout(pending);
        if (glideTo !== null && Math.abs(scrollY - glideTo) <= 2) { land(glideTo); return; }
        pending = setTimeout(settle, 60);
    };
    if ('onscrollend' in window) addEventListener('scrollend', soon);
    else { let t; addEventListener('scroll', () => { clearTimeout(t); t = setTimeout(soon, 100); }, { passive: true }); }
    // Present mode: step to the next (dir 1) or previous (-1) stop. Returns false when
    // stepping back above the first one, so the story can take over again.
    window.WFStops = {
        list: stops,
        step(dir) {
            const all = stops(), y = scrollY;
            const here = all.find(s => Math.abs(s.y - y) <= 4);
            if (dir > 0 && here && here.el.wfFinishBuild && here.el.wfFinishBuild()) return true;   // finish a build in progress first
            const next = dir > 0 ? all.find(s => s.y > y + 4) : all.slice().reverse().find(s => s.y < y - 4);
            if (!next) return dir > 0;
            scrollTo({ top: next.y, behavior: reduce ? 'instant' : 'smooth' });
            return true;
        },
    };
})();
