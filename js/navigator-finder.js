/* ===== FINDER — Workforce Navigator =====
   Three front doors:
   - Programs: every program the organizations offer (content/programs.json, built by
     tools/build-programs.py). It opens on field tiles; a search, a tile or the Filters
     panel (how long, what you earn, field, online) switches to a compact list.
   - Get support / For employers: the organizations for that audience
     (content/assets.json "doors", loaded by js/directory.js).
   The ecosystem map in the hero banner (js/navigator-minimap.js) lights up the
   organizations behind whatever is showing (window.WFMap, js/search.js). The view lives in the address
   (?for=support, ?q=welding&len=weeks&earn=certificate&field=healthcare&online=1).
   Map-only embeds (?embed=1) skip all of this. */
(function () {
    'use strict';
    if (document.body.classList.contains('embed-mode')) return;
    const progEl = document.getElementById('finder-programs');
    if (!progEl) return;
    const reduce = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
    const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const PAGE = 40;

    const LENGTHS = [
        { id: 'weeks',  label: 'Weeks',     tip: 'Under 3 months' },
        { id: 'months', label: 'Months',    tip: '3 to 12 months' },
        { id: '1to2',   label: '1–2 years', tip: 'One to two years' },
        { id: '3plus',  label: '3+ years',  tip: 'Three years or more' },
    ];
    const EARN = [
        { id: 'certificate',    label: 'Certificate' },
        { id: 'diploma',        label: 'Technical diploma' },
        { id: 'apprenticeship', label: 'Apprenticeship' },
        { id: 'associate',      label: 'Associate' },
        { id: 'bachelor',       label: "Bachelor's" },
        { id: 'gradcert',       label: 'Graduate certificate' },
        { id: 'graduate',       label: 'Graduate degree' },
        { id: 'ged',            label: 'GED or diploma' },
        { id: 'highschool',     label: 'High school pathway' },
    ];
    const FIELDS = {
        healthcare: 'Healthcare', trades: 'Skilled trades', manufacturing: 'Manufacturing & engineering', logistics: 'Logistics & driving',
        it: 'IT & cybersecurity', business: 'Business', education: 'Education', publicsafety: 'Public safety', aviation: 'Aviation',
        hospitality: 'Hospitality & culinary', personal: 'Barbering & cosmetology', media: 'Arts, design & media', science: 'Science & math',
        social: 'Social services, law & humanities', basic: 'GED, English & job readiness', general: 'General studies',
    };
    const earnLabel = id => (EARN.find(e => e.id === id) || { label: id === 'none' ? 'Skills' : id }).label;
    const DOOR_TEXT = {
        support: 'Help getting a job or keeping one: unemployment and job search, disability services, re-entry, shelter and recovery, and help paying for training.',
        employers: 'Partners for hiring and growing a workforce: recruiting help, training funds, apprenticeships, work-release hiring, and business growth.',
    };

    // ----- State, kept in the address -----
    const params = new URLSearchParams(location.search);
    const state = {
        door: ['training', 'support', 'employers'].includes(params.get('for')) ? params.get('for') : 'training',
        q: params.get('q') || '', field: params.get('field') || '', online: params.get('online') === '1',
        len: new Set(params.getAll('len')), earn: new Set(params.getAll('earn')),
        place: params.get('place') || '',   // a town picked on the Where map
    };
    function saveState() {
        const p = new URLSearchParams(location.search);
        ['for', 'q', 'field', 'online', 'len', 'earn', 'place'].forEach(k => p.delete(k));
        if (state.door !== 'training') p.set('for', state.door);
        if (state.door === 'training') {
            if (state.q.trim()) p.set('q', state.q.trim());
            if (state.field) p.set('field', state.field);
            if (state.online) p.set('online', '1');
            if (state.place) p.set('place', state.place);
            state.len.forEach(v => p.append('len', v));
            state.earn.forEach(v => p.append('earn', v));
        }
        const qs = p.toString();
        history.replaceState(null, '', location.pathname + (qs ? '?' + qs : '') + location.hash);
    }
    const filtering = () => !!(state.q.trim() || state.field || state.online || state.len.size || state.earn.size || state.place);

    let programs = [], orgs = {}, shownPrograms = [], limit = PAGE;
    const orgName = id => (orgs[id] && orgs[id].name) || id;

    // ----- Search: every word must appear somewhere; names count most -----
    // The shorthand people actually type, mapped to how programs are named
    const SYNONYMS = {
        cdl: ['commercial driving'], truck: ['commercial driving', 'diesel'], trucking: ['commercial driving', 'diesel'], driver: ['commercial driving'],
        cna: ['nurse aide'], lpn: ['practical nursing'], rn: ['nursing'], nurse: ['nurs'], hvac: ['air conditioning', 'hvac'],
        ekg: ['electrocardiography', 'ekg'], emt: ['emergency medical'], it: ['information technology', 'computer', 'network'],
        electrician: ['electric', 'wiring'], mechanic: ['automotive', 'diesel', 'mechanic'], forklift: ['forklift', 'warehous'],
        medic: ['medic', 'paramedic'], coding: ['coding', 'programm'], teacher: ['teach', 'educat'], cosmetology: ['cosmetolog'],
        welder: ['weld'], welding: ['weld'], plumber: ['plumb'], plumbing: ['plumb'], cyber: ['cyber'], ai: ['artificial intelligence', 'generative ai', ' ai'],
    };
    function score(p, words) {
        let s = 0;
        for (const w of words) {
            // Very short words (it, ai, rn) would match inside other words, so they use only their synonyms
            const alts = SYNONYMS[w] ? (w.length <= 3 ? SYNONYMS[w] : [w].concat(SYNONYMS[w])) : [w];
            if (alts.some(a => p.nameL.includes(a))) s += 3;
            else if (alts.some(a => p.hay.includes(a))) s += 1;
            else return -1;
        }
        return s;
    }
    const BUCKET_ORDER = { weeks: 0, months: 1, '1to2': 2, '3plus': 3 };
    // Everything but the town filter (the Where map counts each town from these), then the town
    let beforePlace = [];
    function filterPrograms() {
        const words = state.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
        const out = [];
        for (const p of programs) {
            if (state.field && p.field !== state.field) continue;
            if (state.online && !p.online) continue;
            if (state.len.size && !state.len.has(p.bucket)) continue;
            if (state.earn.size && !state.earn.has(p.earn)) continue;
            const s = words.length ? score(p, words) : 0;
            if (s < 0) continue;
            out.push([s, p]);
        }
        // Best matches first when searching; otherwise quickest first, then by name
        out.sort((a, b) => (b[0] - a[0]) || (BUCKET_ORDER[a[1].bucket] - BUCKET_ORDER[b[1].bucket]) || a[1].name.localeCompare(b[1].name));
        beforePlace = out.map(x => x[1]);
        return state.place ? beforePlace.filter(p => (p.places || []).includes(state.place)) : beforePlace;
    }

    // ----- Rendering -----
    const chip = (kind, value, label, on, tip) => `<button type="button" class="fchip${on ? ' is-on' : ''}" data-kind="${kind}" data-value="${esc(value)}" aria-pressed="${on}"${tip ? ` title="${esc(tip)}"` : ''}>${esc(label)}</button>`;
    function renderControls() {
        document.getElementById('finder-length').innerHTML = LENGTHS.map(l => chip('len', l.id, l.label, state.len.has(l.id), l.tip)).join('');
        // Only the kinds of credential that exist in the catalog
        const have = new Set(programs.map(p => p.earn));
        document.getElementById('finder-earn').innerHTML = EARN.filter(e => have.has(e.id)).map(e => chip('earn', e.id, e.label, state.earn.has(e.id))).join('');
        const n = state.len.size + state.earn.size + (state.field ? 1 : 0) + (state.online ? 1 : 0);
        document.getElementById('finder-filters-btn').innerHTML = n ? `Filters <b>${n}</b>` : 'Filters';
        document.querySelectorAll('.door').forEach(d => {
            const on = d.dataset.door === state.door;
            d.classList.toggle('is-on', on); d.setAttribute('aria-selected', String(on));
        });
    }
    function logo(org) {
        const a = orgs[org] || {};
        return a.image ? `<img src="${esc(a.image)}" alt="" loading="lazy"${a.logoFit === 'contain' ? ' class="is-contain"' : ''}${a.logoBg ? ` style="background:${esc(a.logoBg)}"` : ''}>` : '<i></i>';
    }
    // Two lines: the name and what you earn; then length · cost · who · where. The card is the link.
    const shortLength = t => String(t || '').replace(/\s*\(.*\)$/, '').replace(' full time', '');
    const shortCost = t => String(t || '').replace(/ tuition.*$/, '').replace(/ · .*$/, '');
    function programHTML(p) {
        const towns = (p.places || []).length;
        const where = towns > 1 ? `${towns} campuses` : p.campus && p.campus !== 'See the program page' ? p.campus.replace(/ · also online$/, '') : '';
        const tipBits = [p.credential, p.length, p.cost, p.campus, p.options && p.options.length ? 'Options: ' + p.options.join(', ') : '', p.leadsTo].filter(Boolean);
        const meta = [shortLength(p.length), shortCost(p.cost), orgName(p.org), where, p.online && towns ? 'online too' : ''].filter(Boolean);
        return `<li data-key="${esc(p.id)}" data-org="${esc(p.org)}"><a class="pcard" href="${esc(p.url)}" target="_blank" rel="noopener" title="${esc(tipBits.join('\n'))}">
            <span class="pcard__top"><b class="pcard__name">${esc(p.name)}</b><b class="earn earn--${esc(p.earn)}">${esc(earnLabel(p.earn))}</b></span>
            <span class="pcard__meta">${meta.map(esc).join('<i>·</i>')}${p.verify ? '<i>·</i><em>call to confirm</em>' : ''}</span>
            <span class="sr-only"> (program page, opens in a new tab)</span>
        </a></li>`;
    }
    // Before any search or filter: one tile per field, with how many programs it has
    function renderFields() {
        const counts = {};
        programs.forEach(p => { counts[p.field] = (counts[p.field] || 0) + 1; });
        document.getElementById('finder-fields').innerHTML = Object.entries(FIELDS).filter(([k]) => counts[k])
            .sort((a, b) => counts[b[0]] - counts[a[0]])
            .map(([k, v]) => `<li><button type="button" class="ftile" data-field="${k}"><b>${esc(v)}</b><span>${counts[k]} program${counts[k] === 1 ? '' : 's'}</span></button></li>`).join('');
    }
    function flip(list, render) {
        const before = new Map(Array.from(list.children).map(el => [el.dataset.key, el.getBoundingClientRect().top]));
        render();
        if (reduce) return;
        Array.from(list.children).forEach((el, i) => {
            if (!el.animate || i > 20) return;
            const was = before.get(el.dataset.key), top = el.getBoundingClientRect().top;
            el.animate(was !== undefined ? [{ transform: `translateY(${was - top}px)` }, { transform: 'none' }]
                                         : [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }],
                       { duration: 360, delay: Math.min(i, 10) * 15, easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)', fill: 'backwards' });
        });
    }
    function renderPrograms() {
        shownPrograms = filterPrograms();
        const page = shownPrograms.slice(0, limit);
        flip(progEl, () => { progEl.innerHTML = page.map(programHTML).join(''); });
        const more = document.getElementById('finder-more');
        more.hidden = shownPrograms.length <= limit;
        more.textContent = `Show more (${(shownPrograms.length - limit).toLocaleString()} more)`;
        document.getElementById('finder-empty').hidden = shownPrograms.length > 0;
        const orgCount = new Set(shownPrograms.map(p => p.org)).size;
        const inTown = state.place && window.WFWhere ? ` in ${WFWhere.label(state.place)}` : '';
        document.getElementById('finder-count').textContent = filtering()
            ? `${shownPrograms.length.toLocaleString()} of ${programs.length.toLocaleString()} programs${inTown}, from ${orgCount} organization${orgCount === 1 ? '' : 's'}`
            : `All ${programs.length.toLocaleString()} programs, from ${orgCount} organizations`;
    }
    function orgHTML([id, a]) {
        return `<li data-key="${esc(id)}" data-org="${esc(id)}"><article class="ocard">
            <span class="ocard__logo">${logo(id)}</span>
            <div class="ocard__text">
                <h3 class="ocard__name">${esc(a.name)}</h3>
                ${a.bestFor ? `<p class="ocard__best">${esc(a.bestFor)}</p>` : ''}
                ${a.bestForWhy ? `<p class="ocard__why">${esc(a.bestForWhy)}</p>` : ''}
                <p class="ocard__actions"><button type="button" class="ocard__more" data-org="${esc(id)}">Details</button>${a.website ? `<a href="${esc(a.website)}" target="_blank" rel="noopener">Website <span aria-hidden="true">↗</span></a>` : ''}</p>
            </div>
        </article></li>`;
    }
    function renderOrgs() {
        const list = Object.entries(orgs).filter(([, a]) => (a.doors || []).includes(state.door));
        document.getElementById('orgs-dek').textContent = DOOR_TEXT[state.door] || '';
        const el = document.getElementById('finder-orgs');
        flip(el, () => { el.innerHTML = list.map(orgHTML).join(''); });
        return list.map(([id]) => id);
    }

    // ----- The corner map -----
    function lightMap(ids) {
        if (!window.WFMap || !WFMap.ready()) return;
        if (!ids) { WFMap.highlight(null); return; }
        const cats = ids.map(id => orgs[id] && orgs[id].category).filter(Boolean);
        WFMap.highlight(ids.concat(cats, ['hub']));
    }
    let lit = null;
    function update() {
        const training = state.door === 'training';
        document.getElementById('view-training').hidden = !training;
        document.getElementById('view-orgs').hidden = training;
        renderControls();
        if (training) {
            const listing = filtering();
            ['finder-programs', 'finder-status'].forEach(id => { document.getElementById(id).hidden = !listing; });
            document.getElementById('finder-fields').hidden = listing;
            if (listing) renderPrograms();
            else { shownPrograms = filterPrograms(); ['finder-more', 'finder-empty'].forEach(id => { document.getElementById(id).hidden = true; }); }
            lit = listing ? Array.from(new Set(shownPrograms.map(p => p.org))) : null;
        } else {
            lit = renderOrgs();
        }
        lightMap(lit);
        document.dispatchEvent(new CustomEvent('finder:update', { detail: { door: state.door, programs: training ? beforePlace : [], place: state.place, filtering: filtering() } }));
        const note = document.getElementById('minimap-note');
        if (note) note.textContent = lit ? `Lit up: the ${lit.length} organization${lit.length === 1 ? '' : 's'} behind what's showing below.` : DEFAULT_NOTE;
        saveState();
    }
    const waitForMap = setInterval(() => { if (window.WFMap && WFMap.ready()) { clearInterval(waitForMap); lightMap(lit); } }, 150);
    setTimeout(() => clearInterval(waitForMap), 15000);
    document.addEventListener('minimap:toggle', () => setTimeout(() => lightMap(lit), 80));
    const panel = document.getElementById('viz-info-panel');
    if (panel) new MutationObserver(() => { if (!panel.classList.contains('open')) setTimeout(() => lightMap(lit), 60); })
        .observe(panel, { attributes: true, attributeFilter: ['class'] });

    const qEl = document.getElementById('finder-q'), fieldEl = document.getElementById('finder-field'), onlineEl = document.getElementById('finder-online');
    const noteEl = document.getElementById('minimap-note');
    let DEFAULT_NOTE = noteEl ? noteEl.textContent : '';

    // ----- Events -----
    const filtersBtn = document.getElementById('finder-filters-btn'), filtersPanel = document.getElementById('finder-filters');
    filtersBtn.addEventListener('click', () => {
        filtersPanel.hidden = !filtersPanel.hidden;
        filtersBtn.setAttribute('aria-expanded', String(!filtersPanel.hidden));
        filtersBtn.classList.toggle('is-open', !filtersPanel.hidden);
    });
    document.getElementById('finder-fields').addEventListener('click', e => {
        const t = e.target.closest('.ftile');
        if (!t) return;
        state.field = t.dataset.field; fieldEl.value = state.field; limit = PAGE; update();
        document.getElementById('view-training').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    });
    document.querySelector('.doors').addEventListener('click', e => {
        const d = e.target.closest('.door');
        if (!d || d.dataset.door === state.door) return;
        state.door = d.dataset.door; limit = PAGE; update();
    });
    document.querySelector('.finder-filters').addEventListener('click', e => {
        const b = e.target.closest('.fchip');
        if (!b) return;
        const set = b.dataset.kind === 'len' ? state.len : state.earn;
        set.has(b.dataset.value) ? set.delete(b.dataset.value) : set.add(b.dataset.value);
        limit = PAGE; update();
    });
    let qt;
    qEl.addEventListener('input', () => { clearTimeout(qt); qt = setTimeout(() => { state.q = qEl.value; limit = PAGE; update(); }, 140); });
    fieldEl.addEventListener('change', () => { state.field = fieldEl.value; limit = PAGE; update(); });
    onlineEl.addEventListener('change', () => { state.online = onlineEl.checked; limit = PAGE; update(); });
    document.getElementById('finder-more').addEventListener('click', () => { limit += PAGE * 2; renderPrograms(); });
    const clearAll = () => { state.q = ''; state.field = ''; state.online = false; state.place = ''; state.len.clear(); state.earn.clear(); qEl.value = ''; fieldEl.value = ''; onlineEl.checked = false; limit = PAGE; update(); };
    document.getElementById('finder-clear').addEventListener('click', clearAll);
    document.getElementById('finder-empty-clear').addEventListener('click', clearAll);

    // Hovering a program or organization picks out its organization on the map; its name opens the details
    const finder = document.querySelector('.finder-main');
    finder.addEventListener('mouseover', e => {
        const li = e.target.closest('li[data-org]');
        if (!li) return;
        if (window.WFMap) WFMap.hover(li.dataset.org);
        const prog = li.dataset.key && programs.find(p => p.id === li.dataset.key);
        document.dispatchEvent(new CustomEvent('finder:hover', { detail: { places: prog ? prog.places || [] : [] } }));
    });
    finder.addEventListener('mouseleave', () => {
        if (window.WFMap) WFMap.hover(null);
        document.dispatchEvent(new CustomEvent('finder:hover', { detail: { places: [] } }));
    });
    // The Where map picks (or clears) a town
    window.WFFinder = { setPlace(place) { state.place = state.place === place ? '' : (place || ''); limit = PAGE; update(); } };
    finder.addEventListener('click', e => {
        const b = e.target.closest('.ocard__more');
        if (b) openAssetModal(b.dataset.org, { sheet: true });
    });

    // ----- Start once both the programs and the organizations are loaded -----
    let gotAssets = typeof assetData !== 'undefined' && Object.keys(assetData).length > 0;
    let gotPrograms = false;
    function start() {
        if (!gotAssets || !gotPrograms) return;
        orgs = assetData;
        const counts = { support: 0, employers: 0 };
        Object.values(orgs).forEach(a => (a.doors || []).forEach(d => { if (d in counts) counts[d]++; }));
        document.getElementById('door-count-training').textContent = programs.length.toLocaleString();
        document.getElementById('door-count-support').textContent = counts.support;
        document.getElementById('door-count-employers').textContent = counts.employers;
        programs.forEach(p => {
            p.nameL = p.name.toLowerCase();
            p.hay = [p.name, p.credential, p.leadsTo, (p.options || []).join(' '), orgName(p.org), FIELDS[p.field], earnLabel(p.earn), p.campus].join(' ').toLowerCase();
        });
        const used = new Set(programs.map(p => p.field));
        fieldEl.innerHTML = '<option value="">All fields</option>' + Object.entries(FIELDS).filter(([k]) => used.has(k))
            .map(([k, v]) => `<option value="${k}">${esc(v)} (${programs.filter(p => p.field === k).length})</option>`).join('');
        qEl.value = state.q; fieldEl.value = state.field; onlineEl.checked = state.online;
        const orgTotal = Object.keys(orgs).length;
        DEFAULT_NOTE = `${orgTotal} organizations and ${programs.length.toLocaleString()} programs across Greater Macon, by the kind of help they offer.`;
        if (state.len.size || state.earn.size || state.online) { filtersPanel.hidden = false; filtersBtn.setAttribute('aria-expanded', 'true'); filtersBtn.classList.add('is-open'); }
        renderFields();
        update();
    }
    if (!gotAssets) document.addEventListener('assets:loaded', () => { gotAssets = true; start(); }, { once: true });
    fetch('content/programs.json').then(r => r.json()).then(d => {
        programs = d.programs || [];
        const checked = document.getElementById('finder-checked');
        if (checked && d.built) checked.textContent = new Date(d.built + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        gotPrograms = true; start();
    }).catch(err => console.error('Program catalog failed to load', err));
})();
