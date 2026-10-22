(function () {
    'use strict';

    /* ===== INDUSTRIES (homepage stop 3) =====
       The industries donut, what commuters come in for (LODES), and the
       headlines computed from the data. The search, view switch and
       specialties list live in js/lookups.js. */
    const TEAL = '#2dd4bf';

    // ===== HELPERS =====
    function toNum(v) {
        const n = parseFloat(String(v || '').replace(/,/g, '').trim());
        return isNaN(n) ? 0 : n;
    }
    function debounce(fn, ms) {
        let t;
        return function () { clearTimeout(t); t = setTimeout(fn, ms); };
    }

    // ===== INDUSTRY CONFIG (2-digit NAICS prefix -> sector) =====
    // Colors: the three biggest sectors carry the homepage story's colors
    // (health care teal, food services orange, retail gold); the rest are muted
    // blues and violets from the same night palette, so the big three stand out.
    // Every slice is named in the legend beside the donut, so hue is a
    // wayfinding aid, not the only way to tell sectors apart.
    const INDUSTRIES = {
        '11': { name: 'Agriculture, Forestry & Fishing',   prefixes: ['11'],             color: '#6b7aa8' },
        '21': { name: 'Mining & Oil and Gas',               prefixes: ['21'],             color: '#7d6fa6' },
        '22': { name: 'Utilities',                          prefixes: ['22'],             color: '#5f8fb0' },
        '23': { name: 'Construction',                       prefixes: ['23'],             color: '#8a7cc4' },
        '31': { name: 'Manufacturing',                      prefixes: ['31', '32', '33'], color: '#5b8fd0' },
        '42': { name: 'Wholesale Trade',                    prefixes: ['42'],             color: '#9a86c9' },
        '44': { name: 'Retail Trade',                       prefixes: ['44', '45'],       color: '#f2c46b' },
        '48': { name: 'Transportation & Warehousing',       prefixes: ['48', '49'],       color: '#6d9ec4' },
        '51': { name: 'Information',                        prefixes: ['51'],             color: '#a58fd8' },
        '52': { name: 'Finance & Insurance',                prefixes: ['52'],             color: '#7b8fd1' },
        '53': { name: 'Real Estate',                        prefixes: ['53'],             color: '#8e7bb8' },
        '54': { name: 'Professional & Technical Services',  prefixes: ['54'],             color: '#6aa6c9' },
        '55': { name: 'Management of Companies',            prefixes: ['55'],             color: '#9fa8d6' },
        '56': { name: 'Administrative & Support',           prefixes: ['56'],             color: '#b08bd1' },
        '61': { name: 'Educational Services',               prefixes: ['61'],             color: '#5aa7b5' },
        '62': { name: 'Health Care & Social Assistance',    prefixes: ['62'],             color: '#2dd4bf' },
        '71': { name: 'Arts & Entertainment',               prefixes: ['71'],             color: '#c294d6' },
        '72': { name: 'Accommodation & Food Services',      prefixes: ['72'],             color: '#fb923c' },
        '81': { name: 'Other Services',                     prefixes: ['81'],             color: '#7f93b8' },
        '92': { name: 'Public Administration',              prefixes: ['92'],             color: '#8f9fe0' },
    };

    function sectorFor(naics) {
        for (const [id, cfg] of Object.entries(INDUSTRIES)) {
            if (cfg.prefixes.some(p => naics.startsWith(p))) return id;
        }
        return null;
    }

    // Sectors (2-digit NAICS) holding their 6-digit industries
    function buildHierarchy(rows) {
        const groups = {};
        for (const [id, cfg] of Object.entries(INDUSTRIES)) {
            groups[id] = { id, name: cfg.name, color: cfg.color, children: [] };
        }
        for (const row of rows) {
            const naics = (row['NAICS'] || '').trim();
            if (!naics) continue;
            const empl = toNum(row['Empl']);
            if (empl <= 0) continue;
            const id = sectorFor(naics);
            if (!id) continue;
            groups[id].children.push({
                name: (row['Industry'] || '').trim(),
                naics,
                empl,
                wage: toNum(row['Avg Ann Wages']),
            });
        }
        return { name: 'root', children: Object.values(groups).filter(g => g.children.length) };
    }

    // ===== INDUSTRIES DONUT =====
    // Sectors by jobs. It assembles (slices sweep in, largest first) the first time it
    // comes into view; clicking a slice or a legend row drills into that sector's
    // industries (top 10 + "Other").
    let hierarchy = null, donutNode = null, donutBuilt = 0, donutAnim = null, officialJobs = 0;
    let donutLit = null, pendingFocus = null;   // sectors lit by the other tools; an industry to open once loaded
    const DONUT_OTHER = '#4b5568';

    const sectorJobs = g => d3.sum(g.children, c => c.empl);
    const sectorWage = g => { const j = sectorJobs(g); return j ? d3.sum(g.children, c => c.empl * c.wage) / j : 0; };
    function donutSlices(node) {
        if (node === hierarchy) {
            return node.children.map(g => ({ name: g.name, value: sectorJobs(g), wage: sectorWage(g), color: g.color, sector: g }))
                .sort((a, b) => b.value - a.value);
        }
        const kids = [...node.children].sort((a, b) => b.empl - a.empl), top = kids.slice(0, 10), rest = kids.slice(10);
        const out = top.map((c, i) => ({ name: c.name, naics: c.naics, value: c.empl, wage: c.wage,
            color: d3.interpolateRgb(node.color, '#1b2433')(Math.min(0.75, i * 0.075)) }));
        if (rest.length) out.push({ name: `Other (${rest.length} industries)`, value: d3.sum(rest, c => c.empl),
            wage: d3.sum(rest, c => c.empl * c.wage) / d3.sum(rest, c => c.empl), color: DONUT_OTHER, other: true });
        return out;
    }

    function renderDonut(node, opts = {}) {
        const box = document.getElementById('donut');
        if (!box || !node) return;
        donutNode = node;
        const isRoot = node === hierarchy;
        const slices = donutSlices(node);
        const allJobs = sectorJobsAll();
        const total = d3.sum(slices, d => d.value);
        const size = Math.max(240, Math.min(box.clientWidth || 480, 520)), R = size / 2, inner = R * 0.62;
        const svg = d3.select('#donut-svg').attr('viewBox', `${-R} ${-R} ${size} ${size}`).attr('width', size).attr('height', size);
        box.style.setProperty('--donut-size', size + 'px');
        const pie = d3.pie().value(d => d.value).sort(null).padAngle(0.006)(slices);
        const arc = d3.arc().innerRadius(inner).outerRadius(R - 6).cornerRadius(3);
        const arcHot = d3.arc().innerRadius(inner - 2).outerRadius(R).cornerRadius(3);
        const fmtShare = v => (v * 100 >= 10 ? Math.round(v * 100) : (v * 100).toFixed(1)) + '%';

        const paths = svg.selectAll('path').data(pie, d => d.data.name).join('path')
            .attr('fill', d => d.data.color)
            .attr('tabindex', 0)
            .attr('role', isRoot ? 'button' : 'img')
            .attr('aria-label', d => `${d.data.name}: ${Math.round(d.value).toLocaleString()} jobs, ${fmtShare(d.value / total)}`)
            .style('cursor', isRoot ? 'pointer' : 'default');

        // Draw at assembly progress a (0–1): each slice sweeps open in turn, largest first
        const n = pie.length;
        function draw(a, hot) {
            paths.attr('d', (d, i) => {
                const r = Math.max(0, Math.min(1, (a * (n + 4) - i) / 4));
                const e = 1 - Math.pow(1 - r, 3);
                if (e <= 0) return null;
                return (hot === i ? arcHot : arc)({ ...d, endAngle: d.startAngle + (d.endAngle - d.startAngle) * e });
            }).attr('opacity', (d, i) => (a * (n + 4) - i) > 0 ? 1 : 0);
            // Each legend row arrives with its slice
            legendRows.forEach((b, i) => { const r = Math.max(0, Math.min(1, (a * (n + 4) - i) / 2)); b.style.opacity = r; b.style.transform = `translateX(${(1 - r) * 8}px)`; });
        }
        let hot = -1;
        const center = document.getElementById('donut-center');
        const centerDefault = () => isRoot
            ? `<b>${Math.round(officialJobs || allJobs).toLocaleString()}</b><span>jobs in ${slices.length} sectors</span><small>Click a slice to look inside</small>`
            : `<b>${fmtShare(total / allJobs)}</b><span>${node.name}</span><small>${Math.round(total).toLocaleString()} jobs · click here to go back</small>`;
        const setCenter = i => {
            if (i < 0) { center.innerHTML = centerDefault(); return; }
            const d = pie[i].data;
            center.innerHTML = `<b>${fmtShare(d.value / total)}</b><span>${d.name}</span><small>${Math.round(d.value).toLocaleString()} jobs${d.wage ? ` · $${Math.round(d.wage / 1000)}K avg wage` : ''}</small>`;
        };
        const legend = document.getElementById('donut-legend');
        // Column headings make it plain that every slice is a count of jobs
        legend.innerHTML = `<li class="donut-legend__head" aria-hidden="true"><span></span><span>${isRoot ? 'Industry sector' : 'Industry in ' + node.name}</span>
            <span>Jobs</span><span>${isRoot ? '% of jobs' : '% of sector'}</span></li>` + pie.map((d, i) => `<li><button type="button" data-i="${i}" ${isRoot ? '' : 'tabindex="-1"'}>
            <i style="background:${d.data.color}"></i><span class="dl-name">${d.data.name}</span>
            <span class="dl-val">${Math.round(d.value).toLocaleString()}</span><span class="dl-share">${fmtShare(d.value / total)}</span></button></li>`).join('');
        const legendRows = Array.from(legend.querySelectorAll('button'));
        // Slice i hot (or none, -1); with none, any sectors lit by the other tools stay lit
        const paint = i => {
            const lit = isRoot && donutLit;
            paths.attr('fill-opacity', (d, j) => i >= 0 ? (j === i ? 1 : 0.35) : !lit || lit.has(d.data.sector.id) ? 1 : 0.2);
            legendRows.forEach((b, j) => b.classList.toggle('is-dim', i < 0 && !!lit && !lit.has(pie[j].data.sector.id)));
        };
        const highlight = i => {
            hot = i;
            draw(donutBuilt, hot);
            paint(i);
            legendRows.forEach((b, j) => b.classList.toggle('is-hot', j === i));
            setCenter(i);
        };
        const drill = i => { const d = pie[i] && pie[i].data; if (isRoot && d && d.sector) animateTo(d.sector); };

        paths.on('mouseenter', (e, d) => highlight(pie.indexOf(d))).on('mouseleave', () => highlight(-1))
            .on('focus', (e, d) => highlight(pie.indexOf(d))).on('blur', () => highlight(-1))
            .on('click', (e, d) => drill(pie.indexOf(d)))
            .on('keydown', (e, d) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); drill(pie.indexOf(d)); } });
        legendRows.forEach((b, i) => {
            b.addEventListener('mouseenter', () => highlight(i)); b.addEventListener('mouseleave', () => highlight(-1));
            b.addEventListener('focus', () => highlight(i)); b.addEventListener('blur', () => highlight(-1));
            b.addEventListener('click', () => drill(i));
        });
        center.classList.toggle('is-back', !isRoot);
        center.onclick = isRoot ? null : () => animateTo(hierarchy);
        const back = document.getElementById('donut-back');
        back.hidden = isRoot;
        back.onclick = () => animateTo(hierarchy);
        box.classList.toggle('is-drilled', !isRoot);

        renderDonut.draw = a => draw(a, hot);
        renderDonut.hot = highlight;
        renderDonut.indexOf = naics => { const k = pie.findIndex(d => d.data.naics === naics); return k >= 0 ? k : pie.findIndex(d => d.data.other); };
        paint(-1);
        setCenter(-1);
        draw(opts.assemble === undefined ? donutBuilt : opts.assemble, -1);
    }
    function sectorJobsAll() { return hierarchy ? d3.sum(hierarchy.children, sectorJobs) : 0; }
    // Drill in or out: the new ring sweeps in over ~0.7 s
    function animateTo(node) {
        if (donutAnim) donutAnim.stop();
        const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
        donutBuilt = 1;   // once someone has drilled, the first-view assembly is done
        renderDonut(node, { assemble: reduce ? 1 : 0 });
        if (reduce) return;
        donutAnim = d3.timer(t => { const a = Math.min(1, t / 750); renderDonut.draw(a); if (a >= 1) { donutAnim.stop(); donutAnim = null; } });
    }
    // Assemble the first time the donut comes into view
    function assembleOnView() {
        const box = document.getElementById('donut');
        if (!box || !('IntersectionObserver' in window)) { donutBuilt = 1; return; }
        const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
        const io = new IntersectionObserver(entries => {
            if (!entries.some(e => e.isIntersecting)) return;
            io.disconnect();
            if (reduce || donutBuilt >= 1) { donutBuilt = 1; if (renderDonut.draw) renderDonut.draw(1); return; }
            const t0 = d3.timer(t => {
                donutBuilt = Math.min(1, t / 1100);
                if (donutNode === hierarchy && renderDonut.draw && !donutAnim) renderDonut.draw(donutBuilt);
                if (donutBuilt >= 1) t0.stop();
            });
        }, { threshold: 0.35 });
        io.observe(box);
    }

    // ===== LINKS FROM THE OTHER TOOLS (js/lookups.js) =====
    // light(ids): dim every sector but these (null for all). focusSector(naics): swing the
    // donut into that industry's sector and light its slice (or "Other" if it's not in the top 10).
    const WFDonut = window.WFDonut = {
        sectorOf: naics => sectorFor(String(naics || '')),
        light(ids) {
            donutLit = ids && ids.length ? new Set(ids) : null;
            if (!hierarchy) return;
            if (donutNode !== hierarchy) animateTo(hierarchy);
            else if (renderDonut.hot) renderDonut.hot(-1);
        },
        focusSector(naics) {
            if (!hierarchy) { pendingFocus = naics; return; }
            const sector = hierarchy.children.find(g => g.id === sectorFor(String(naics)));
            if (!sector) return;
            donutLit = null;
            const lightIt = () => { const k = renderDonut.indexOf(String(naics)); if (k >= 0) renderDonut.hot(k); };
            if (donutNode === sector) { lightIt(); return; }
            animateTo(sector);
            setTimeout(lightIt, donutAnim ? 780 : 0);
        },
    };

    // ===== WHAT COMMUTERS COME IN FOR (LODES 2023, by industry) =====
    // data/commute-sectors.json: per industry, jobs located in Macon-Bibb and the minimum
    // filled by people who live elsewhere (jobs here minus residents working in it anywhere)
    function renderCommuteSectors(data) {
        const el = document.getElementById('sector-commute-bars');
        if (!el || !data) return;
        const rows = data.sectors.filter(r => r.commutersAtLeast > 0).slice(0, 10);
        // LODES sector names → the donut's sectors, by first word
        const LODES_SECTOR = { health: '62', finance: '52', retail: '44', educational: '61', manufacturing: '31', accommodation: '72',
            management: '55', wholesale: '42', public: '92', other: '81', construction: '23', admin: '56', professional: '54',
            real: '53', arts: '71', utilities: '22', agriculture: '11', mining: '21', transportation: '48', information: '51' };
        const idOf = r => LODES_SECTOR[r.sector.split(/\s/)[0].toLowerCase()];
        WFDonut.commuterIds = rows.map(idOf).filter(Boolean);
        const max = rows[0].commutersAtLeast;
        const pct = r => Math.round(100 * r.commutersAtLeast / r.jobs);
        el.innerHTML = rows.map(r => `
            <div class="demo-bar-row" data-sector="${idOf(r) || ''}">
                <div class="demo-bar-label wide-label" title="${r.sector}">${r.sector}</div>
                <div class="demo-bar-track"><div class="demo-bar-fill" style="width:${(r.commutersAtLeast / max * 100).toFixed(1)}%;background:${TEAL};"></div></div>
                <div class="occ-bar-val sector-val">${r.commutersAtLeast.toLocaleString()}<span>${pct(r)}% of its jobs</span></div>
            </div>`).join('');
        // Hovering a bar lights its slice of the donut
        el.addEventListener('mouseover', e => { const row = e.target.closest('[data-sector]'); if (row && row.dataset.sector) WFDonut.light([row.dataset.sector]); });
        el.addEventListener('mouseleave', () => WFDonut.light(WFDonut.commuterIds));
        // Headline: most commuters by count, and the most commuter-dependent sizeable industry
        const top = rows[0];
        const lean = data.sectors.filter(r => r.jobs >= 1500).sort((a, b) => b.commutersAtLeast / b.jobs - a.commutersAtLeast / a.jobs)[0];
        const find = document.getElementById('find-sectors');
        if (find) find.innerHTML = `<em>${top.sector}</em> draws the most commuters: at least <em>${top.commutersAtLeast.toLocaleString()}</em> of its jobs. ` +
            `<em>${lean.sector}</em> leans on them most, with at least <em>${pct(lean)}%</em> of its jobs held by people from outside Macon-Bibb.`;
        const hc = data.sectors.find(r => r.sector.startsWith('Health care'));
        const note = document.getElementById('occ-commute-note');
        // The why behind the Jobs headline: the region's trauma center at the highway crossroads, and who staffs it
        if (note && hc) note.innerHTML = `<span class="nw">Macon-Bibb</span> is home to Middle Georgia's only Level I trauma center, right where <span class="nw">I-75</span> and <span class="nw">I-16</span> meet, and nurses drive in from across the region: at least <b>${pct(hc)}%</b> of health care jobs here are held by people who live outside the county.`;
    }
    // ===== HEADLINES (computed from the data) =====
    function writeFindings(totalRow, occRows) {
        // "Macon-Bibb" never breaks at its hyphen in a headline
        const set = (id, html) => { const el = document.getElementById(id); if (el && html) el.innerHTML = html.replace(/Macon-Bibb/g, '<span class="nw">Macon-Bibb</span>'); };
        if (totalRow) set('ind-totals', `<b>${Math.round(toNum(totalRow['Empl'])).toLocaleString()}</b> jobs in Macon-Bibb · <b>$${Math.round(toNum(totalRow['Avg Ann Wages'])).toLocaleString()}</b> average pay`);
        // (The Industries title slide's headline, what's growing, is js/growth-intro-map.js's)
        const occ = occRows.filter(r => r['Occupation'] && r['SOC'] && r['SOC'].slice(-2) !== '00' && !r['Occupation'].toLowerCase().includes('total'));
        const topOcc = d3.greatest(occ, r => toNum(r['Empl']));
        if (topOcc) {
            const name = topOcc['Occupation'].trim(), nice = name.charAt(0) + name.slice(1).toLowerCase();
            set('find-occ', `<em>${nice}</em> are Macon-Bibb's most common job: <em>${Math.round(toNum(topOcc['Empl'])).toLocaleString()}</em> positions averaging <em>$${(Math.round(toNum(topOcc['Mean Ann Wages2']) / 100) * 100).toLocaleString()}</em>.`);
        }
    }

    // ===== INIT =====
    Promise.all([
        d3.csv('data/Industry Snapshot.csv'),
        d3.csv('data/Occupation Snapshot.csv'),
    ]).then(([indRows, occRows]) => {
        const dataRows = indRows.filter(r => (r['NAICS'] || '').trim() !== '');
        const totalRow = indRows.find(r => !(r['NAICS'] || '').trim());
        hierarchy = buildHierarchy(dataRows);
        officialJobs = totalRow ? toNum(totalRow['Empl']) : 0;   // same total as the headline (a few jobs sit outside the 20 sectors)
        renderDonut(hierarchy);
        assembleOnView();
        if (pendingFocus) { WFDonut.focusSector(pendingFocus); pendingFocus = null; }
        writeFindings(totalRow, occRows);
    }).catch(err => {
        console.error('Workforce data load error:', err);
    });
    d3.json('data/commute-sectors.json').then(renderCommuteSectors).catch(err => console.error('Commuting-by-industry load error:', err));

    window.addEventListener('resize', debounce(function () {
        if (donutNode) renderDonut(donutNode, { assemble: donutBuilt });
    }, 250));

})();

