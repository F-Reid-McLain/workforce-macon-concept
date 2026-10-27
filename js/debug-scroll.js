/* ===== SCROLL RECORDER (only with ?debug=scroll in the address) =====
   For tracking down scrolling that feels wrong on a real device: it records every wheel,
   touch and scroll event, and every decision the page's own scrolling makes (js/chapters.js
   settling onto a stop, js/scenes-phone.js moving between phone scenes, which call
   window.WFDebug.log). A small panel shows how much it has recorded, with "Copy log" to
   paste the record into a message, and "Clear" to start over. Nothing is sent anywhere. */
(function () {
    'use strict';
    if (!/[?&]debug=scroll\b/.test(location.search)) return;
    const t0 = performance.now(), rows = [];
    const t = () => Math.round(performance.now() - t0);
    const y = () => Math.round(scrollY);
    const count = document.createElement('span');
    const add = s => { rows.push(`${t()}ms y${y()} ${s}`); if (rows.length > 4000) rows.shift(); count.textContent = rows.length + ' events'; };
    window.WFDebug = { log: (what, info) => add(`${what} ${info ? JSON.stringify(info) : ''}`) };

    add(`start ${innerWidth}x${innerHeight} dpr${devicePixelRatio} ${navigator.userAgent} ${document.documentElement.className}`);
    addEventListener('wheel', e => add(`wheel dy${Math.round(e.deltaY)} mode${e.deltaMode}${e.defaultPrevented ? ' (held)' : ''}`), { passive: true });
    addEventListener('touchstart', e => add(`touchstart ${Math.round(e.touches[0].clientY)}`), { passive: true });
    addEventListener('touchend', e => add(`touchend ${Math.round(e.changedTouches[0].clientY)}`), { passive: true });
    let lastScroll = 0;
    addEventListener('scroll', () => { const n = performance.now(); if (n - lastScroll > 50) { lastScroll = n; add('scroll'); } }, { passive: true });
    addEventListener('scrollend', () => add('scrollend'));
    addEventListener('resize', () => add(`resize ${innerWidth}x${innerHeight}`));

    const panel = document.createElement('div');
    panel.style.cssText = 'position:fixed;z-index:9999;left:8px;bottom:8px;display:flex;gap:6px;align-items:center;padding:6px 8px;border-radius:8px;background:rgba(0,0,0,.8);color:#fff;font:12px system-ui';
    const btn = (label, fn) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.style.cssText = 'font:inherit;padding:4px 8px;border-radius:6px;border:1px solid #888;background:#222;color:#fff'; b.onclick = fn; panel.appendChild(b); return b; };
    panel.appendChild(count);
    const copy = btn('Copy log', () => {
        const text = rows.join('\n');
        const done = () => { copy.textContent = 'Copied'; setTimeout(() => { copy.textContent = 'Copy log'; }, 1500); };
        if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, () => fallback(text));
        else fallback(text);
    });
    btn('Clear', () => { rows.length = 0; add('cleared'); });
    // without clipboard access: the log in a box to select and copy by hand
    function fallback(text) {
        const ta = document.createElement('textarea');
        ta.value = text; ta.style.cssText = 'position:fixed;z-index:10000;inset:10% 5%;width:90%;height:60%;font:11px monospace';
        ta.onblur = () => ta.remove();
        document.body.appendChild(ta); ta.focus(); ta.select();
    }
    document.addEventListener('DOMContentLoaded', () => document.body.appendChild(panel));
    if (document.body) document.body.appendChild(panel);
})();
