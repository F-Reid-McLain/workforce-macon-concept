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
            groups[id] = { id, name: cfg.name, color: cfg.color, children: [], gone: [] };
        }
        for (const row of rows) {
            const naics = (row['NAICS'] || '').trim();
            if (!naics) continue;
            const empl = toNum(row['Empl']);
            const id = sectorFor(naics);
            if (!id) continue;
            // Industries down to no jobs here draw no slice, but their losses still count in
            // their sector's five-year change (as in the Industries title slide's figures)
            (empl > 0 ? groups[id].children : groups[id].gone).push({
                name: (row['Industry'] || '').trim(),
                naics,
                empl,
                wage: toNum(row['Avg Ann Wages']),
                lq: toNum(row['LQ']),               // concentration vs. the U.S. (1 = the U.S. share)
                change: toNum(row['Empl Change']),  // jobs gained or lost over five years
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
    // What the colors show (the switch under the donut), and whether the U.S. ring is on
    let donutMode = 'sector', donutUS = false;
    const PAY = d3.scaleLinear([25000, 55000, 95000], ['#39425a', '#8a7748', '#f2c46b']).clamp(true);
    const GROWTH = d3.scaleLinear([-0.2, 0, 0.2], ['#e8705f', '#4b5568', '#34d399']).clamp(true);
    const colorOf = d => donutMode === 'pay' ? PAY(d.wage) : donutMode === 'growth' ? GROWTH(d.growth) : d.color;
    const fmtPay = v => '$' + Math.round(v / 1000) + 'K';
    const fmtGrowth = v => { const p = Math.round(v * 100); return (p > 0 ? '+' : p < 0 ? '−' : '') + Math.abs(p) + '%'; };

    // A slice's figures from its industries: jobs, average pay, five-year change, and its
    // "U.S.-equivalent" size (jobs ÷ concentration: what its share of jobs would be nationally)
    function figures(list) {
        const value = d3.sum(list, c => c.empl);
        const before = d3.sum(list, c => c.empl - c.change);
        return { value, wage: value ? d3.sum(list, c => c.empl * c.wage) / value : 0,
                 growth: before > 0 ? d3.sum(list, c => c.change) / before : 0,
                 us: d3.sum(list, c => c.lq > 0 ? c.empl / c.lq : 0) };
    }
    const sectorJobs = g => d3.sum(g.children, c => c.empl);
    function donutSlices(node) {
        if (node === hierarchy) {
            return node.children.map(g => ({ name: g.name, color: g.color, sector: g, ...figures(g.children.concat(g.gone)) }))
                .sort((a, b) => b.value - a.value);
        }
        const kids = [...node.children].sort((a, b) => b.empl - a.empl), top = kids.slice(0, 10), rest = kids.slice(10);
        const out = top.map((c, i) => ({ name: c.name, naics: c.naics, ...figures([c]),
            color: d3.interpolateRgb(node.color, '#1b2433')(Math.min(0.75, i * 0.075)) }));
        if (rest.length) out.push({ name: `Other (${rest.length} industries)`, color: DONUT_OTHER, other: true, ...figures(rest.concat(node.gone || [])) });
        return out;
    }

    // trans: how this view arrives. { zoomIn: [a0, a1] } grows it out of the wedge the sector had
    // in the ring before; { zoomOut: sector } shrinks the old ring back into that sector's wedge.
    // ghosts: the old ring's slices, drawn fading or folding away while the new one arrives.
    function renderDonut(node, opts = {}) {
        const box = document.getElementById('donut');
        if (!box || !node) return;
        donutNode = node;
        const isRoot = node === hierarchy;
        const slices = donutSlices(node);
        const allJobs = sectorJobsAll();
        const total = d3.sum(slices, d => d.value), usTotal = d3.sum(slices, d => d.us) || 1;
        const size = Math.max(240, Math.min(box.clientWidth || 480, 520)), R = size / 2, inner = R * 0.62;
        const svg = d3.select('#donut-svg').attr('viewBox', `${-R} ${-R} ${size} ${size}`).attr('width', size).attr('height', size);
        box.style.setProperty('--donut-size', size + 'px');
        const pie = d3.pie().value(d => d.value).sort(null).padAngle(0.006)(slices);
        const usPie = d3.pie().value(d => d.us).sort(null).padAngle(0.006)(slices);
        const arc = d3.arc().innerRadius(inner).outerRadius(R - 6).cornerRadius(3);
        const arcHot = d3.arc().innerRadius(inner - 2).outerRadius(R).cornerRadius(3);
        const usArc = d3.arc().innerRadius(inner - 15).outerRadius(inner - 7).cornerRadius(2);
        const fmtShare = v => (v * 100 >= 10 ? Math.round(v * 100) : (v * 100).toFixed(1)) + '%';
        const clickable = d => isRoot || !d.data.other;

        // Layers: the U.S. ring inside, the ring itself, and the old ring's ghosts on top
        const gUS = svg.selectAll('g.d-us').data([0]).join('g').attr('class', 'd-us');
        const gRing = svg.selectAll('g.d-ring').data([0]).join('g').attr('class', 'd-ring');
        const gGhost = svg.selectAll('g.d-ghost').data([0]).join('g').attr('class', 'd-ghost');
        svg.selectAll(':scope > path').remove();   // (from before the layers)
        const paths = gRing.selectAll('path').data(pie, d => d.data.name).join('path')
            .attr('fill', d => colorOf(d.data))
            .attr('tabindex', d => clickable(d) ? 0 : -1)
            .attr('role', d => clickable(d) ? 'button' : 'img')
            .attr('aria-label', d => `${d.data.name}: ${Math.round(d.value).toLocaleString()} jobs, ${fmtShare(d.value / total)}` +
                (isRoot ? '' : d.data.other ? '' : '. Open its details'))
            .style('cursor', d => clickable(d) ? 'pointer' : 'default');
        const usPaths = gUS.selectAll('path').data(usPie, d => d.data.name).join('path')
            .attr('fill', d => colorOf(d.data)).attr('d', usArc).attr('aria-hidden', 'true');
        gUS.style('opacity', donutUS ? 0.8 : 0);

        // The old ring, kept as ghosts for the transition
        const ghosts = gGhost.selectAll('path').data(opts.ghosts || []).join('path')
            .attr('fill', d => d.fill).style('pointer-events', 'none');

        // Draw at assembly progress a (0–1): each slice sweeps open in turn, largest first.
        // During a zoom, z (0–1) carries angles between the sector's old wedge and the full ring.
        const n = pie.length, TAU = 2 * Math.PI;
        const trans = opts.trans || null;
        const outIdx = trans && trans.zoomOut ? pie.findIndex(d => d.data.sector === trans.zoomOut) : -1;
        const span = trans && trans.zoomIn ? trans.zoomIn : outIdx >= 0 ? [pie[outIdx].startAngle, pie[outIdx].endAngle] : null;
        const into = (t, w) => w[0] + (t / TAU) * (w[1] - w[0]);
        let zNow = trans ? 0 : 1;   // the zoom's progress, so a hover mid-zoom doesn't jump it to the end
        function draw(a, hot, z = zNow) {
            zNow = z;
            paths.attr('d', (d, i) => {
                const r = Math.max(0, Math.min(1, (a * (n + 4) - i) / 4));
                const e = 1 - Math.pow(1 - r, 3);
                if (e <= 0) return null;
                let s0 = d.startAngle, s1 = d.startAngle + (d.endAngle - d.startAngle) * e;
                if (trans && trans.zoomIn) { s0 = into(s0, span) + (s0 - into(s0, span)) * z; s1 = into(s1, span) + (s1 - into(s1, span)) * z; }
                return (hot === i ? arcHot : arc)({ ...d, startAngle: s0, endAngle: s1 });
            }).attr('opacity', (d, i) => {
                if ((a * (n + 4) - i) <= 0) return 0;
                if (outIdx >= 0) return i === outIdx ? (z > 0.85 ? 1 : 0) : Math.min(1, z * 1.3);   // the rest of the ring fades back in
                return 1;
            });
            // the old ring: zooming in, its other sectors fade and slide outward; zooming out, its
            // industries fold back into their sector's wedge
            ghosts.attr('d', g => {
                if (trans && trans.zoomOut && span) {
                    const s0 = g.startAngle + (into(g.startAngle, span) - g.startAngle) * z, s1 = g.endAngle + (into(g.endAngle, span) - g.endAngle) * z;
                    return arc({ ...g, startAngle: s0, endAngle: s1 });
                }
                return d3.arc().innerRadius(inner + 14 * z).outerRadius(R - 6 + 14 * z).cornerRadius(3)(g);
            }).attr('opacity', g => trans && trans.zoomOut ? (z < 0.85 ? 1 : (1 - z) / 0.15) : Math.max(0, 1 - z * 1.6));
            if (z >= 1) gGhost.selectAll('path').remove();
            // Each legend row arrives with its slice
            legendRows.forEach((b, i) => { const r = Math.max(0, Math.min(1, (a * (n + 4) - i) / 2)); b.style.opacity = trans ? Math.min(1, z * 1.5) : r; b.style.transform = trans ? '' : `translateX(${(1 - r) * 8}px)`; });
        }
        let hot = -1;
        const center = document.getElementById('donut-center');
        const lead = d => donutMode === 'pay' ? fmtPay(d.wage) : donutMode === 'growth' ? fmtGrowth(d.growth) : fmtShare(d.value / total);
        const centerDefault = () => {
            const key = donutUS ? '<small>Outer ring: Macon-Bibb · inner: the U.S.</small>'
                : donutMode === 'pay' ? '<small>Colored by average pay</small>' : donutMode === 'growth' ? '<small>Colored by five-year job change</small>' : '';
            return isRoot
                ? `<b>${Math.round(officialJobs || allJobs).toLocaleString()}</b><span>jobs in ${slices.length} sectors</span>${key || '<small>Click a slice to look inside</small>'}`
                : `<b>${fmtShare(total / allJobs)}</b><span>${node.name}</span>${key || `<small>${Math.round(total).toLocaleString()} jobs · click an industry, or here to go back</small>`}`;
        };
        const setCenter = i => {
            if (i < 0) { center.innerHTML = centerDefault(); return; }
            const d = pie[i].data;
            const us = donutUS ? ` · U.S. ${fmtShare(d.us / usTotal)}` : '';
            const detail = donutMode === 'sector' ? `${Math.round(d.value).toLocaleString()} jobs${d.wage ? ` · ${fmtPay(d.wage)} avg pay` : ''}`
                : `${fmtShare(d.value / total)} of jobs · ${Math.round(d.value).toLocaleString()} jobs`;
            center.innerHTML = `<b>${lead(d)}</b><span>${d.name}</span><small>${donutUS ? `Here ${fmtShare(d.value / total)}${us}` : detail}</small>`;
        };
        const legend = document.getElementById('donut-legend');
        // Column headings make it plain what each figure is
        const lastHead = donutMode === 'pay' ? 'Avg pay' : donutMode === 'growth' ? 'Change' : isRoot ? '% of jobs' : '% of sector';
        legend.innerHTML = `<li class="donut-legend__head" aria-hidden="true"><span></span><span>${isRoot ? 'Industry sector' : 'Industry in ' + node.name}</span>
            <span>Jobs</span><span>${lastHead}</span></li>` + pie.map((d, i) => `<li><button type="button" data-i="${i}" ${clickable(d) ? '' : 'tabindex="-1"'}>
            <i style="background:${colorOf(d.data)}"></i><span class="dl-name">${d.data.name}</span>
            <span class="dl-val">${Math.round(d.value).toLocaleString()}</span><span class="dl-share">${lead(d.data)}</span></button></li>`).join('');
        const legendRows = Array.from(legend.querySelectorAll('button'));
        // Slice i hot (or none, -1); with none, any sectors lit by the other tools stay lit
        const paint = i => {
            const lit = isRoot && donutLit;
            paths.attr('fill-opacity', (d, j) => i >= 0 ? (j === i ? 1 : 0.35) : !lit || lit.has(d.data.sector.id) ? 1 : 0.2);
            usPaths.attr('fill-opacity', (d, j) => i >= 0 ? (j === i ? 1 : 0.3) : 1);
            legendRows.forEach((b, j) => b.classList.toggle('is-dim', i < 0 && !!lit && !lit.has(pie[j].data.sector.id)));
        };
        const highlight = i => {
            hot = i;
            draw(donutBuilt, hot);
            paint(i);
            legendRows.forEach((b, j) => b.classList.toggle('is-hot', j === i));
            setCenter(i);
        };
        // A sector opens into its industries; an industry opens its details (js/lookups.js)
        const open = i => {
            const d = pie[i] && pie[i].data;
            if (!d) return;
            if (isRoot && d.sector) animateTo(d.sector);
            else if (!isRoot && d.naics && WFDonut.onIndustry) WFDonut.onIndustry(d.naics);
        };

        paths.on('mouseenter', (e, d) => highlight(pie.indexOf(d))).on('mouseleave', () => highlight(-1))
            .on('focus', (e, d) => highlight(pie.indexOf(d))).on('blur', () => highlight(-1))
            .on('click', (e, d) => open(pie.indexOf(d)))
            .on('keydown', (e, d) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(pie.indexOf(d)); } });
        legendRows.forEach((b, i) => {
            b.addEventListener('mouseenter', () => highlight(i)); b.addEventListener('mouseleave', () => highlight(-1));
            b.addEventListener('focus', () => highlight(i)); b.addEventListener('blur', () => highlight(-1));
            b.addEventListener('click', () => open(i));
        });
        center.classList.toggle('is-back', !isRoot);
        center.onclick = isRoot ? null : () => animateTo(hierarchy);
        const back = document.getElementById('donut-back');
        back.hidden = isRoot;
        back.onclick = () => animateTo(hierarchy);
        box.classList.toggle('is-drilled', !isRoot);

        // Recolor (the switch) and show or hide the U.S. ring, without rebuilding
        renderDonut.recolor = () => {
            paths.transition().duration(450).attr('fill', d => colorOf(d.data));
            usPaths.transition().duration(450).attr('fill', d => colorOf(d.data));
            legendRows.forEach((b, i) => { b.querySelector('i').style.background = colorOf(pie[i].data); b.querySelector('.dl-share').textContent = lead(pie[i].data); });
            const h = legend.querySelector('.donut-legend__head span:nth-child(4)');
            if (h) h.textContent = donutMode === 'pay' ? 'Avg pay' : donutMode === 'growth' ? 'Change' : isRoot ? '% of jobs' : '% of sector';
            gUS.transition().duration(450).style('opacity', donutUS ? 0.8 : 0);
            setCenter(hot);
        };
        renderDonut.snapshot = () => ({ node, pie: pie.map(d => ({ startAngle: d.startAngle, endAngle: d.endAngle, padAngle: d.padAngle, fill: colorOf(d.data), sector: d.data.sector })) });
        renderDonut.draw = (a, z) => draw(a, hot, z === undefined ? zNow : z);
        renderDonut.hot = highlight;
        renderDonut.indexOf = naics => { const k = pie.findIndex(d => d.data.naics === naics); return k >= 0 ? k : pie.findIndex(d => d.data.other); };
        paint(-1);
        setCenter(-1);
        draw(opts.assemble === undefined ? donutBuilt : opts.assemble, -1, trans ? 0 : 1);
    }
    function sectorJobsAll() { return hierarchy ? d3.sum(hierarchy.children, sectorJobs) : 0; }
    // Drill in or out. Into a sector from the whole ring: its slice grows to fill the ring as it
    // splits into its industries, and the other sectors fade away. Back out: the industries fold
    // into their sector's wedge and the other sectors return. Anything else sweeps in fresh.
    function animateTo(node) {
        if (donutAnim) donutAnim.stop();
        const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
        const was = renderDonut.snapshot ? renderDonut.snapshot() : null;
        donutBuilt = 1;   // once someone has drilled, the first-view assembly is done
        let opts = { assemble: reduce ? 1 : 0 };
        if (!reduce && was && was.node === hierarchy && node !== hierarchy) {
            const w = was.pie.find(p => p.sector === node);
            if (w) opts = { assemble: 1, trans: { zoomIn: [w.startAngle, w.endAngle] }, ghosts: was.pie.filter(p => p !== w) };
        } else if (!reduce && was && was.node !== hierarchy && node === hierarchy) {
            opts = { assemble: 1, trans: { zoomOut: was.node }, ghosts: was.pie };
        }
        renderDonut(node, opts);
        if (reduce) return;
        const ms = opts.trans ? 820 : 750, ease = d3.easeCubicInOut;
        donutAnim = d3.timer(t => {
            const k = Math.min(1, t / ms);
            if (opts.trans) renderDonut.draw(1, ease(k)); else renderDonut.draw(k);
            if (k >= 1) { donutAnim.stop(); donutAnim = null; }
        });
    }
    // The switch under the donut (what the colors show) and the U.S. ring toggle
    function donutControls() {
        const mode = document.getElementById('donut-mode'), us = document.getElementById('donut-us'), key = document.getElementById('donut-key');
        if (!mode || !window.WFTools) return;
        const showKey = () => {
            key.hidden = donutMode === 'sector';
            key.className = 'donut-key donut-key--' + donutMode;
            key.innerHTML = donutMode === 'pay' ? '<span>$25K</span><i></i><span>$95K+ avg pay</span>'
                : donutMode === 'growth' ? '<span>−20%</span><i></i><span>+20% in 5 yrs</span>' : '';
        };
        WFTools.segmented(mode, v => { donutMode = v; showKey(); if (renderDonut.recolor) renderDonut.recolor(); })('sector');
        us.addEventListener('click', () => {
            donutUS = !donutUS;
            us.setAttribute('aria-pressed', String(donutUS));
            if (renderDonut.recolor) renderDonut.recolor();
        });
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
        donutControls();
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