/* ===== INFO POPOVERS (chart data/source explanations) ===== */
(function () {
    const buttons = document.querySelectorAll('.info-btn');
    if (!buttons.length) return;

    function closeAll() {
        document.querySelectorAll('.info-popover.open').forEach(p => p.classList.remove('open'));
        document.querySelectorAll('.info-btn.active').forEach(b => b.classList.remove('active'));
    }

    buttons.forEach(btn => {
        const popover = btn.nextElementSibling;
        if (!popover) return;
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const wasOpen = popover.classList.contains('open');
            closeAll();
            if (!wasOpen) {
                popover.classList.add('open');
                btn.classList.add('active');
            }
        });
    });

    document.addEventListener('click', closeAll);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeAll(); });
})();
/* ===== IN-PAGE JUMP NAV — active section highlight ===== */
(function () {
    const links = Array.from(document.querySelectorAll('.page-jumpnav a'));
    if (!links.length) return;

    const sections = links
        .map(a => document.getElementById(a.getAttribute('href').slice(1)))
        .filter(Boolean);

    const nav = document.querySelector('.page-jumpnav');

    const setActive = (id) => {
        let activeLink = null;
        links.forEach(a => {
            const isActive = a.getAttribute('href') === '#' + id;
            a.classList.toggle('active', isActive);
            if (isActive) activeLink = a;
        });
        // On mobile the nav itself scrolls horizontally (see the ≤768px CSS) —
        // keep the active pill in view as the highlight moves, same idea as
        // the carousel dots tracking their own scroll position. Scrolled via
        // the nav's own scrollLeft (not activeLink.scrollIntoView) because
        // the nav is position:sticky — scrollIntoView's "nearest" ancestor
        // resolution isn't reliable there and was fighting the page's own
        // anchor-jump scroll (jumping to a section could visibly bounce to
        // the wrong scroll position). Setting scrollLeft directly can only
        // ever move the nav's own horizontal scrollbar, never the page.
        if (activeLink && nav && window.innerWidth <= 768) {
            const navRect  = nav.getBoundingClientRect();
            const linkRect = activeLink.getBoundingClientRect();
            const delta = (linkRect.left + linkRect.width / 2) - (navRect.left + navRect.width / 2);
            nav.scrollTo({ left: nav.scrollLeft + delta, behavior: 'smooth' });
        }
    };

    const observer = new IntersectionObserver((entries) => {
        // Pick the entry closest to the top of the viewport among those
        // currently intersecting, so the highlight tracks scroll position
        // even when several tall sections are on screen at once.
        const visible = entries.filter(e => e.isIntersecting);
        if (!visible.length) return;
        visible.sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        const el = visible[0].target;
        // A section's title slide counts as the section
        setActive(el.classList.contains('stop-intro') ? el.nextElementSibling.id : el.id);
    }, { rootMargin: '-140px 0px -70% 0px', threshold: 0 });

    sections.forEach(s => observer.observe(s));
    document.querySelectorAll('.stop-intro').forEach(s => observer.observe(s));
})();
