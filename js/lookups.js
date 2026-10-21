/* ===== THE THREE TOOLS — homepage stops 2–4 =====
   After the commuting story, three tools people can come back to, each
   deliberately limited to the essentials (the depth is what custom research is for):

   - Jobs (#jobs): search any of ~800 occupations, or browse the top 10 by
     most common, best paid, fastest growing or most openings
     (data/Occupation Snapshot.csv, OES-based).
   - Industries (#industries): beside the donut (js/workforce-data.js), a switch
     between the biggest sectors, Macon's specialties (location quotient) and
     what commuters come in for, plus a search across all industries
     (data/Industry Snapshot.csv, QCEW-based).
   - Hiring (#hiring): active online job ads by employer or by industry, with
     a filter (data/Bibb Top Employers.csv, data/Top Hiring Industries.csv).

   Picking something puts it in the address (#jobs/registered-nurses,
   #industries/hospitals), so a link reopens the tool on it. */
(function () {
    'use strict';
    if (!window.d3) return;
    const num = v => +String(v == null ? '' : v).replace(/[$,%]/g, '') || 0;
    const fmt = n => Math.round(n).toLocaleString();
    const money = n => '$' + (Math.round(n / 100) * 100).toLocaleString();
    const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const timesUS = lq => (lq >= 10 ? Math.round(lq) : lq.toFixed(1)) + '×';
    const mobile = () => window.innerWidth <= 768;

    // ----- Links into a tool: #<stop>/<item> -----
    const slug = s => String(s).toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    // Chapters from the earlier homepage, so old links still land somewhere sensible
    const OLD = { 'section-kpis': 'industries', 'section-industries': 'industries', 'section-occupations': 'jobs',
                  'section-hiring': 'hiring', 'section-demographics': 'custom-research', 'section-explore': 'custom-research' };
    const openers = {};
    const jumpTo = id => { const el = document.getElementById(id); if (el) el.scrollIntoView({ behavior: 'instant', block: 'start' }); };
    function route() {
        const [stop, item] = decodeURIComponent(location.hash.slice(1)).split('/');
        if (OLD[stop]) { history.replaceState(null, '', '#' + OLD[stop]); jumpTo(OLD[stop]); return; }
        if (item && openers[stop]) { openers[stop](item); jumpTo(stop); }   // an unknown item still lands on its tool
    }
    function register(stop, open) {
        openers[stop] = open;
        if (location.hash.slice(1).split('/')[0] === stop) route();   // a link into this tool, now that its data is here
    }
    const remember = (stop, name) => history.replaceState(null, '', '#' + stop + '/' + slug(name));
    addEventListener('hashchange', route);

    // A row of buttons that picks one view ([data-view]); calls onPick(view)
    function segmented(root, onPick) {
        const btns = Array.from(root.querySelectorAll('[data-view]'));
        const pick = v => {
            btns.forEach(b => { const on = b.dataset.view === v; b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', String(on)); });
            onPick(v);
        };
        btns.forEach(b => b.addEventListener('click', () => pick(b.dataset.view)));
        return pick;
    }

    // A text box with a short list of matches (biggest first); Enter picks the top match
    function typeahead({ input, list, items, label, onPick }) {
        let matches = [];
        const show = () => {
            const q = input.value.trim().toLowerCase();
            matches = q.length < 2 ? [] : items.filter(it => label(it).toLowerCase().includes(q)).slice(0, 6);
            list.innerHTML = matches.map((it, i) => `<li><button type="button" data-i="${i}">${esc(label(it))}</button></li>`).join('');
            list.hidden = !matches.length;
        };
        input.addEventListener('input', show);
        input.addEventListener('keydown', e => {
            if (e.key === 'Enter' && matches[0]) { e.preventDefault(); pick(matches[0]); }
            if (e.key === 'Escape') { list.hidden = true; }
        });
        list.addEventListener('mousedown', e => e.preventDefault());   // keep focus in the box so the click lands
        list.addEventListener('click', e => { const b = e.target.closest('button'); if (b) pick(matches[+b.dataset.i]); });
        input.addEventListener('blur', () => setTimeout(() => { list.hidden = true; }, 150));
        function pick(it) { input.value = label(it); list.hidden = true; onPick(it); }
    }

    // ----- Jobs -----
    d3.csv('data/Occupation Snapshot.csv').then(rows => {
        const jobs = rows.filter(r => r['SOC'] && r['SOC'].slice(-2) !== '00' && num(r['Empl']) > 0 && num(r['Mean Ann Wages2']) > 0)
            .map(r => ({ name: r['Occupation'].trim(), empl: num(r['Empl']), wage: num(r['Mean Ann Wages2']),
                         openings: num(r['Total Demand']), growth: num(r['Ann % Growth']) }))
            .sort((a, b) => b.empl - a.empl);
        const pct = g => (g > 0 ? '+' : '') + (g * 100).toFixed(1) + '%';
        // Each ranking, with a floor on size where a handful of jobs would swamp it
        const SORTS = {
            common:   { key: j => j.empl,     min: 0,   val: j => fmt(j.empl) + ' jobs',     note: 'Ranked by jobs in Macon-Bibb.' },
            paid:     { key: j => j.wage,     min: 30,  val: j => money(j.wage),             note: 'Ranked by average pay, among jobs with at least 30 positions here.' },
            growing:  { key: j => j.growth,   min: 100, val: j => pct(j.growth) + ' a year', note: 'Ranked by projected growth a year, among jobs with at least 100 positions here.' },
            openings: { key: j => j.openings, min: 0,   val: j => '~' + fmt(j.openings) + ' a year', note: 'Ranked by openings a year: new jobs plus people retiring or changing careers.' },
        };
        const out = document.getElementById('job-result'), list = document.getElementById('job-rank'), note = document.getElementById('job-rank-note');
        const outlook = g => g > 0.005 ? ['Growing', 'is-up'] : g < -0.005 ? ['Shrinking', 'is-down'] : ['Steady', ''];
        let current = jobs[0], ranked = [];
        function show(j) {
            current = j;
            const [word, cls] = outlook(j.growth);
            out.innerHTML = `<h4>${esc(j.name)}</h4>
                <dl class="tool-stats">
                    <div><dt>Average pay</dt><dd>${money(j.wage)}</dd></div>
                    <div><dt>Jobs in Macon-Bibb</dt><dd>${fmt(j.empl)}</dd></div>
                    <div><dt>Openings a year</dt><dd>~${fmt(j.openings)}</dd></div>
                    <div><dt>Outlook</dt><dd class="${cls}">${word}</dd></div>
                </dl>`;
            list.querySelectorAll('button').forEach(b => b.classList.toggle('is-hot', ranked[+b.dataset.i] === j));
        }
        function rank(view) {
            const s = SORTS[view];
            ranked = jobs.filter(j => j.empl >= s.min).sort((a, b) => s.key(b) - s.key(a)).slice(0, 10);
            list.innerHTML = ranked.map((j, i) => `<li><button type="button" data-i="${i}"><b>${i + 1}</b><span>${esc(j.name)}</span><em>${s.val(j)}</em></button></li>`).join('');
            note.textContent = s.note;
            show(current);
        }
        list.addEventListener('click', e => { const b = e.target.closest('button'); if (b) { show(ranked[+b.dataset.i]); remember('jobs', current.name); } });
        const count = document.getElementById('job-count');
        if (count) count.textContent = jobs.length.toLocaleString();
        typeahead({ input: document.getElementById('job-q'), list: document.getElementById('job-list'), items: jobs, label: j => j.name,
                    onPick: j => { show(j); remember('jobs', j.name); } });
        segmented(document.getElementById('job-sorts'), rank)('common');
        register('jobs', s => { const j = jobs.find(j => slug(j.name) === s); if (j) show(j); return !!j; });
    }).catch(err => console.error('Job lookup failed to load', err));

    // ----- Industries -----
    const indPanes = Array.from(document.querySelectorAll('#industries [data-pane]'));
    segmented(document.getElementById('ind-views'), v => indPanes.forEach(p => { p.hidden = p.dataset.pane !== v; }))('biggest');
    d3.csv('data/Industry Snapshot.csv').then(rows => {
        const inds = rows.filter(r => (r['NAICS'] || '').trim() && num(r['Empl']) > 0)
            .map(r => ({ name: r['Industry'].trim(), empl: num(r['Empl']), wage: num(r['Avg Ann Wages']), lq: num(r['LQ']), change: num(r['Empl Change']) }))
            .sort((a, b) => b.empl - a.empl);
        const out = document.getElementById('strength-result'), input = document.getElementById('strength-q');
        function show(i) {
            const conc = i.lq >= 1.2 ? `${timesUS(i.lq)} the U.S. concentration` : i.lq <= 0.8 ? `less concentrated than the U.S. (${i.lq.toFixed(2)}×)` : 'about the U.S. average';
            out.innerHTML = `<h4>${esc(i.name)}</h4>
                <dl class="tool-stats">
                    <div><dt>Jobs in Macon-Bibb</dt><dd>${fmt(i.empl)}</dd></div>
                    <div><dt>Average wage</dt><dd>${money(i.wage)}</dd></div>
                    <div><dt>Concentration</dt><dd>${conc}</dd></div>
                    <div><dt>Recent change</dt><dd class="${i.change > 0 ? 'is-up' : i.change < 0 ? 'is-down' : ''}">${i.change > 0 ? '+' : ''}${fmt(i.change)} jobs</dd></div>
                </dl>`;
            out.hidden = false;
        }
        const pick = i => { input.value = i.name; show(i); remember('industries', i.name); };
        // Specialties: much more concentrated here than nationally, and big enough to matter
        const top = inds.filter(i => i.lq >= 2 && i.empl >= 200).sort((a, b) => b.lq - a.lq).slice(0, 8);
        const strengths = document.getElementById('strength-list');
        strengths.innerHTML = top.map((i, k) => `<li><button type="button" data-i="${k}">
            <b>${timesUS(i.lq)}</b><span>${esc(i.name)}</span><small>${fmt(i.empl)} jobs · ${money(i.wage)} avg</small></button></li>`).join('');
        strengths.addEventListener('click', e => { const b = e.target.closest('button'); if (b) pick(top[+b.dataset.i]); });
        typeahead({ input, list: document.getElementById('strength-qlist'), items: inds, label: i => i.name, onPick: pick });
        register('industries', s => { const i = inds.find(i => slug(i.name) === s); if (i) { input.value = i.name; show(i); } return !!i; });
    }).catch(err => console.error('Industry lookup failed to load', err));

    // ----- Hiring -----
    const SHORT_NAMES = {
        'Health Care and Social Assistance':                                         'Health Care & Social Assistance',
        'Accommodation and Food Services':                                          'Accommodation & Food',
        'Administrative and Support and Waste Management and Remediation Services': 'Admin & Support Services',
        'Other Services (except Public Administration)':                            'Other Services',
        'Transportation and Warehousing':                                           'Transportation & Warehousing',
        'Professional, Scientific, and Technical Services':                         'Prof. & Technical Services',
        'Management of Companies and Enterprises':                                  'Management of Companies',
        'Real Estate and Rental and Leasing':                                       'Real Estate & Leasing',
        'Arts, Entertainment, and Recreation':                                      'Arts & Entertainment',
        'Finance and Insurance':                                                    'Finance & Insurance',
    };
    Promise.all([d3.csv('data/Bibb Top Employers.csv'), d3.csv('data/Top Hiring Industries.csv')]).then(([emp, ind]) => {
        const byDesc = (a, b) => b.value - a.value;
        const data = {
            employers:  emp.filter(d => d.Company && d['Active Jobs']).map(d => ({ label: d.Company.trim(), value: num(d['Active Jobs']) })).sort(byDesc),
            industries: ind.filter(d => d.Industry && d['Active Job Ads']).map(d => ({ label: SHORT_NAMES[d.Industry] || d.Industry, value: num(d['Active Job Ads']) })).sort(byDesc),
        };
        const el = document.getElementById('hiring-bars'), input = document.getElementById('hire-q'), more = document.getElementById('hire-more');
        let view = 'employers', expanded = false;
        function render() {
            const q = input.value.trim().toLowerCase();
            const all = data[view].filter(r => !q || r.label.toLowerCase().includes(q));
            const short = mobile() ? 6 : 10, rows = expanded || q ? all : all.slice(0, short);
            const max = d3.max(data[view], r => r.value);
            el.innerHTML = rows.length ? rows.map(r => `
                <div class="demo-bar-row">
                    <div class="demo-bar-label wide-label" title="${esc(r.label)}">${esc(r.label)}</div>
                    <div class="demo-bar-track"><div class="demo-bar-fill" style="width:${(r.value / max * 100).toFixed(1)}%;background:${view === 'employers' ? '#2dd4bf' : '#f2c46b'};"></div></div>
                    <div class="occ-bar-val">${r.value.toLocaleString()}</div>
                </div>`).join('') : `<p class="tool-empty">No ${view} match “${esc(input.value.trim())}” in this snapshot.</p>`;
            more.hidden = !!q || all.length <= short;
            more.textContent = expanded ? '▲ Show fewer' : `▼ Show all ${all.length}`;
        }
        input.placeholder = 'Filter employers';
        segmented(document.getElementById('hire-views'), v => {
            view = v; expanded = false; input.value = '';
            input.placeholder = v === 'employers' ? 'Filter employers' : 'Filter industries';
            render();
        })('employers');
        input.addEventListener('input', render);
        more.addEventListener('click', () => { expanded = !expanded; render(); });
        let resizeT; addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(render, 250); });   // phone vs. desktop list length

        const total = d3.sum(data.industries, d => d.value), top = data.industries[0];
        const totalEl = document.getElementById('hire-total'), findEl = document.getElementById('find-hiring');
        if (totalEl) totalEl.textContent = total.toLocaleString();
        if (findEl && top) findEl.innerHTML = `<em>${esc(top.label.replace(' & Social Assistance', ''))}</em> is hiring the most, with <em>${top.value.toLocaleString()}</em> openings.`;
    }).catch(err => console.error('Hiring data failed to load', err));

    // Plain links to a stop, or a chapter from the earlier homepage
    if (OLD[location.hash.slice(1)]) route();
})();
