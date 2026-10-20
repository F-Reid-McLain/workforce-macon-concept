(function () {
    'use strict';

    // ===== THEME =====
    // accent matches --color-accent (Chamber Gold) in theme.css — kept in
    // sync manually since these charts are hand-rolled SVG/HTML, not CSS.
    const C = {
        accent:        '#afa66d',
        teal:          '#2dd4bf',
        orange:        '#fb923c',
        bgSurface:     '#2d2d2d',
        bgSurfaceDeep: '#252525',
        textPrimary:   '#ffffff',
        textSec:       '#cccccc',
        textMuted:     '#888888',
        border:        '#444444',
    };

    const BIBB      = '13021';

    // ===== HELPERS =====
    function toNum(v) {
        const n = parseFloat(String(v || '').replace(/,/g, '').trim());
        return isNaN(n) ? 0 : n;
    }
    function norm(s) {
        return String(s || '').trim().replace(/\s+/g, ' ');
    }
    function debounce(fn, ms) {
        let t;
        return function () { clearTimeout(t); t = setTimeout(fn, ms); };
    }
    function fips5(v) {
        return String(v).padStart(5, '0');
    }
    function isMobile() {
        return window.innerWidth <= 768;
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

    // ===== HERO KPIs =====
    function loadKPIs(dataRows, totalRow, popRows, commRows) {
        if (totalRow) {
            const jobsEl = document.getElementById('kpi-jobs');
            const wageEl = document.getElementById('kpi-wage');
            if (jobsEl) jobsEl.textContent = Math.round(toNum(totalRow['Empl'])).toLocaleString();
            if (wageEl) wageEl.textContent = '$' + Math.round(toNum(totalRow['Avg Ann Wages'])).toLocaleString();
        }

        const bibbPop  = popRows.find(r => fips5(r.FIPS) === BIBB);
        const bibbComm = commRows.find(r => fips5(r.FIPS) === BIBB);

        if (bibbPop) {
            const popEl = document.getElementById('kpi-pop');
            if (popEl) popEl.textContent = Math.round(toNum(bibbPop.Population)).toLocaleString();
        }
        if (bibbComm) {
            const commEl = document.getElementById('kpi-commute');
            if (commEl) commEl.textContent = '+' + Math.round(toNum(bibbComm.NetCommuting)).toLocaleString();
        }

        const totals = {};
        dataRows.forEach(row => {
            const id = sectorFor((row['NAICS'] || '').trim());
            if (!id) return;
            totals[id] = (totals[id] || 0) + toNum(row['Empl']);
        });
        const topId = Object.entries(totals).sort((a, b) => b[1] - a[1])[0]?.[0];
        const topEl = document.getElementById('kpi-top');
        if (topEl) topEl.textContent = topId ? INDUSTRIES[topId].name : '—';
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
    // Sectors by jobs. It assembles (slices sweep in, largest first) as its section
    // scrolls through (progress from js/chapters.js); clicking a slice or a legend
    // row drills into that sector's industries (top 10 + "Other").
    let hierarchy = null, donutNode = null, donutBuilt = 0, donutAnim = null, officialJobs = 0;
    const DONUT_OTHER = '#4b5568';

    const sectorJobs = g => d3.sum(g.children, c => c.empl);
    const sectorWage = g => { const j = sectorJobs(g); return j ? d3.sum(g.children, c => c.empl * c.wage) / j : 0; };
    function donutSlices(node) {
        if (node === hierarchy) {
            return node.children.map(g => ({ name: g.name, value: sectorJobs(g), wage: sectorWage(g), color: g.color, sector: g }))
                .sort((a, b) => b.value - a.value);
        }
        const kids = [...node.children].sort((a, b) => b.empl - a.empl), top = kids.slice(0, 10), rest = kids.slice(10);
        const out = top.map((c, i) => ({ name: c.name, value: c.empl, wage: c.wage,
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
        const highlight = i => {
            hot = i;
            draw(donutBuilt, hot);
            paths.attr('fill-opacity', (d, j) => i < 0 || j === i ? 1 : 0.35);
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
        setCenter(-1);
        draw(opts.assemble === undefined ? donutBuilt : opts.assemble, -1);
    }
    function sectorJobsAll() { return hierarchy ? d3.sum(hierarchy.children, sectorJobs) : 0; }
    // Drill in or out: the new ring sweeps in over ~0.7 s
    function animateTo(node) {
        if (donutAnim) donutAnim.stop();
        const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
        donutBuilt = 1;   // once someone has drilled, the ring is never scroll-assembled again
        renderDonut(node, { assemble: reduce ? 1 : 0 });
        if (reduce) return;
        donutAnim = d3.timer(t => { const a = Math.min(1, t / 750); renderDonut.draw(a); if (a >= 1) { donutAnim.stop(); donutAnim = null; } });
    }
    // Scroll-driven assembly the first time through (js/chapters.js sets the progress)
    document.addEventListener('chapter:progress', e => {
        if (e.target.id !== 'donut-scrub' || donutBuilt >= 1) return;
        const a = Math.max(donutBuilt, Math.min(1, e.detail.p / 0.6));
        if (a === donutBuilt) return;
        donutBuilt = a;
        if (donutNode === hierarchy && renderDonut.draw && !donutAnim) renderDonut.draw(a);
    });

    // ===== CHAPTER FINDINGS (headlines computed from the data) =====
    function writeFindings(totalRow, occRows, demoRows) {
        const set = (id, html) => { const el = document.getElementById(id); if (el && html) el.innerHTML = html; };
        if (totalRow) set('find-kpis', `<em>${Math.round(toNum(totalRow['Empl'])).toLocaleString()}</em> jobs. <em>$${Math.round(toNum(totalRow['Avg Ann Wages'])).toLocaleString()}</em> average pay.`);
        if (hierarchy) {
            const top = d3.greatest(hierarchy.children, sectorJobs), share = sectorJobs(top) / sectorJobsAll();
            set('find-industries', `<em>1 in ${Math.round(1 / share)}</em> jobs in Macon-Bibb is in <em>${top.name.toLowerCase().replace('&', 'and')}</em>.`);
        }
        const demo = {}; demoRows.forEach(r => { demo[norm(r.Metric)] = toNum(r.Value2024); });
        // Education of working-age adults (ACS): the share with schooling past high school, and with a bachelor's or higher
        const pg = demo['Postgraduate Degree'], ba = demo["Bachelor's Degree"], aa = demo["Associate's Degree"], sc = demo['Some College, No Degree'];
        if ([pg, ba, aa, sc].every(v => v !== undefined)) {
            set('find-demo', `<em>${Math.round((pg + ba + aa + sc) * 100)}%</em> of working-age adults in Macon-Bibb have education beyond high school. <em>${Math.round((pg + ba) * 100)}%</em> hold a bachelor's degree or higher.`);
        }
        const occ = occRows.filter(r => r['Occupation'] && r['SOC'] && r['SOC'].slice(-2) !== '00' && !r['Occupation'].toLowerCase().includes('total'));
        const topOcc = d3.greatest(occ, r => toNum(r['Empl']));
        if (topOcc) {
            const name = topOcc['Occupation'].trim(), nice = name.charAt(0) + name.slice(1).toLowerCase();
            set('find-occ', `<em>${nice}</em> are Macon-Bibb's most common job: <em>${Math.round(toNum(topOcc['Empl'])).toLocaleString()}</em> positions averaging <em>$${(Math.round(toNum(topOcc['Mean Ann Wages2']) / 100) * 100).toLocaleString()}</em>.`);
        }
    }

    // ===== SHARED HORIZONTAL BAR ROWS (demographics + occupation intelligence) =====
    // Labels are handed to the DOM in full and left to CSS's own
    // white-space/ellipsis truncation (see .demo-bar-label) rather than
    // pre-cut to a fixed character count — a fixed cutoff clips long names
    // even in the wider label columns that have room to show them in full.
    function renderBars(containerId, items, color, formatVal, labelClass) {
        const el = document.getElementById(containerId);
        if (!el || !items.length) { if (el) el.innerHTML = ''; return; }
        const max = Math.max(...items.map(i => i.v));
        const cls = 'demo-bar-label' + (labelClass ? ' ' + labelClass : '');
        el.innerHTML = items.map(({ label, v }) => `
            <div class="demo-bar-row">
                <div class="${cls}" title="${label}">${label}</div>
                <div class="demo-bar-track">
                    <div class="demo-bar-fill" style="width:${max ? (v / max * 100).toFixed(1) : 0}%;background:${color};"></div>
                </div>
                <div class="${formatVal ? 'occ-bar-val' : 'demo-bar-pct'}">${formatVal ? formatVal(v) : (v * 100).toFixed(1) + '%'}</div>
            </div>`).join('');
    }

    // ===== DEMOGRAPHICS =====
    function renderDemographics(demoRows, popRows) {
        const demoMap = {};
        demoRows.forEach(r => { demoMap[norm(r.Metric)] = toNum(r.Value2024); });

        const bibbPop = popRows.find(r => fips5(r.FIPS) === BIBB);
        const popEl   = document.getElementById('demo-population');
        if (popEl) popEl.textContent = bibbPop ? Math.round(toNum(bibbPop.Population)).toLocaleString() : '—';

        const setPct = (id, key) => {
            const el = document.getElementById(id);
            if (el && demoMap[key] !== undefined) el.textContent = (demoMap[key] * 100).toFixed(1) + '%';
        };
        setPct('demo-lfpr',     'Labor Force Participation Rate and Size (civilian population 16 years and over)');
        setPct('demo-primeage', 'Prime-Age Labor Force Participation Rate and Size (civilian population 25-54)');
        setPct('demo-wfh',      'Work from Home');

        renderBars('age-bars', [
            { label: 'Under 18', v: demoMap['Under 18 Years']      || 0 },
            { label: '18–24',    v: demoMap['18 to 24 Years']      || 0 },
            { label: '25–34',    v: demoMap['25 to 34 Years']      || 0 },
            { label: '35–44',    v: demoMap['35 to 44 Years']      || 0 },
            { label: '45–54',    v: demoMap['45 to 54 Years']      || 0 },
            { label: '55–64',    v: demoMap['55 to 64 Years']      || 0 },
            { label: '65–74',    v: demoMap['65 to 74 Years']      || 0 },
            { label: '75+',      v: demoMap['75 Years and Over']   || 0 },
        ], C.orange);

        const otherRace = (demoMap['Race: American Indian and Alaska Native'] || 0)
            + (demoMap['Race: Native Hawaiian and Other Pacific Islander'] || 0)
            + (demoMap['Race: Some Other Race'] || 0);

        renderBars('race-bars', [
            { label: 'Black / African Am.', v: demoMap['Race: Black or African American'] || 0 },
            { label: 'White',               v: demoMap['Race: White']                     || 0 },
            { label: 'Hispanic / Latino',   v: demoMap['Hispanic or Latino (of any race)'] || 0 },
            { label: 'Two or More Races',   v: demoMap['Race: Two or More Races']          || 0 },
            { label: 'Asian',               v: demoMap['Race: Asian']                      || 0 },
            { label: 'Other',               v: otherRace },
        ], C.accent);

        renderBars('edu-bars', [
            { label: 'Postgraduate', v: demoMap['Postgraduate Degree']       || 0 },
            { label: "Bachelor's",   v: demoMap["Bachelor's Degree"]         || 0 },
            { label: "Associate's",  v: demoMap["Associate's Degree"]        || 0 },
            { label: 'Some College', v: demoMap['Some College, No Degree']   || 0 },
            { label: 'High School',  v: demoMap['High School Graduate']      || 0 },
            { label: 'No Diploma',   v: demoMap['No High School Diploma']    || 0 },
        ], C.teal);
    }

    // ===== OCCUPATIONS TABLE =====
    // Same top-N + "Show All" pattern already used for the Hiring Demand
    // charts below (renderHiringChart/renderEmployersChart in charts.js) —
    // 15 rows is a lot of table for a first view, especially on mobile.
    let occAllRows = [];
    let occExpanded = false;

    function renderOccTable() {
        const rows = occExpanded ? occAllRows : occAllRows.slice(0, 5);
        const tbody = document.getElementById('occ-tbody');
        if (!tbody) return;
        tbody.innerHTML = rows.map((r, i) => {
            const wage = toNum(r['Mean Ann Wages2']);
            const wageStr = wage > 0 ? '$' + Math.round(wage).toLocaleString() : '—';
            return `<tr>
                <td class="occ-rank">${i + 1}</td>
                <td style="font-weight:500">${r['Occupation']}</td>
                <td>${Math.round(toNum(r['Empl'])).toLocaleString()}</td>
                <td>${wageStr}</td>
            </tr>`;
        }).join('');

        const btn = document.getElementById('occ-toggle');
        if (btn) btn.textContent = occExpanded ? '▲ Show Less' : '▼ Show All Occupations';
    }

    function renderOccupations(occRows) {
        occAllRows = occRows
            .filter(r => toNum(r['Empl']) > 0 && r['Occupation'] && r['SOC'] !== '00-0000')
            .sort((a, b) => toNum(b['Empl']) - toNum(a['Empl']))
            .slice(0, 15);
        renderOccTable();

        const btn = document.getElementById('occ-toggle');
        if (btn) {
            btn.addEventListener('click', () => {
                occExpanded = !occExpanded;
                renderOccTable();
            });
        }
    }

    // ===== OCCUPATION INTELLIGENCE GRID =====
    const SOC3_NAMES = {
        '11-1': 'Top Executives', '11-2': 'Advertising & Marketing Managers',
        '11-3': 'Operations Specialties Managers', '11-9': 'Other Managers',
        '13-1': 'Business Operations Specialists', '13-2': 'Financial Specialists',
        '15-1': 'Computer Occupations', '15-2': 'Mathematical Science Occupations',
        '17-1': 'Architects & Surveyors', '17-2': 'Engineers', '17-3': 'Engineering Technicians',
        '19-1': 'Life Scientists', '19-2': 'Physical Scientists', '19-3': 'Social Scientists',
        '19-4': 'Science Technicians', '19-5': 'Occupational Health & Safety',
        '21-1': 'Counselors & Social Workers', '21-2': 'Religious Workers',
        '23-1': 'Lawyers & Judges', '23-2': 'Legal Support Workers',
        '25-1': 'Postsecondary Teachers', '25-2': 'K-12 Teachers',
        '25-3': 'Other Teachers', '25-4': 'Librarians & Archivists', '25-9': 'Other Education',
        '27-1': 'Art & Design Workers', '27-2': 'Entertainers & Performers',
        '27-3': 'Media & Communications', '27-4': 'Media Equipment Workers',
        '29-1': 'Health Diagnosing & Treating', '29-2': 'Health Technologists',
        '29-9': 'Other Healthcare Practitioners',
        '31-1': 'Home Health & Personal Care Aides', '31-2': 'Therapy Assistants',
        '31-9': 'Other Healthcare Support',
        '33-1': 'Protective Service Supervisors', '33-2': 'Firefighting Workers',
        '33-3': 'Law Enforcement', '33-9': 'Other Protective Services',
        '35-1': 'Food Service Supervisors', '35-2': 'Cooks & Food Prep',
        '35-3': 'Food & Beverage Servers', '35-9': 'Other Food Service',
        '37-1': 'Grounds & Cleaning Supervisors', '37-2': 'Building Cleaning Workers',
        '37-3': 'Grounds Maintenance',
        '39-1': 'Personal Care Supervisors', '39-2': 'Animal Care Workers',
        '39-3': 'Entertainment Attendants', '39-5': 'Personal Appearance Workers',
        '39-9': 'Other Personal Care',
        '41-1': 'Sales Supervisors', '41-2': 'Retail Sales Workers',
        '41-3': 'Sales Reps, Services', '41-4': 'Sales Reps, Wholesale & Mfg',
        '41-9': 'Other Sales',
        '43-1': 'Admin Support Supervisors', '43-2': 'Communications Operators',
        '43-3': 'Financial Clerks', '43-4': 'Information & Record Clerks',
        '43-5': 'Material Recording & Dispatching', '43-6': 'Secretaries & Admin Assistants',
        '43-9': 'Other Office & Admin Support',
        '45-2': 'Agricultural Workers', '45-4': 'Forest & Logging Workers',
        '47-1': 'Construction Supervisors', '47-2': 'Construction Trades',
        '47-3': 'Construction Helpers', '47-4': 'Other Construction',
        '47-5': 'Extraction Workers',
        '49-1': 'Maintenance Supervisors', '49-2': 'Electrical & Electronic Repairers',
        '49-3': 'Vehicle Mechanics', '49-9': 'Other Maintenance & Repair',
        '51-1': 'Production Supervisors', '51-2': 'Assemblers & Fabricators',
        '51-3': 'Food Processing Workers', '51-4': 'Metal & Plastic Workers',
        '51-5': 'Printing Workers', '51-6': 'Textile & Apparel Workers',
        '51-8': 'Plant & System Operators', '51-9': 'Other Production',
        '53-1': 'Transportation Supervisors', '53-2': 'Air Transportation',
        '53-3': 'Motor Vehicle Operators', '53-4': 'Rail Transportation',
        '53-7': 'Material Moving Workers', '53-9': 'Other Transportation',
    };

    function buildSocGroups(rows, metric) {
        const groups = {};
        rows.forEach(r => {
            const code = r['SOC'].slice(0, 6);
            const empl = toNum(r['Empl']);
            if (!groups[code]) groups[code] = { empl: 0, wsum: 0, firstName: r['Occupation'] };
            groups[code].empl += empl;
            groups[code].wsum += empl * toNum(r[metric]);
        });
        return Object.entries(groups)
            .filter(([, g]) => g.empl >= 50)
            .map(([code, g]) => ({
                label: SOC3_NAMES[code] || g.firstName || code,
                v: g.empl ? g.wsum / g.empl : 0,
            }));
    }

    function renderOccupationIntelligence(occRows) {
        const fmtPct  = v => (v >= 0 ? '+' : '') + (v * 100).toFixed(1) + '%';
        const fmtNum  = v => Math.round(v).toLocaleString();
        const fmtWage = v => '$' + Math.round(v / 1000) + 'K';

        const base = occRows.filter(r => r['Occupation'] && r['SOC'] && r['SOC'].slice(-2) !== '00');
        const noTotal = r => !r['Occupation'].toLowerCase().includes('total');

        const projGroups = buildSocGroups(base, 'Ann % Growth');

        // Both default to 5 on mobile instead of the desktop 8 — same idea
        // as the Hiring Demand charts and the occupations table, just
        // applied here too. The "Show More" toggle (mobile-only — see the
        // #occ-growth-toggle/#occ-wage-toggle CSS) reveals the rest of the
        // desktop-equivalent 8, it doesn't need its own separate full list.
        const growthAllData = projGroups.filter(g => g.v > 0).sort((a, b) => b.v - a.v).slice(0, 8);
        const wageAllData = base.filter(r => toNum(r['Mean Ann Wages2']) > 0)
            .sort((a, b) => toNum(b['Mean Ann Wages2']) - toNum(a['Mean Ann Wages2'])).slice(0, 8)
            .map(r => ({ label: r['Occupation'], v: toNum(r['Mean Ann Wages2']) }));

        let growthExpanded = false;
        let wageExpanded = false;

        function renderGrowth() {
            const count = growthExpanded || !isMobile() ? 8 : 5;
            renderBars('occ-proj-growth', growthAllData.slice(0, count), C.teal, fmtPct, 'mid-label');
            const btn = document.getElementById('occ-growth-toggle');
            if (btn) btn.textContent = growthExpanded ? '▲ Show Less' : '▼ Show More';
        }
        function renderWage() {
            const count = wageExpanded || !isMobile() ? 8 : 5;
            renderBars('occ-wage-mean', wageAllData.slice(0, count), C.orange, fmtWage, 'mid-label');
            const btn = document.getElementById('occ-wage-toggle');
            if (btn) btn.textContent = wageExpanded ? '▲ Show Less' : '▼ Show More';
        }

        renderGrowth();
        renderWage();

        const growthBtn = document.getElementById('occ-growth-toggle');
        if (growthBtn) growthBtn.addEventListener('click', () => { growthExpanded = !growthExpanded; renderGrowth(); });
        const wageBtn = document.getElementById('occ-wage-toggle');
        if (wageBtn) wageBtn.addEventListener('click', () => { wageExpanded = !wageExpanded; renderWage(); });

        window.addEventListener('resize', debounce(() => { renderGrowth(); renderWage(); }, 250));

        // Job Exits / Occupational Transfers / Net New Positions share one
        // full-width chart behind a tab switcher instead of three stacked
        // cards — same information, a fraction of the vertical space, and
        // the full-width column gives labels room to not truncate as hard.
        const DEMAND_METRICS = {
            exits: {
                sub: 'Workers permanently leaving the occupation annually', color: C.orange,
                data: base.filter(noTotal).filter(r => toNum(r['Exits']) > 0)
                    .sort((a, b) => toNum(b['Exits']) - toNum(a['Exits'])).slice(0, 5)
                    .map(r => ({ label: r['Occupation'], v: toNum(r['Exits']) })),
            },
            transfers: {
                sub: 'Workers moving into a different occupation annually', color: C.accent,
                data: base.filter(noTotal).filter(r => toNum(r['Transfers']) > 0)
                    .sort((a, b) => toNum(b['Transfers']) - toNum(a['Transfers'])).slice(0, 5)
                    .map(r => ({ label: r['Occupation'], v: toNum(r['Transfers']) })),
            },
            netgrowth: {
                sub: 'Projected net employment growth (absolute jobs added)', color: C.teal,
                data: base.filter(noTotal).filter(r => toNum(r['Empl Growth']) > 0)
                    .sort((a, b) => toNum(b['Empl Growth']) - toNum(a['Empl Growth'])).slice(0, 5)
                    .map(r => ({ label: r['Occupation'], v: toNum(r['Empl Growth']) })),
            },
        };

        const tabs  = document.querySelectorAll('.occ-tab');
        const subEl = document.getElementById('occ-demand-sub');

        function renderDemand(metric) {
            const m = DEMAND_METRICS[metric];
            if (!m) return;
            if (subEl) subEl.textContent = m.sub;
            renderBars('occ-demand-chart', m.data, m.color, fmtNum, 'wide-label');
            tabs.forEach(t => {
                const active = t.dataset.metric === metric;
                t.classList.toggle('active', active);
                t.setAttribute('aria-selected', String(active));
            });
        }

        tabs.forEach(t => t.addEventListener('click', () => renderDemand(t.dataset.metric)));
        renderDemand('exits');
    }

    // ===== INIT =====
    Promise.all([
        d3.csv('data/Industry Snapshot.csv'),
        d3.csv('data/Occupation Snapshot.csv'),
        d3.csv('data/Population By County.csv'),
        d3.csv('data/Net Commuting LODES.csv'),   // LODES 2023: jobs located here minus employed residents
        d3.csv('data/Demographics.csv'),
    ]).then(([indRows, occRows, popRows, commRows, demoRows]) => {
        const dataRows = indRows.filter(r => (r['NAICS'] || '').trim() !== '');
        const totalRow = indRows.find(r => !(r['NAICS'] || '').trim());

        loadKPIs(dataRows, totalRow, popRows, commRows);

        hierarchy = buildHierarchy(dataRows);
        officialJobs = totalRow ? toNum(totalRow['Empl']) : 0;   // same total as the KPI (a few jobs sit outside the 20 sectors)
        renderDonut(hierarchy);
        writeFindings(totalRow, occRows, demoRows);

        renderDemographics(demoRows, popRows);
        renderOccupations(occRows);
        renderOccupationIntelligence(occRows);
    }).catch(err => {
        console.error('Workforce data load error:', err);
    });

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

/* ===== ADJUSTED PICTURE — supporting context toggle ===== */
(function () {
    const btn = document.getElementById('adj-context-toggle');
    const box = document.getElementById('adj-context');
    if (!btn || !box) return;
    btn.addEventListener('click', () => {
        const open = box.classList.toggle('open');
        btn.textContent = open ? '▲ Hide Supporting Context' : '▼ Show Supporting Context';
    });
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
        setActive(visible[0].target.id);
    }, { rootMargin: '-140px 0px -70% 0px', threshold: 0 });

    sections.forEach(s => observer.observe(s));
})();

/* ===== MOBILE CAROUSELS (Fast Facts, Adjusted Picture, Demographics) =====
   The card grids stack full-width on mobile (see viz.css), which is a lot
   of vertical clutter for repeated-shape cards — swiped one at a time
   instead, with dot indicators showing position/count. Card markup itself
   is untouched; this only adds the dots and keeps them synced to scroll
   position, and only runs below the same breakpoint the CSS switches on. */
(function () {
    const MOBILE_BREAKPOINT = 768;
    const CAROUSELS = [
        { selector: '.stats-grid', itemSelector: '.kpi-block' },
        { selector: '.adj-metrics-grid', itemSelector: '.adj-card' },
        { selector: '.demo-grid', itemSelector: '.demo-card' },
    ];

    function isMobile() { return window.innerWidth <= MOBILE_BREAKPOINT; }

    let resizeTimer;
    function debounced(fn, ms) { clearTimeout(resizeTimer); resizeTimer = setTimeout(fn, ms); }

    function buildDots(container, items) {
        const dots = document.createElement('div');
        dots.className = 'carousel-dots';
        const dotEls = items.map((item, i) => {
            const dot = document.createElement('button');
            dot.type = 'button';
            dot.className = 'carousel-dot' + (i === 0 ? ' active' : '');
            dot.setAttribute('aria-label', `Go to card ${i + 1} of ${items.length}`);
            dot.addEventListener('click', () => {
                item.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
            });
            dots.appendChild(dot);
            return dot;
        });
        container.insertAdjacentElement('afterend', dots);

        // Whichever card is most visible in the scroll container gets the
        // active dot — tracks both swipes and dot-click scrolls, since both
        // just move the container's scroll position. With two-up carousels
        // (Fast Facts) more than one card can cross the threshold in the
        // same batch; naively setting the dot per-entry as the loop went
        // let whichever entry happened to be processed last win, which was
        // usually the second (right-hand) card even at the very start of
        // the scroll. Taking the lowest index among everything currently
        // visible picks the leading card of the page instead, correct for
        // both one-up and two-up carousels.
        const io = new IntersectionObserver((entries) => {
            const visibleIdxs = entries
                .filter(e => e.isIntersecting)
                .map(e => items.indexOf(e.target))
                .filter(i => i !== -1);
            if (!visibleIdxs.length) return;
            const idx = Math.min(...visibleIdxs);
            dotEls.forEach((d, i) => d.classList.toggle('active', i === idx));
        }, { root: container, threshold: 0.6 });
        items.forEach(item => io.observe(item));
    }

    const ARROW_LEFT  = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>';
    const ARROW_RIGHT = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>';

    // A precise, clickable alternative to swiping — mainly for a desktop
    // browser resized down to a mobile width, where there's a mouse but no
    // touch/swipe gesture available at all.
    function buildArrows(wrap, container) {
        const prev = document.createElement('button');
        prev.type = 'button';
        prev.className = 'carousel-arrow carousel-arrow--prev';
        prev.setAttribute('aria-label', 'Scroll to previous card');
        prev.innerHTML = ARROW_LEFT;

        const next = document.createElement('button');
        next.type = 'button';
        next.className = 'carousel-arrow carousel-arrow--next';
        next.setAttribute('aria-label', 'Scroll to next card');
        next.innerHTML = ARROW_RIGHT;

        wrap.appendChild(prev);
        wrap.appendChild(next);

        prev.addEventListener('click', () => container.scrollBy({ left: -container.clientWidth * 0.9, behavior: 'smooth' }));
        next.addEventListener('click', () => container.scrollBy({ left: container.clientWidth * 0.9, behavior: 'smooth' }));

        // The container's own left padding (see the ≤768px carousel CSS)
        // means a fresh, unscrolled carousel already sits at scrollLeft ≈
        // that padding value, not 0 — scroll-snap-align: start snaps the
        // first card's edge to the padding box, not the true edge of the
        // scroll range. A slack of ~24px (comfortably past that natural
        // resting point, well short of a real card-width scroll) is what
        // "at the start" actually means here, not a strict ≤4.
        const EDGE_SLACK = 24;
        function updateArrows() {
            const maxScroll = container.scrollWidth - container.clientWidth;
            prev.classList.toggle('is-hidden', container.scrollLeft <= EDGE_SLACK);
            next.classList.toggle('is-hidden', container.scrollLeft >= maxScroll - EDGE_SLACK);
        }
        container.addEventListener('scroll', updateArrows, { passive: true });
        updateArrows();
    }

    function init() {
        if (!isMobile()) return;
        CAROUSELS.forEach(({ selector, itemSelector }) => {
            const container = document.querySelector(selector);
            if (!container || container.dataset.carouselInit) return;
            const items = Array.from(container.querySelectorAll(itemSelector));
            if (items.length < 2) return;
            container.dataset.carouselInit = '1';

            const wrap = document.createElement('div');
            wrap.className = 'carousel-wrap';
            container.parentNode.insertBefore(wrap, container);
            wrap.appendChild(container);

            buildDots(container, items);
            buildArrows(wrap, container);
        });
    }

    init();
    window.addEventListener('resize', () => debounced(init, 250));
})();

/* ===== COLLAPSIBLE SECTIONS (mobile only) =====
   Every .section on this page follows the same label -> title -> desc ->
   content shape, so the content can be wrapped generically at runtime
   instead of hand-editing seven different HTML blocks. Default stays
   expanded (nothing hides on load, so chart width measurements taken at
   render time are unaffected) — this just gives mobile users an easy way
   to collapse a section closed after reading it. */
(function () {
    const MOBILE_BREAKPOINT = 768;
    function isMobile() { return window.innerWidth <= MOBILE_BREAKPOINT; }

    const CHEVRON_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>';

    function wireSection(section) {
        if (section.dataset.collapseInit) return;
        const desc  = section.querySelector(':scope > .section-desc');
        const title = section.querySelector(':scope > .section-title');
        if (!desc || !title) return;
        section.dataset.collapseInit = '1';

        const body = document.createElement('div');
        body.className = 'section-body';
        let sib = desc.nextElementSibling;
        while (sib) {
            const next = sib.nextElementSibling;
            body.appendChild(sib);
            sib = next;
        }
        desc.insertAdjacentElement('afterend', body);

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'section-collapse-btn';
        btn.setAttribute('aria-expanded', 'true');
        btn.setAttribute('aria-label', 'Collapse section');
        btn.innerHTML = CHEVRON_SVG;
        title.appendChild(btn);

        btn.addEventListener('click', () => {
            const collapsed = body.classList.toggle('collapsed');
            btn.classList.toggle('is-collapsed', collapsed);
            btn.setAttribute('aria-expanded', String(!collapsed));
            btn.setAttribute('aria-label', collapsed ? 'Expand section' : 'Collapse section');
        });
    }

    function init() {
        if (!isMobile()) return;
        document.querySelectorAll('main .section').forEach(wireSection);
    }

    let resizeTimer;
    init();
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(init, 250);
    });
})();
