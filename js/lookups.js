/* ===== THE THREE TOOLS — homepage stops 2–4 =====
   After the commuting story, three tools people can come back to, each
   deliberately limited to the essentials (the depth is what custom research is for):

   - Jobs (#jobs): search any of ~800 occupations, or browse the top 8 by
     most common, best paid or fastest growing; each job's pay and count, with its pay
     is shown against the average job located in Macon-Bibb (data/Occupation Snapshot.csv, OES-based).
     The data counts jobs where they are, not where workers live, so jobs held by
     commuters from neighboring counties are included in every figure.
   - Industries (#industries): beside the donut (js/workforce-data.js), a switch
     between the biggest sectors, Macon's specialties (location quotient) and
     what commuters come in for, each lighting its slices of the donut, plus a
     search that swings the donut to the industry's sector (data/Industry Snapshot.csv).
   - Your county (#counties) lives in js/county-explorer.js and uses the helpers below.

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
    const reduce = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

    // ----- Phones: long lists show their top few, with a button for the rest -----
    // The cap is a class on the list (css/chapters.css hides the rows past it at phone width),
    // so it holds however often the list redraws; the button only shows when there's more.
    function phoneCap(listEl, more) {
        if (!listEl) return;
        listEl.classList.add('is-capped');
        const btn = document.createElement('button');
        btn.type = 'button'; btn.className = 'cap-more';
        const label = () => { btn.textContent = listEl.classList.contains('is-open') ? 'Show fewer' : more; };
        btn.addEventListener('click', () => { listEl.classList.toggle('is-open'); label(); });
        listEl.after(btn);
        const fit = () => {
            const cap = +getComputedStyle(listEl).getPropertyValue('--cap') || Infinity;   // no cap above phone width
            btn.hidden = listEl.querySelectorAll(':scope > li:not(.donut-legend__head)').length <= cap;
        };
        addEventListener('resize', fit);
        new MutationObserver(fit).observe(listEl, { childList: true });
        label(); fit();
    }
    phoneCap(document.getElementById('job-rank'), 'Show 3 more');
    phoneCap(document.getElementById('strength-list'), 'Show all specialties');
    phoneCap(document.getElementById('donut-legend'), 'Show every sector');

    // ----- Links into a tool: #<stop>/<item> -----
    const slug = s => String(s).toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    // Chapters from the earlier homepage, so old links still land somewhere sensible
    const OLD = { 'section-kpis': 'industries', 'section-industries': 'industries', 'section-occupations': 'jobs',
                  'section-hiring': 'counties', 'hiring': 'counties', 'section-demographics': 'custom-research', 'section-explore': 'custom-research' };
    const openers = {};
    // A stop that lives inside the 3D story (#counties: its finished map) is the story's to land on
    const jumpTo = id => {
        const el = document.getElementById(id);
        if (el) el.scrollIntoView({ behavior: 'instant', block: 'start' });
        else if (window.WFStory) WFStory.goTo(id);
    };
    function route() {
        const [stop, item] = decodeURIComponent(location.hash.slice(1)).split('/');
        if (OLD[stop]) { history.replaceState(null, '', '#' + OLD[stop]); jumpTo(OLD[stop]); return; }
        if (item && openers[stop]) { openers[stop](item); jumpTo(stop); }   // an unknown item still lands on its tool
    }
    // Each tool's data arrives at its own pace and changes the page's height, so a plain
    // link to a stop (#counties) is re-landed as each one loads, until the visitor scrolls
    let touched = false;
    ['wheel', 'touchmove', 'keydown', 'pointerdown'].forEach(ev => addEventListener(ev, () => { touched = true; }, { passive: true, once: true }));
    const plainStop = () => { const id = location.hash.slice(1); return id && !id.includes('/') && document.getElementById(id) && !OLD[id] ? id : null; };
    function register(stop, open) {
        openers[stop] = open;
        if (location.hash.slice(1).split('/')[0] === stop) route();   // a link into this tool, now that its data is here
        else if (plainStop() && !touched) jumpTo(plainStop());
    }
    const remember = (stop, name) => history.replaceState(null, '', '#' + stop + '/' + slug(name));
    addEventListener('hashchange', route);

    // ----- Motion helpers -----
    // A row of buttons that picks one view ([data-view]), with a gold pill that slides to it
    function segmented(root, onPick) {
        const btns = Array.from(root.querySelectorAll('[data-view]'));
        const pill = document.createElement('span');
        pill.className = 'seg__pill'; pill.setAttribute('aria-hidden', 'true');
        root.prepend(pill);
        let current = null;
        const place = () => {
            const b = btns.find(b => b.dataset.view === current);
            if (!b || !b.offsetWidth) return;
            pill.style.width = b.offsetWidth + 'px'; pill.style.height = b.offsetHeight + 'px';
            pill.style.transform = `translate(${b.offsetLeft}px, ${b.offsetTop}px)`;
        };
        const pick = v => {
            current = v;
            btns.forEach(b => { const on = b.dataset.view === v; b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', String(on)); });
            place(); onPick(v);
        };
        btns.forEach(b => b.addEventListener('click', () => pick(b.dataset.view)));
        addEventListener('resize', place);
        if (document.fonts) document.fonts.ready.then(place);
        new IntersectionObserver(() => place()).observe(root);   // sizes are only known once it's on screen
        pick.current = () => current;
        return pick;
    }

    // Re-render a list, then slide each row from where it was to where it is now (keyed by
    // data-key); new rows rise in, and each row's [data-bar] grows from its old width
    function flip(list, render) {
        const before = new Map(Array.from(list.children).map(el => {
            const bar = el.querySelector('[data-bar]');
            return [el.dataset.key, { top: el.getBoundingClientRect().top, w: bar ? bar.style.width : null }];
        }));
        render();
        if (reduce) return;
        Array.from(list.children).forEach((el, i) => {
            if (!el.animate) return;
            const was = before.get(el.dataset.key), top = el.getBoundingClientRect().top;
            const ease = { duration: 480, delay: i * 22, easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)', fill: 'backwards' };
            el.animate(was ? [{ transform: `translateY(${was.top - top}px)` }, { transform: 'none' }]
                           : [{ transform: 'translateY(10px)', opacity: 0 }, { transform: 'none', opacity: 1 }], ease);
            const bar = el.querySelector('[data-bar]');
            if (bar && bar.animate) bar.animate([{ width: was && was.w ? was.w : '0%' }, { width: bar.style.width }], { ...ease, duration: 620 });
        });
    }

    // Numbers in a card ([data-num], [data-f] = format) count from the last value shown to the new one
    const FORMATS = { money, int: fmt, approx: n => '~' + fmt(n) };
    function countIn(root, last) {
        root.querySelectorAll('[data-num]').forEach(el => {
            const key = el.dataset.k, to = +el.dataset.num, f = FORMATS[el.dataset.f] || fmt;
            const from = last[key] === undefined ? to : last[key];
            last[key] = to;
            el.textContent = f(from === to || reduce ? to : from);
            if (from === to || reduce) return;
            const i = d3.interpolateNumber(from, to);
            const t = d3.timer(e => { const k = Math.min(1, e / 520); el.textContent = f(i(d3.easeCubicOut(k))); if (k >= 1) t.stop(); });
        });
    }
    // A quick lift-and-fade whenever a card's contents change
    function swap(el) { el.classList.remove('is-swap'); void el.offsetWidth; el.classList.add('is-swap'); }

    // A typeahead box with a short list of matches; Enter picks the top match.
    // Each word typed has to start a word in the name ("tire" finds Tire Dealers, not
    // Retirement Communities). Names that start with the query come first, then ones
    // where every word typed is a whole word or its plural ("nurse" ranks Registered
    // Nurses above Nursery workers); within each, biggest first. aliases turn common
    // short forms into the words in the data ("ceo" -> "chief executives").
    const words = s => s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    function typeahead({ input, list, items, label, onPick, aliases = {} }) {
        let matches = [];
        const show = () => {
            let q = input.value.trim().toLowerCase();
            if (aliases[q]) q = aliases[q];
            const toks = words(q);
            matches = q.length < 2 || !toks.length ? [] : items.map((it, i) => {
                const name = label(it).toLowerCase(), ws = words(name);
                if (!toks.every(t => ws.some(w => w.startsWith(t)))) return null;
                const whole = toks.every(t => ws.some(w => w === t || w === t + 's' || w === t + 'es'));
                return { it, i, score: (name.startsWith(q) ? 0 : 2) + (whole ? 0 : 1) };
            }).filter(Boolean).sort((a, b) => a.score - b.score || a.i - b.i).slice(0, 6).map(m => m.it);
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
        // On touch screens the keyboard goes away with the pick, so it doesn't cover the result
        function pick(it) { input.value = label(it); list.hidden = true; if (matchMedia('(hover: none)').matches) input.blur(); onPick(it); }
    }

    // ----- Jobs -----
    d3.csv('data/Occupation Snapshot.csv').then(rows => {
        const jobs = rows.filter(r => r['SOC'] && r['SOC'].slice(-2) !== '00' && num(r['Empl']) > 0 && num(r['Mean Ann Wages2']) > 0)
            .map(r => ({ name: r['Occupation'].trim(), empl: num(r['Empl']), wage: num(r['Mean Ann Wages2']),
                         openings: num(r['Total Demand']), growth: num(r['Ann % Growth']) }))
            .sort((a, b) => b.empl - a.empl);
        // The average across all occupations, from the same survey (the "Total - All Occupations" row)
        const allRow = rows.find(r => r['SOC'] === '00-0000');
        const avgPay = allRow ? num(allRow['Mean Ann Wages2']) : d3.sum(jobs, j => j.empl * j.wage) / d3.sum(jobs, j => j.empl);
        const pct = g => (g > 0 ? '+' : '') + (g * 100).toFixed(1) + '%';
        // Each ranking, with a floor on size where a handful of jobs would swamp it
        const SORTS = {
            common:   { key: j => j.empl,     min: 0,   val: j => fmt(j.empl) + ' jobs',     note: 'Ranked by jobs in Macon-Bibb.' },
            paid:     { key: j => j.wage,     min: 30,  val: j => money(j.wage),             note: 'Ranked by average pay, among jobs with at least 30 positions here.' },
            growing:  { key: j => j.growth,   min: 100, val: j => pct(j.growth) + ' a year', note: 'Ranked by projected growth a year, among jobs with at least 100 positions here.' },
        };
        // Kept simple: search, the top 8, and one card with the two figures that matter (pay and jobs)
        const TOP = 8;
        const out = document.getElementById('job-result'), list = document.getElementById('job-rank');

        // The card is built once, so its numbers can count and its gauge marker can glide
        const PAY_LO = 20000, PAY_HI = 400000, gx = v => (100 * Math.log(Math.max(PAY_LO, Math.min(PAY_HI, v)) / PAY_LO) / Math.log(PAY_HI / PAY_LO)).toFixed(1) + '%';
        out.innerHTML = `<h3></h3>
            <dl class="tool-stats">
                <div><dt>Average pay</dt><dd data-k="wage" data-f="money"></dd></div>
                <div><dt>Jobs in Macon-Bibb</dt><dd data-k="empl" data-f="int"></dd></div>
            </dl>
            <div class="pay-gauge" aria-hidden="true">
                <div class="pay-gauge__track"><span class="pay-gauge__avg" style="left:${gx(avgPay)}"><em>Avg. job here ${money(avgPay)}</em></span><span class="pay-gauge__me"></span></div>
                <div class="pay-gauge__ends"><span>$20K</span><span>$400K</span></div>
            </div>
            <p class="pay-gauge__cap"></p>`;
        const last = {};
        let current = jobs[0], ranked = [], view = 'common';

        // Phones and tablets (900px and narrower): a job's card pops up over the tool instead of
        // sitting below the list, so the tool itself fits one screen. A sheet from the bottom on
        // phones, a centered card on tablets (css/chapters.css); × , the backdrop or Esc closes it.
        // Wider screens keep the card beside the list.
        const jobsSec = document.getElementById('jobs'), resCol = out.closest('.tool-col--result');
        const narrow = () => window.matchMedia('(max-width: 900px)').matches;
        const backdrop = document.createElement('div');
        backdrop.className = 'job-pop-backdrop';
        jobsSec.appendChild(backdrop);
        const closeBtn = document.createElement('button');
        closeBtn.type = 'button'; closeBtn.className = 'job-pop-close'; closeBtn.setAttribute('aria-label', 'Close'); closeBtn.textContent = '×';
        resCol.prepend(closeBtn);
        let returnFocus = null;
        function openPop() {
            if (!narrow() || jobsSec.classList.contains('has-pop')) return;
            returnFocus = document.activeElement;
            jobsSec.classList.add('has-pop');
            document.documentElement.classList.add('has-popup');   // phone scenes hold still (js/scenes-phone.js)
            resCol.setAttribute('role', 'dialog'); resCol.setAttribute('aria-modal', 'true'); resCol.setAttribute('aria-label', 'Job details');
            closeBtn.focus({ preventScroll: true });
        }
        function closePop() {
            if (!jobsSec.classList.contains('has-pop')) return;
            jobsSec.classList.remove('has-pop');
            document.documentElement.classList.remove('has-popup');
            resCol.removeAttribute('role'); resCol.removeAttribute('aria-modal');
            if (returnFocus && returnFocus.focus && returnFocus.tagName !== 'INPUT') returnFocus.focus({ preventScroll: true });
        }
        backdrop.addEventListener('click', closePop);
        closeBtn.addEventListener('click', closePop);
        addEventListener('keydown', e => { if (e.key === 'Escape') closePop(); });
        addEventListener('resize', () => { if (!narrow()) closePop(); });
        // and it never follows you away: leaving Jobs (the menu, a link, a scene change) closes it
        if ('IntersectionObserver' in window) new IntersectionObserver(es => { if (!es[0].isIntersecting) closePop(); }).observe(jobsSec);
        function show(j, quiet) {
            const changed = current !== j;
            current = j;
            out.querySelector('h3').textContent = j.name;
            ['wage', 'empl'].forEach(k => { out.querySelector(`[data-k="${k}"]`).dataset.num = j[k]; });
            countIn(out, last);
            out.querySelector('.pay-gauge__me').style.left = gx(j.wage);
            const diff = j.wage - avgPay;
            out.querySelector('.pay-gauge__cap').innerHTML = Math.abs(diff) < 1000 ? 'About the same as the average job located in Macon-Bibb.'
                : `<b>${money(Math.abs(diff))} ${diff > 0 ? 'more' : 'less'}</b> than the average job here.`;
            if (changed && !quiet) swap(out);
            list.querySelectorAll('button').forEach(b => b.classList.toggle('is-hot', ranked[+b.dataset.i] === j));
        }
        function rank(v) {
            view = v;
            const s = SORTS[v];
            ranked = jobs.filter(j => j.empl >= s.min).sort((a, b) => s.key(b) - s.key(a)).slice(0, TOP);
            const top = s.key(ranked[0]) || 1;
            flip(list, () => {
                list.innerHTML = ranked.map((j, i) => `<li data-key="${esc(j.name)}"><button type="button" data-i="${i}"><b>${i + 1}</b><span>${esc(j.name)}</span><em>${s.val(j)}</em>
                    <i class="row-bar"><i data-bar style="width:${Math.max(2, 100 * s.key(j) / top).toFixed(1)}%"></i></i></button></li>`).join('');
            });
            show(current, true);
        }
        list.addEventListener('click', e => { const b = e.target.closest('button'); if (b) { show(ranked[+b.dataset.i]); remember('jobs', current.name); openPop(); } });
        const count = document.getElementById('job-count');
        if (count) count.textContent = jobs.length.toLocaleString();
        typeahead({ input: document.getElementById('job-q'), list: document.getElementById('job-list'), items: jobs, label: j => j.name,
                    aliases: { ceo: 'chief executives', rn: 'registered nurses', lpn: 'licensed practical', cna: 'nursing assistants', cdl: 'truck drivers', 'truck driver': 'truck drivers' },
                    onPick: j => { show(j); remember('jobs', j.name); openPop(); } });
        const sortBy = segmented(document.getElementById('job-sorts'), rank);
        sortBy('common');
        show(current, true);
        register('jobs', s => { const j = jobs.find(j => slug(j.name) === s); if (j) { show(j); openPop(); } return !!j; });
    }).catch(err => console.error('Job lookup failed to load', err));

    // ----- Industries -----
    const D = () => window.WFDonut || { light() {}, focusSector() {}, sectorOf() {} };
    const indPanes = Array.from(document.querySelectorAll('#industries [data-pane]'));
    let specialtyIds = [];
    const lightFor = v => D().light(v === 'specialties' ? specialtyIds : v === 'commuters' ? D().commuterIds : null);
    const indView = segmented(document.getElementById('ind-views'), v => { indPanes.forEach(p => { p.hidden = p.dataset.pane !== v; }); lightFor(v); });
    indView('biggest');
    d3.csv('data/Industry Snapshot.csv').then(rows => {
        const inds = rows.filter(r => (r['NAICS'] || '').trim() && num(r['Empl']) > 0)
            .map(r => ({ name: r['Industry'].trim(), naics: r['NAICS'].trim(), empl: num(r['Empl']), wage: num(r['Avg Ann Wages']), lq: num(r['LQ']), change: num(r['Empl Change']) }))
            .sort((a, b) => b.empl - a.empl);
        const out = document.getElementById('strength-result'), input = document.getElementById('strength-q');
        const last = {};
        out.innerHTML = `<h3></h3>
            <dl class="tool-stats">
                <div><dt>Jobs located in Macon-Bibb</dt><dd data-k="empl" data-f="int"></dd></div>
                <div><dt>Average wage</dt><dd data-k="wage" data-f="money"></dd></div>
                <div><dt>Concentration</dt><dd data-k="conc"></dd></div>
                <div><dt>Recent change</dt><dd data-k="change"></dd></div>
            </dl>`;
        function show(i) {
            const conc = i.lq >= 1.2 ? `${timesUS(i.lq)} the U.S. concentration` : i.lq <= 0.8 ? `less concentrated than the U.S. (${i.lq.toFixed(2)}×)` : 'about the U.S. average';
            out.querySelector('h3').textContent = i.name;
            out.querySelector('[data-k="empl"]').dataset.num = i.empl;
            out.querySelector('[data-k="wage"]').dataset.num = i.wage;
            countIn(out, last);
            out.querySelector('[data-k="conc"]').textContent = conc;
            const ch = out.querySelector('[data-k="change"]');
            ch.textContent = (i.change > 0 ? '+' : '') + fmt(i.change) + ' jobs';
            ch.className = i.change > 0 ? 'is-up' : i.change < 0 ? 'is-down' : '';
            out.hidden = false;
            swap(out);
            D().focusSector(i.naics);   // swing the donut to this industry's sector
        }
        const pick = i => { input.value = i.name; show(i); remember('industries', i.name); };
        // An industry's slice in the donut opens the same card (js/workforce-data.js)
        if (window.WFDonut) WFDonut.onIndustry = naics => { const i = inds.find(x => x.naics === naics); if (i) pick(i); };
        // Specialties: much more concentrated here than nationally, and big enough to matter
        const top = inds.filter(i => i.lq >= 2 && i.empl >= 200).sort((a, b) => b.lq - a.lq).slice(0, 8);
        specialtyIds = Array.from(new Set(top.map(i => D().sectorOf(i.naics)).filter(Boolean)));
        // LQ on a log scale from the U.S. average (1×) to the top specialty
        const lqx = lq => (100 * Math.log(Math.max(1, lq)) / Math.log(top[0].lq)).toFixed(1) + '%';
        const strengths = document.getElementById('strength-list');
        strengths.innerHTML = top.map((i, k) => `<li data-key="${esc(i.name)}"><button type="button" data-i="${k}">
            <b>${timesUS(i.lq)}</b><span>${esc(i.name)}</span><small>${fmt(i.empl)} jobs · ${money(i.wage)} avg</small>
            <i class="row-bar row-bar--lq"><i data-bar style="width:${lqx(i.lq)}"></i></i></button></li>`).join('');
        strengths.addEventListener('click', e => { const b = e.target.closest('button'); if (b) pick(top[+b.dataset.i]); });
        // The specialty bars grow in the first time the pane is opened
        const bars = Array.from(strengths.querySelectorAll('[data-bar]'));
        if (!reduce) bars.forEach(b => { b.dataset.w = b.style.width; b.style.width = '0%'; });
        const growBars = () => requestAnimationFrame(() => bars.forEach((b, k) => { b.style.transitionDelay = k * 50 + 'ms'; b.style.width = b.dataset.w || b.style.width; }));
        document.querySelector('#ind-views [data-view="specialties"]').addEventListener('click', growBars, { once: true });
        if (indView.current() === 'specialties') { lightFor('specialties'); growBars(); }
        typeahead({ input, list: document.getElementById('strength-qlist'), items: inds, label: i => i.name, onPick: pick });
        register('industries', s => { const i = inds.find(i => slug(i.name) === s); if (i) { input.value = i.name; show(i); } return !!i; });
    }).catch(err => console.error('Industry lookup failed to load', err));

    // Shared with js/county-explorer.js (the fourth stop)
    window.WFTools = { register, remember, countIn, swap, slug, segmented };

    // Plain links to a stop, or a chapter from the earlier homepage
    if (OLD[location.hash.slice(1)]) route();
    addEventListener('load', () => { if (plainStop() && !touched && !/^(6am|8am|pay|noon|evening|map)$/.test(plainStop())) setTimeout(() => jumpTo(plainStop()), 50); });
})();
