/* ===== HERO MAP — Workforce Navigator =====
   The network map (js/viz-engine.js) is the page's opening banner, where the
   finder lights up the organizations behind what's showing below. Clicking it,
   or "Explore the whole ecosystem", opens the same map full size as an overlay
   (one map, resized: js/main.js re-fits it whenever its container changes size);
   × or Esc closes it. Fires 'minimap:toggle' on document so the finder can
   re-apply its lighting.
   Phones: opened, the map fills the screen and shows every organization at once
   ("Everyone", js/viz-engine.js setMobileMapView), with a switch back to the six
   groups; tapping a group lists its organizations in the map's bottom panel
   (window.WFMapGroup, called by the map). Closed, the banner shows the groups. */
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
        // (after the map has re-fitted itself to its new size)
        if (phone()) setTimeout(() => setView(open ? view : 'groups', true), 160);
    }

    // ----- Phones: Groups | Everyone -----
    const phone = () => window.innerWidth <= 768 && typeof setMobileMapView === 'function';
    const hint = document.getElementById('map-hint');
    const switchBtns = Array.from(frame.querySelectorAll('.mapbar__switch button'));
    let view = 'everyone';
    const HINTS = { everyone: 'Pinch to zoom · tap a group to list it', groups: 'Tap a group to see who’s in it' };
    function setView(mode, quiet) {
        if (!phone()) return;
        if (!quiet) view = mode;
        setMobileMapView(mode);
        switchBtns.forEach(b => { const on = b.dataset.mode === view; b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', String(on)); });
        if (hint) hint.textContent = HINTS[view];
    }
    switchBtns.forEach(b => b.addEventListener('click', () => setView(b.dataset.mode)));

    // A tapped group's organizations, listed in the map's bottom panel; a tap opens one's details
    const esc = t => String(t == null ? '' : t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    window.WFMapGroup = (cat, members) => {
        const panel = document.getElementById('viz-info-panel');
        if (!panel) return;
        const a = id => (typeof assetData !== 'undefined' && assetData[id]) || {};
        document.getElementById('viz-info-title').textContent = cat.name;
        document.getElementById('viz-info-body').innerHTML = `<p class="mapgroup__dek">${members.length} organization${members.length === 1 ? '' : 's'} · tap one for details</p>
            <ul class="mapgroup">${members.map(m => {
                const d = a(m.id), img = d.image || m.image;
                return `<li><button type="button" data-id="${esc(m.id)}"><span class="mapgroup__logo"${d.logoBg ? ` style="background:${esc(d.logoBg)}"` : ''}>${img ? `<img src="${esc(img)}" alt="" loading="lazy"${d.logoFit === 'contain' ? ' class="is-contain"' : ''}>` : ''}</span><span class="mapgroup__text"><b>${esc(d.name || m.name)}</b>${d.bestFor ? `<small>${esc(d.bestFor)}</small>` : ''}</span><span class="mapgroup__go" aria-hidden="true">›</span></button></li>`;
            }).join('')}</ul>`;
        panel.scrollTop = 0;
        panel.classList.add('open');
    };
    document.addEventListener('click', e => {
        const b = e.target.closest('.mapgroup button');
        if (!b || typeof nodeSelection === 'undefined' || !nodeSelection) return;
        nodeSelection.filter(d => d.id === b.dataset.id).dispatch('click');
    });

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
