/* ===== PHONES: THE HOMEPAGE AS SWIPE SCENES =====
   On phones (and not with reduced motion; the inline script in index.html's <head> sets
   html.scenes before anything paints) the homepage plays as full-screen scenes, one per
   swipe, instead of a scrolling page:

     the story's cards (welcome, 6 AM, rush hour, midday, the regional map) ·
     nurses: words, then map · Jobs · manufacturing: words, then map · Industries ·
     631,000 · custom research

   A swipe never scrolls the page itself: it glides the page to the next scene, slowly and
   eased, so each arrival plays out (between the story's cards the camera flies and the
   clock runs, as in desktop present mode). A title slide is one pinned screen: swiping from
   its words to its map lifts the words away while the map comes in and draws
   (css/scenes-phone.css; js/intro-map.js plays it from the slide's .is-map). Inside a tool
   (and the custom research section) you scroll normally; a swipe past its top or bottom
   edge moves on, and a scroll that ends between scenes settles onto the nearest.
   A bar of segments across the top shows where you are.

   window.WFScenes { list, go, index } is for tests (tools/phone-check.js). */
(function () {
    'use strict';
    const root = document.documentElement;
    if (!root.classList.contains('scenes')) return;
    // Turned into a tablet or landscape: the plain page suits that better
    const fits = window.matchMedia('(max-width: 700px) and (pointer: coarse)');
    fits.addEventListener && fits.addEventListener('change', () => { if (!fits.matches) location.reload(); });

    // Every visit opens on the first scene (Safari would otherwise restore an old scroll position,
    // partway between scenes), unless the link is to a section
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    if (!location.hash) window.scrollTo(0, 0);

    // The opening's prompt says what a phone does here
    const cue = document.querySelector('.ci-scroll');
    if (cue && cue.firstChild && cue.firstChild.nodeType === 3) cue.firstChild.textContent = 'Swipe up to watch a workday';

    const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    const top = el => el.getBoundingClientRect().top + scrollY;
    const STORY_MS = 1400, STORY_PER_PX = 1.6, STORY_MAX = 3600;   // as desktop present mode: the camera's flight plays out
    const FLIP_MS = 900, MOVE_MS = 1000;

    let scenes = [], index = 0, heading = -1, glide = null;

    // ----- The scenes, from the page as it's laid out now -----
    function build() {
        const out = [];
        const story = window.WFStory && window.WFStory.anchors ? window.WFStory.anchors() : [];
        story.forEach(a => {
            // the regional map lands with its card at the foot of the screen
            const map = a.el.classList.contains('ci-step--map');
            out.push({ el: a.el, kind: 'story', y: Math.max(0, Math.round(map ? top(a.el) + a.el.offsetHeight - innerHeight : a.y)) });
        });
        const last = document.getElementById('custom-research');
        document.querySelectorAll('.stop-intro, .stop, #custom-research').forEach(el => {
            if (el.classList.contains('stop-intro--map')) {
                const t = top(el);
                out.push({ el, kind: 'words', y: Math.round(t) });
                out.push({ el, kind: 'map', y: Math.round(t + el.offsetHeight - innerHeight) });
            } else if (el.classList.contains('stop-intro')) {
                out.push({ el, kind: 'close', y: Math.round(top(el) + el.offsetHeight / 2 - innerHeight / 2) });
            } else {
                // a tool (or the closing section, which runs on to the page's foot): its top, and
                // the stretch you can scroll through inside it
                const a = Math.round(top(el));
                const b = Math.round(el === last ? root.scrollHeight - innerHeight : top(el) + el.offsetHeight - innerHeight);
                out.push({ el, kind: 'tool', y: a, end: Math.max(a, b) });
            }
        });
        scenes = out.sort((p, q) => p.y - q.y);
        drawBar();
    }
    // The scene the page is at (or inside, for a tool)
    function here() {
        const y = scrollY;
        let best = 0, d = Infinity;
        scenes.forEach((s, i) => {
            // (a tool counts from whichever of its edges is nearer)
            const dd = s.kind === 'tool' ? Math.max(0, s.y - y, y - s.end) : Math.abs(s.y - y);
            if (dd < d) { d = dd; best = i; }
        });
        return best;
    }

    // ----- The progress bar -----
    const bar = document.createElement('div');
    bar.className = 'scene-bar';
    bar.setAttribute('aria-hidden', 'true');
    document.body.appendChild(bar);
    function drawBar() {
        if (bar.childElementCount !== scenes.length) bar.innerHTML = scenes.map(() => '<i></i>').join('');
        Array.from(bar.children).forEach((seg, i) => { seg.classList.toggle('is-on', i === index); seg.classList.toggle('is-done', i < index); });
        const s = scenes[index];
        root.dataset.scene = s ? s.kind : '';
    }

    // ----- Going to a scene: a glide, never a jump -----
    function stop() { if (glide) { cancelAnimationFrame(glide); glide = null; } }
    function go(i) {
        if (!scenes.length) build();
        if (!scenes.length) return;
        i = Math.max(0, Math.min(scenes.length - 1, i));
        const from = scrollY, was = scenes[here()], s = scenes[i];
        // a tool is entered at the edge you come to it from (its foot, coming back up), and a
        // scroll that ran past one of its edges settles back onto that edge
        const y = s.kind === 'tool' ? Math.max(s.y, Math.min(s.end, from)) : s.y;
        index = i; heading = i; drawBar();
        if (window.WFDebug) WFDebug.log('scene go', { to: i, kind: s.kind, target: Math.round(y) });
        stop();
        // a title slide flips the moment you swipe (its screen stays pinned while the page moves)
        if (s.kind === 'words' || s.kind === 'map') setFlip(s.el, s.kind === 'map');
        const dist = y - from;
        if (Math.abs(dist) < 2) { heading = -1; return; }
        const ms = s.kind === 'story' && was && was.kind === 'story' ? Math.min(STORY_MAX, STORY_MS + Math.abs(dist) * STORY_PER_PX)
            : was && was.el === s.el ? FLIP_MS : MOVE_MS;
        const t0 = performance.now();
        const frame = now => {
            const k = Math.min(1, (now - t0) / ms);
            window.scrollTo(0, from + dist * ease(k));
            if (k < 1) glide = requestAnimationFrame(frame);
            else { glide = null; heading = -1; flips(); }
        };
        glide = requestAnimationFrame(frame);
    }

    // ----- Title slides: the words, then the map, on one pinned screen -----
    function setFlip(sl, on) {
        if (on === sl.classList.contains('is-map')) return;
        sl.classList.toggle('is-map', on);
        if (sl.wfAim) sl.wfAim();
    }
    // (from the scroll position, for anything that isn't a swipe: links, the menu, a resize)
    function flips() {
        document.querySelectorAll('.stop-intro--map').forEach(sl => {
            const r = sl.getBoundingClientRect();
            setFlip(sl, r.top <= -innerHeight * 0.5 && r.bottom >= innerHeight * 0.5);
        });
    }
    addEventListener('scroll', () => { if (!glide) flips(); if (!glide) { const i = here(); if (i !== index) { index = i; drawBar(); } } }, { passive: true });

    // ----- Swipes -----
    // Decided on the gesture's first move (after that the browser won't let a scroll be stopped):
    // a swipe that would move between scenes is the player's; scrolling inside a tool, a list or
    // card that scrolls itself, or sideways along a row of buttons stays the browser's.
    let sx = 0, sy = 0, st = 0, mode = null;
    const scrollsItself = (el, dy) => {
        for (let n = el; n && n !== document.body; n = n.parentElement) {
            const cs = getComputedStyle(n);
            if (!/(auto|scroll)/.test(cs.overflowY) || n.scrollHeight <= n.clientHeight + 1) continue;
            if (dy < 0 ? n.scrollTop + n.clientHeight < n.scrollHeight - 1 : n.scrollTop > 0) return true;
        }
        return false;
    };
    function decide(e, dx, dy) {
        // a pop-up is open (a job's card): its own scrolling only, the scenes hold still
        if (root.classList.contains('has-popup')) return scrollsItself(e.target, dy) ? 'native' : 'held';
        if (Math.abs(dx) > Math.abs(dy)) return 'native';                 // sideways: rows of switches
        if (scrollsItself(e.target, dy)) return 'native';                 // the map card, a long list
        const s = scenes[here()], y = scrollY;
        if (s && s.kind === 'tool') {
            if (dy < 0 && y < s.end - 1) return 'native';                 // more of the tool below
            if (dy > 0 && y > s.y + 1) return 'native';                   // more of it above
        }
        return 'scene';
    }
    addEventListener('touchstart', e => {
        if (e.touches.length !== 1) { mode = 'native'; return; }
        sx = e.touches[0].clientX; sy = e.touches[0].clientY; st = performance.now(); mode = null;
        if (!scenes.length) build();
    }, { passive: true });
    addEventListener('touchmove', e => {
        if (mode === 'native' || !scenes.length) return;
        const t = e.touches[0], dx = t.clientX - sx, dy = t.clientY - sy;
        if (mode === null) { mode = decide(e, dx, dy); if (window.WFDebug) WFDebug.log('swipe is', { mode, dy: Math.round(dy) }); }
        if ((mode === 'scene' || mode === 'held') && e.cancelable) e.preventDefault();
    }, { passive: false });
    addEventListener('touchend', e => {
        const was = mode; mode = null;
        if (was !== 'scene') return;
        const t = e.changedTouches[0], dy = t.clientY - sy, dt = performance.now() - st;
        // a tap or a small nudge isn't a swipe; a quick flick is
        if (Math.abs(dy) < 36 && !(Math.abs(dy) > 20 && dt < 220)) return;
        build();
        const from = heading >= 0 ? heading : here();   // a swipe mid-glide moves on from where it was heading
        go(from + (dy < 0 ? 1 : -1));
    }, { passive: true });

    // A scroll that ends between scenes (momentum out of a tool, a link, the menu) settles onto the nearest
    let settleT = null;
    const settle = () => {
        if (glide || mode) return;
        build();
        const i = here(), s = scenes[i], y = scrollY;
        if (!s) return;
        if (s.kind === 'tool' && y >= s.y - 2 && y <= s.end + 2) { index = i; drawBar(); return; }
        if (Math.abs(s.y - y) > 2) go(i); else { index = i; drawBar(); }
    };
    if ('onscrollend' in window) addEventListener('scrollend', () => { clearTimeout(settleT); settleT = setTimeout(settle, 60); });
    else addEventListener('scroll', () => { clearTimeout(settleT); settleT = setTimeout(settle, 180); }, { passive: true });
    addEventListener('resize', () => { clearTimeout(settleT); settleT = setTimeout(() => { build(); flips(); }, 200); });

    // The story's cards are known once its data has loaded
    const ready = setInterval(() => {
        if (!window.WFStory || !window.WFStory.anchors || !window.WFStory.anchors().length) return;
        clearInterval(ready);
        build(); index = here(); drawBar(); flips();
    }, 150);

    window.WFScenes = { list: () => { build(); return scenes.map(s => ({ kind: s.kind, y: s.y, end: s.end, id: s.el.id || s.el.className })); }, go: i => go(i), index: () => index };
})();
