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

    // The open map is a step in the browser's history, so the phone's back button closes it rather
    // than leaving the page; closing it any other way takes that step back off
    let pushed = false;
    addEventListener('popstate', () => { if (pushed) { pushed = false; setOpen(false, true); } });
    function setOpen(open, fromHistory) {
        if (open === frame.classList.contains('is-open')) return;
        if (open && !pushed) { history.pushState({ wfMap: true }, ''); pushed = true; }
        if (!open && pushed && !fromHistory) { pushed = false; history.back(); }
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
            // (focus back where it was, unless that's a box or dropdown on a touch screen: it would bring up the keyboard or picker)
            if (lastFocus && lastFocus.focus && !(matchMedia('(hover: none)').matches && /^(INPUT|SELECT|TEXTAREA)$/.test(lastFocus.tagName))) lastFocus.focus();
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
    const rows = members => {
        const a = id => (typeof assetData !== 'undefined' && assetData[id]) || {};
        return `<ul class="mapgroup">${members.map(m => {
            const d = a(m.id), img = d.image || m.image;
            return `<li><button type="button" data-id="${esc(m.id)}"><span class="mapgroup__logo"${d.logoBg ? ` style="background:${esc(d.logoBg)}"` : ''}>${img ? `<img src="${esc(img)}" alt="" loading="lazy"${d.logoFit === 'contain' ? ' class="is-contain"' : ''}>` : ''}</span><span class="mapgroup__text"><b>${esc(d.name || m.name)}</b>${d.bestFor ? `<small>${esc(d.bestFor)}</small>` : ''}</span><span class="mapgroup__go" aria-hidden="true">›</span></button></li>`;
        }).join('')}</ul>`;
    };
    const dek = n => `<p class="mapgroup__dek">${n} organization${n === 1 ? '' : 's'} · tap one for details</p>`;
    window.WFMapGroup = (cat, members) => {
        const panel = document.getElementById('viz-info-panel');
        if (!panel) return;
        document.getElementById('viz-info-title').textContent = cat.name;
        document.getElementById('viz-info-body').innerHTML = dek(members.length) + rows(members);
        panel.scrollTop = 0;
        panel.classList.add('open');
    };
    document.addEventListener('click', e => {
        const b = e.target.closest('.mapgroup button');
        if (!b || b.closest('.orgsheet') || typeof nodeSelection === 'undefined' || !nodeSelection) return;
        nodeSelection.filter(d => d.id === b.dataset.id).dispatch('click');
    });

    // ----- Phones: the banner is a picture of the six groups, and the organizations are a list -----
    // (a zoomable map of 29 small logos is slow work on a phone; the list it led to is the useful part)
    // Tapping a group in the banner lists its organizations in a sheet from the bottom; "Explore"
    // lists every group's. An organization opens its details (js/directory.js openAssetModal), over
    // the list, and closing them comes back to it. The back button closes the top one.
    const phoneOnly = () => window.innerWidth <= 768;
    const sheet = document.createElement('div');
    sheet.className = 'orgsheet'; sheet.hidden = true;
    sheet.innerHTML = `<div class="orgsheet__backdrop"></div>
        <div class="orgsheet__panel" role="dialog" aria-modal="true" aria-labelledby="orgsheet-title">
            <div class="orgsheet__head"><h3 id="orgsheet-title"></h3><button type="button" class="orgsheet__close" aria-label="Close">&times;</button></div>
            <div class="orgsheet__body"></div>
        </div>`;
    document.body.appendChild(sheet);
    const sheetBody = sheet.querySelector('.orgsheet__body'), sheetClose = sheet.querySelector('.orgsheet__close');
    const groups = () => (typeof workforceData !== 'undefined' && workforceData ? workforceData.nodes : []).filter(n => n.type === 'major-group');
    const membersOf = id => workforceData.nodes.filter(n => n.type === 'asset' && n.category === id);
    const modal = document.getElementById('asset-modal');
    const modalOpen = () => !!modal && modal.style.display === 'block';
    // the browser's history: one step for the list, one for an organization's details over it
    let steps = 0, quietPops = 0, sheetFocus = null;
    const step = () => { history.pushState({ wfSheet: true }, ''); steps++; };
    const unstep = () => { if (steps > 0) { steps--; quietPops++; history.back(); } };
    function openSheet(catId) {
        const all = groups(); if (!all.length) return;
        const cat = catId && all.find(c => c.id === catId);
        document.getElementById('orgsheet-title').textContent = cat ? cat.name : 'Every organization, by group';
        sheetBody.innerHTML = cat ? dek(membersOf(cat.id).length) + rows(membersOf(cat.id))
            : all.map(c => `<h4 class="orgsheet__group">${esc(c.name)} <span>${membersOf(c.id).length}</span></h4>` + rows(membersOf(c.id))).join('');
        sheetBody.scrollTop = 0;
        if (sheet.hidden) { sheetFocus = document.activeElement; sheet.hidden = false; document.body.classList.add('orgsheet-open'); step(); }
        sheetClose.focus({ preventScroll: true });
    }
    function closeSheet(fromHistory) {
        if (sheet.hidden) return;
        sheet.hidden = true; document.body.classList.remove('orgsheet-open');
        if (!fromHistory) unstep();
        if (sheetFocus && sheetFocus.focus && !matchMedia('(hover: none)').matches) sheetFocus.focus({ preventScroll: true });
    }
    sheetClose.addEventListener('click', () => closeSheet());
    sheet.querySelector('.orgsheet__backdrop').addEventListener('click', () => closeSheet());
    sheetBody.addEventListener('click', e => {
        const b = e.target.closest('.mapgroup button');
        if (!b || typeof openAssetModal !== 'function') return;
        openAssetModal(b.dataset.id, { sheet: true });
        if (modalOpen()) step();
    });
    // the details closed their own way (×, outside, Esc): their history step comes off too
    if (modal) new MutationObserver(() => { if (!modalOpen() && steps > (sheet.hidden ? 0 : 1)) unstep(); })
        .observe(modal, { attributes: true, attributeFilter: ['style'] });
    addEventListener('popstate', () => {
        if (quietPops) { quietPops--; return; }
        if (!steps) return;
        steps--;
        if (modalOpen()) { closeAssetModal(modal); return; }
        closeSheet(true);
    });
    // (before the details' own Esc, so one Esc closes only the top one)
    addEventListener('keydown', e => { if (e.key === 'Escape' && !sheet.hidden && !modalOpen()) closeSheet(); }, true);

    // A tap on the banner: the group under it (or near it), or every group if it's between them
    function bannerTap(e) {
        let best = null, bestD = Infinity;
        document.querySelectorAll('#network-visualization g').forEach(g => {
            if (!g.__data__ || g.__data__.type !== 'major-group') return;
            const c = g.querySelector('circle'); if (!c) return;
            const r = c.getBoundingClientRect(), d = Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2));
            if (d < Math.max(30, r.width * 0.9) && d < bestD) { best = g.__data__.id; bestD = d; }
        });
        openSheet(best);
    }
    if (phoneOnly()) {
        openBtn.setAttribute('aria-label', 'Browse the organizations by group');
        if (exploreBtn) exploreBtn.innerHTML = 'See every organization <span aria-hidden="true">›</span>';
    }

    openBtn.addEventListener('click', e => { if (phoneOnly()) bannerTap(e); else setOpen(true); });
    closeBtn.addEventListener('click', () => setOpen(false));
    if (exploreBtn) exploreBtn.addEventListener('click', () => { if (phoneOnly()) openSheet(null); else setOpen(true); });
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
