/* ===== HERO MAP — Workforce Navigator =====
   The network map (js/viz-engine.js) is the page's opening banner, where the
   finder lights up the organizations behind what's showing below. Clicking it,
   or "Explore the whole ecosystem", opens the same map full size as an overlay
   (one map, resized: js/main.js re-fits it whenever its container changes size);
   × or Esc closes it. Fires 'minimap:toggle' on document so the finder can
   re-apply its lighting. */
(function () {
    'use strict';
    if (document.body.classList.contains('embed-mode')) return;
    const frame = document.getElementById('minimap');
    if (!frame) return;
    const openBtn = document.getElementById('minimap-open');
    const closeBtn = document.getElementById('minimap-close');
    const exploreBtn = document.getElementById('minimap-explore');
    let lastFocus = null;

    function setOpen(open) {
        if (open === frame.classList.contains('is-open')) return;
        if (open) lastFocus = document.activeElement;
        frame.classList.toggle('is-open', open);
        document.body.classList.toggle('minimap-open', open);
        frame.setAttribute('role', open ? 'dialog' : '');
        frame.setAttribute('aria-modal', open ? 'true' : 'false');
        if (open) closeBtn.focus();
        else {
            // Leave any open details and branched-out programs behind with the big map
            const panel = document.getElementById('viz-info-panel');
            if (panel && panel.classList.contains('open')) document.getElementById('viz-info-close').click();
            if (lastFocus && lastFocus.focus) lastFocus.focus();
        }
        document.dispatchEvent(new CustomEvent('minimap:toggle', { detail: { open } }));
    }

    openBtn.addEventListener('click', () => setOpen(true));
    closeBtn.addEventListener('click', () => setOpen(false));
    if (exploreBtn) exploreBtn.addEventListener('click', () => setOpen(true));
    document.addEventListener('keydown', e => {
        // The map's own Esc handling (details panel) goes first; a second Esc closes the overlay
        if (e.key !== 'Escape' || !frame.classList.contains('is-open')) return;
        const panel = document.getElementById('viz-info-panel');
        if (panel && panel.classList.contains('open')) return;
        setOpen(false);
    });
    // Clicking the dimmed backdrop around the overlay closes it
    frame.addEventListener('click', e => { if (e.target === frame && frame.classList.contains('is-open')) setOpen(false); });
})();
