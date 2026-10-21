/* ===== FINDER — Workforce Navigator =====
   The page's front door: "What do you need?" picks, a search box and topic and
   organization-type filters narrow the organizations in content/assets.json
   (loaded by js/directory.js) to cards beside the network map. The same filters
   light up the matching dots on the map (window.WFMap, js/search.js); hovering a
   card picks out its dot, and clicking a card opens its details the way clicking
   its dot does. On phones, cards open their details as a sheet.

   The state lives in the address (?need=train&tag=Healthcare&type=colleges&q=…),
   so any view can be shared. Map-only embeds (?embed=1) skip all of this. */
(function () {
    'use strict';
    if (document.body.classList.contains('embed-mode')) return;
    const cardsEl = document.getElementById('finder-cards');
    if (!cardsEl) return;
    const reduce = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
    const phone = () => window.innerWidth <= 900;
    const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

    // The six kinds of organization, in the order the old Directory listed them
    const CATEGORIES = [
        { slug: 'colleges',           label: 'Colleges & universities' },
        { slug: 'k12-secondary',      label: 'K-12 & career academies' },
        { slug: 'community-dev',      label: 'Community & economic development' },
        { slug: 'job-training',       label: 'Job training & career services' },
        { slug: 'faith-based',        label: 'Faith-based & community' },
        { slug: 'special-population', label: 'Special populations & re-entry' },
    ];
    const catOf = slug => CATEGORIES.find(c => c.slug === slug) || { label: slug };
    const colorOf = slug => (typeof CATEGORY_COLORS !== 'undefined' && CATEGORY_COLORS[slug]) || '#8a94a6';

    // "What do you need?" — each pick is a set of topics and/or kinds of organization
    // (an organization matches if it has any of them). Nearly every organization
    // lists Career Services, so "Find a job" goes by kind of organization instead.
    const NEEDS = [
        { id: 'job',      label: 'Find a job',                    cats: ['job-training', 'faith-based', 'special-population'] },
        { id: 'train',    label: 'Train for a career',            tags: ['Trades', 'Healthcare', 'Technology'], cats: ['colleges'] },
        { id: 'ged',      label: 'Finish school or a GED',        tags: ['Adult Education'] },
        { id: 'youth',    label: 'Youth & students',              tags: ['Youth'], cats: ['k12-secondary'] },
        { id: 'employer', label: 'Hire or train workers',         tags: ['Economic Development'], cats: ['community-dev'] },
        { id: 'support',  label: 'Re-entry & disability support', tags: ['Reentry', 'Disability Services'], cats: ['special-population'] },
    ];
    const meetsNeed = (a, n) => (n.tags || []).some(t => a.tags.includes(t)) || (n.cats || []).includes(a.category);

    // ----- State, kept in the address -----
    const params = new URLSearchParams(location.search);
    const state = {
        need: params.get('need') || '',
        tags: new Set(params.getAll('tag')),
        cats: new Set(params.getAll('type')),
        q: params.get('q') || '',
    };
    function saveState() {
        const p = new URLSearchParams(location.search);
        ['need', 'tag', 'type', 'q'].forEach(k => p.delete(k));
        if (state.need) p.set('need', state.need);
        state.tags.forEach(t => p.append('tag', t));
        state.cats.forEach(c => p.append('type', c));
        if (state.q) p.set('q', state.q);
        const qs = p.toString();
        history.replaceState(null, '', location.pathname + (qs ? '?' + qs : '') + location.hash);
    }
    const filtering = () => !!(state.need || state.tags.size || state.cats.size || state.q.trim());

    let orgs = [];
    function matches(a) {
        const need = NEEDS.find(n => n.id === state.need);
        if (need && !meetsNeed(a, need) && a.bestForNeed !== need.id) return false;   // a best fit always counts
        if (state.tags.size && !a.tags.some(t => state.tags.has(t))) return false;
        if (state.cats.size && !state.cats.has(a.category)) return false;
        const q = state.q.trim().toLowerCase();
        if (q && !a.haystack.includes(q)) return false;
        return true;
    }

    // ----- Controls -----
    const needsEl = document.getElementById('finder-needs'), qEl = document.getElementById('finder-q');
    const countEl = document.getElementById('finder-count'), clearEl = document.getElementById('finder-clear');
    const moreEl = document.getElementById('finder-more'), filtersEl = document.getElementById('finder-filters');
    const emptyEl = document.getElementById('finder-empty');
    const chip = (kind, value, label, on, color) => `<button type="button" class="fchip${on ? ' is-on' : ''}" data-kind="${kind}" data-value="${esc(value)}" aria-pressed="${on}">${color ? `<i style="background:${color}"></i>` : ''}${esc(label)}</button>`;
    function renderControls() {
        needsEl.innerHTML = NEEDS.map(n => chip('need', n.id, n.label, state.need === n.id)).join('');
        const tags = Array.from(new Set(orgs.flatMap(a => a.tags))).sort();
        document.getElementById('finder-tags').innerHTML = tags.map(t => chip('tag', t, t, state.tags.has(t))).join('');
        document.getElementById('finder-cats').innerHTML = CATEGORIES.map(c => chip('type', c.slug, c.label, state.cats.has(c.slug), colorOf(c.slug))).join('');
        const extra = state.tags.size + state.cats.size;
        moreEl.textContent = extra ? `More filters (${extra})` : 'More filters';
        clearEl.hidden = !filtering();
    }
    document.querySelector('.finder').addEventListener('click', e => {
        const b = e.target.closest('.fchip');
        if (!b) return;
        const { kind, value } = b.dataset;
        if (kind === 'need') state.need = state.need === value ? '' : value;
        else { const set = kind === 'tag' ? state.tags : state.cats; set.has(value) ? set.delete(value) : set.add(value); }
        update();
    });
    let qt;
    qEl.value = state.q;
    qEl.addEventListener('input', () => { clearTimeout(qt); qt = setTimeout(() => { state.q = qEl.value; update(); }, 120); });
    moreEl.addEventListener('click', () => {
        filtersEl.hidden = !filtersEl.hidden;
        moreEl.setAttribute('aria-expanded', String(!filtersEl.hidden));
    });
    const clearAll = () => { state.need = ''; state.tags.clear(); state.cats.clear(); state.q = ''; qEl.value = ''; update(); };
    clearEl.addEventListener('click', clearAll);
    document.getElementById('finder-empty-clear').addEventListener('click', clearAll);

    // ----- Cards -----
    const blurb = s => { s = String(s || ''); const cut = s.length > 170 ? s.slice(0, 170).replace(/\s+\S*$/, '') + '…' : s; return cut; };
    function cardHTML(a) {
        const logo = a.image
            ? `<span class="fcard__logo${a.logoFit === 'contain' ? ' is-contain' : ''}"${a.logoBg ? ` style="background:${esc(a.logoBg)}"` : ''}><img src="${esc(a.image)}" alt="" loading="lazy"></span>`
            : `<span class="fcard__logo is-blank" style="background:${colorOf(a.category)}"></span>`;
        return `<li data-key="${esc(a.id)}"><button type="button" class="fcard" data-id="${esc(a.id)}">
            ${logo}
            <span class="fcard__text">
                <span class="fcard__kind"><i style="background:${colorOf(a.category)}"></i>${esc(catOf(a.category).label)}</span>
                <b class="fcard__name">${esc(a.name)}</b>
                ${a.bestFor ? `<span class="fcard__best">${fitsNeed(a) ? '<mark>Best fit</mark>' : ''}Best known for: <strong>${esc(a.bestFor)}</strong></span>` : ''}
                <span class="fcard__blurb">${esc(blurb(a.description))}</span>
                <span class="fcard__tags">${a.tags.map(t => `<em>${esc(t)}</em>`).join('')}</span>
            </span></button></li>`;
    }
    // Re-render, sliding cards that stay from where they were and fading in new ones
    function flip(render) {
        const before = new Map(Array.from(cardsEl.children).map(el => [el.dataset.key, el.getBoundingClientRect().top]));
        render();
        if (reduce) return;
        Array.from(cardsEl.children).forEach((el, i) => {
            if (!el.animate) return;
            const was = before.get(el.dataset.key), top = el.getBoundingClientRect().top;
            el.animate(was !== undefined ? [{ transform: `translateY(${was - top}px)` }, { transform: 'none' }]
                                         : [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }],
                       { duration: 420, delay: Math.min(i, 12) * 18, easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)', fill: 'backwards' });
        });
    }

    // Within a "What do you need?" pick, the organizations whose main strength is that
    // need come first (bestForNeed in content/assets.json), then everyone else who helps
    const fitsNeed = a => !!state.need && a.bestForNeed === state.need;
    let shown = [], activeId = null;
    function update() {
        shown = orgs.filter(matches);
        if (state.need) shown = shown.filter(fitsNeed).concat(shown.filter(a => !fitsNeed(a)));
        flip(() => { cardsEl.innerHTML = shown.map(cardHTML).join(''); });
        markActive(activeId);
        emptyEl.hidden = shown.length > 0;
        countEl.textContent = filtering() ? `${shown.length} of ${orgs.length} organizations` : `All ${orgs.length} organizations`;
        renderControls();
        saveState();
        lightMap();
    }

    // ----- The map -----
    function lightMap() {
        if (!window.WFMap || !WFMap.ready()) return;
        if (!filtering()) { WFMap.highlight(null); return; }
        // the matching organizations, plus their kinds and the hub, so the shape still reads
        const ids = shown.map(a => a.id).concat(Array.from(new Set(shown.map(a => a.category))), ['hub']);
        WFMap.highlight(ids);
    }
    // The map builds itself asynchronously; light it once it's there
    const waitForMap = setInterval(() => { if (window.WFMap && WFMap.ready()) { clearInterval(waitForMap); lightMap(); } }, 150);
    setTimeout(() => clearInterval(waitForMap), 15000);
    // Closing a map panel resets the map's own focus dimming; put the filter's back
    const panel = document.getElementById('viz-info-panel');
    if (panel) new MutationObserver(() => { if (!panel.classList.contains('open')) setTimeout(lightMap, 60); })
        .observe(panel, { attributes: true, attributeFilter: ['class'] });

    cardsEl.addEventListener('mouseover', e => { const c = e.target.closest('.fcard'); if (c && window.WFMap) WFMap.hover(c.dataset.id); });
    cardsEl.addEventListener('mouseleave', () => { if (window.WFMap) WFMap.hover(null); });
    cardsEl.addEventListener('click', e => {
        const c = e.target.closest('.fcard');
        if (!c) return;
        const id = c.dataset.id;
        if (phone() || !window.WFMap || !WFMap.ready()) openAssetModal(id, { sheet: true });
        else WFMap.open(id);   // exactly what clicking its dot does: details, plus its programs fanned out
        markActive(id);
    });

    // Whichever way details open (card, dot, ?asset=), mark that card
    function markActive(id) {
        activeId = id;
        cardsEl.querySelectorAll('.fcard').forEach(c => c.classList.toggle('is-active', c.dataset.id === id));
    }
    if (typeof window.openAssetModal === 'function') {
        const open = window.openAssetModal;
        window.openAssetModal = function (id, opts) {
            open(id, opts);
            markActive(id);
            const card = cardsEl.querySelector(`.fcard[data-id="${CSS.escape(id)}"]`);
            if (card && !phone()) {
                const r = card.getBoundingClientRect();
                if (r.top < 80 || r.bottom > innerHeight) card.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
            }
        };
    }

    // ----- Start once the organizations are loaded -----
    function start() {
        orgs = Object.entries(assetData).map(([id, a]) => ({
            id, ...a, tags: a.tags || [],
            haystack: [a.name, a.bestFor, a.description, a.impact, (a.tags || []).join(' '), catOf(a.category).label,
                       (a.links || []).map(l => l.label + ' ' + (l.description || '')).join(' ')].join(' ').toLowerCase(),
        })).sort((x, y) => CATEGORIES.findIndex(c => c.slug === x.category) - CATEGORIES.findIndex(c => c.slug === y.category));
        document.getElementById('finder-total').textContent = orgs.length;
        if (state.tags.size || state.cats.size) { filtersEl.hidden = false; moreEl.setAttribute('aria-expanded', 'true'); }
        update();
    }
    if (typeof assetData !== 'undefined' && Object.keys(assetData).length) start();
    else document.addEventListener('assets:loaded', start, { once: true });
})();
