/* ===== INDUSTRIES TITLE SLIDE: WHAT'S GROWING — homepage =====
   "Manufacturing is growing three times as fast as health care": Macon-Bibb and its
   interstates draw in (js/intro-map.js), a year ticker counts from 2015 to 2026, and
   each new or expanding manufacturer rises at its site as the ticker passes its year,
   while its row joins the list beside the map. Plants announced but not yet open come
   last, drawn as dashed outlines. Pins are numbered to match the list and nudged
   apart where they crowd (several sit in Sofkee Industrial Park), with a short line
   back to the real spot.
   Headline, dek and bars are computed from data/Industry Snapshot.csv (NAICS 31-33
   manufacturing vs. 62 health care, five-year change); the plants are
   content/manufacturers.json. */
(function () {
    'use strict';
    const svgEl = document.getElementById('grow-intro-map');
    if (!svgEl || !window.WFIntroMap) return;
    const slide = svgEl.closest('.stop-intro');
    const listEl = document.getElementById('grow-list');
    const barsEl = document.getElementById('grow-bars');
    const FIRST = 2015, LAST = 2026;
    const SOUTH = [-83.668, 32.728];   // the plants cluster in south Bibb (Sofkee, the airport, I-75), so the map centers here
    const T0 = 0.34, T1 = 0.86;   // the ticker's run, in build progress
    const toNum = v => +String(v || '').replace(/[$,]/g, '') || 0;
    const nw = s => s.replace(/Macon-Bibb/g, '<span class="nw">Macon-Bibb</span>');
    const TIMES = { 2: 'twice', 3: 'three times', 4: 'four times', 5: 'five times', 6: 'six times' };

    // ----- The numbers -----
    let rows = [];   // bar rows: { label, pct }
    const numbers = d3.csv('data/Industry Snapshot.csv').then(ind => {
        const sector = test => {
            const r = ind.filter(x => test((x['NAICS'] || '').trim()));
            const jobs = d3.sum(r, x => toNum(x['Empl'])), change = d3.sum(r, x => toNum(x['Empl Change']));
            return { jobs, change, pct: change / (jobs - change), pay: d3.sum(r, x => toNum(x['Empl']) * toNum(x['Avg Ann Wages'])) / jobs };
        };
        const mfg = sector(n => /^3[1-3]/.test(n)), hc = sector(n => /^62/.test(n));
        const total = ind.find(x => !(x['NAICS'] || '').trim());
        const avg = total ? toNum(total['Avg Ann Wages']) : 0;
        const times = TIMES[Math.round(mfg.pct / hc.pct)];
        const head = document.getElementById('find-industries');
        if (head && times) head.innerHTML = nw(`<em>Manufacturing</em> is growing <em>${times}</em> as fast as health care in Macon-Bibb.`);
        else if (head) head.innerHTML = nw(`<em>Manufacturing</em> jobs in Macon-Bibb grew <em>${Math.round(mfg.pct * 100)}%</em> in five years.`);
        rows = [{ label: 'Manufacturing', pct: mfg.pct, cls: 'is-mfg' }, { label: 'Health care', pct: hc.pct, cls: '' }];
        return { mfg, avg };
    });
    let plantList = [];
    const plants = d3.json('content/manufacturers.json').then(d => (plantList = d.plants.slice().sort((a, b) => a.year - b.year)));
    // The words and the side panel go in first, so the map is fitted to the finished layout
    const side = Promise.all([numbers, plants]).then(([{ mfg, avg }, list]) => {
        const announced = d3.sum(list.filter(p => p.status === 'coming' && p.year === LAST), p => p.jobs);
        const premium = Math.round((mfg.pay - avg) / 1000) * 1000;
        const dek = document.getElementById('grow-dek');
        if (dek) dek.innerHTML = nw(`Macon-Bibb added <b>${(Math.round(mfg.change / 100) * 100).toLocaleString()}</b> factory jobs in the past five years, paying <b>$${(Math.round(mfg.pay / 100) * 100).toLocaleString()}</b> on average` +
            (premium > 0 ? `, about $${premium.toLocaleString()} more than the county average` : '') + '.' +
            (announced ? ` And <b>${announced.toLocaleString()}</b> more were announced in ${LAST} alone.` : ''));
        buildSide(list);
    });
    side.catch(err => console.error('Growth slide numbers failed to load', err));

    // ----- The bars and the list (HTML, beside the map) -----
    let barFills = [], listRows = [];
    function buildSide(list) {
        const max = d3.max(rows, r => r.pct) || 1;
        barsEl.innerHTML = '<p class="grow-bars__title">Job growth, past five years</p>' + rows.map(r =>
            `<div class="grow-bar ${r.cls}"><span class="grow-bar__label">${r.label}</span><span class="grow-bar__track"><span class="grow-bar__fill" style="width:${(r.pct / max * 100).toFixed(1)}%"></span></span><span class="grow-bar__val">+${(r.pct * 100).toFixed(1)}%</span></div>`).join('');
        barFills = [...barsEl.querySelectorAll('.grow-bar__fill')];
        listEl.innerHTML = list.map((p, i) =>
            `<li class="${p.status === 'coming' ? 'is-coming' : ''}"><span class="gl-n">${i + 1}</span><span class="gl-y">${p.year}</span><span class="gl-what"><b>${p.short}</b> ${p.makes} · ${p.jobsLabel}${p.status === 'coming' ? ' <span class="gl-tag">coming</span>' : p.event === 'expanded' ? ' <span class="gl-tag gl-tag--x">expanding</span>' : ''}</span></li>`).join('');
        listRows = [...listEl.children];
    }

    // When each plant rises: as the ticker passes its year; plants sharing a year follow one another
    const appearAt = (list) => list.map((p, i) => {
        const same = list.slice(0, i).filter(q => q.year === p.year).length;
        return T0 + (p.year - FIRST) / (LAST - FIRST) * (T1 - T0) + same * 0.035;
    });
    // The factory: a sawtooth roof, a chimney and two windows, its base on (0, 0)
    const ROOF = 'M-12,-9 L-12,-16 L-6,-11 L-6,-16 L0,-11 L0,-16 L6,-11 L6,-16 L12,-11 L12,-9 Z';

    WFIntroMap.create({
        svg: svgEl,
        drawMs: 4800,
        ready: side,
        base: { neighbors: [0, 0.18], bibb: [0.04, 0.24], ints: [0.12, 0.32], us: null, shields: [0.26, 0.34] },
        fit: (W, H, wide) => {
            if (wide) return { x: W * 0.75, y: H * 0.47, w: 0.62, h: 0.82, at: SOUTH };
            // Phones: in the gap between the text and the list
            const inner = slide.querySelector('.stop-intro__inner');
            const top = inner.offsetTop + inner.offsetHeight, bottom = listEl.offsetTop;
            const y = (top + bottom) / 2 + 10;
            slide.style.setProperty('--gm-top', top.toFixed(0) + 'px');   // the map fades in below the text and out above the list (css/chapters.css)
            slide.style.setProperty('--gm-bottom', bottom.toFixed(0) + 'px');
            return { x: W / 2, y, w: 1.15, h: Math.max(0.3, (bottom - top) * 1.6 / H), at: SOUTH };
        },
        layer({ svg, proj, W, H, wide, DOWNTOWN }) {
            const list = plantList;
            const at = appearAt(list);
            const size = p => (wide ? 1.2 : 1.05) + 0.5 * Math.sqrt(p.jobs / 600);
            // Pins start on their real spots and are nudged apart where they'd overlap
            const nodes = list.map((p, i) => { const [x, y] = proj([p.lon, p.lat]); return { i, p, sx: x, sy: y, x, y: y - 6, r: 15 * size(p) }; });
            const sim = d3.forceSimulation(nodes)
                .force('x', d3.forceX(d => d.sx).strength(0.35)).force('y', d3.forceY(d => d.sy - 6).strength(0.35))
                .force('collide', d3.forceCollide(d => d.r).iterations(3)).stop();
            for (let k = 0; k < 220; k++) sim.tick();

            const g = svg.append('g').attr('class', 'gm-plants');
            const pins = g.selectAll('g.gm-pin').data(nodes).join('g').attr('class', d => 'gm-pin' + (d.p.status === 'coming' ? ' is-coming' : ''));
            pins.append('circle').attr('class', 'gm-spot').attr('cx', d => d.sx).attr('cy', d => d.sy).attr('r', 2.4);
            pins.append('line').attr('class', 'gm-leader')
                .attr('x1', d => d.sx).attr('y1', d => d.sy).attr('x2', d => d.x).attr('y2', d => d.y + 6)
                .style('display', d => Math.hypot(d.x - d.sx, d.y + 6 - d.sy) > 5 ? null : 'none');
            const bodies = pins.append('g').attr('class', 'gm-factory');
            bodies.append('rect').attr('class', 'gm-chimney').attr('x', 6.5).attr('y', -22).attr('width', 3.6).attr('height', 9);
            bodies.append('path').attr('class', 'gm-roof').attr('d', ROOF);
            bodies.append('rect').attr('class', 'gm-wall').attr('x', -12).attr('y', -9).attr('width', 24).attr('height', 9);
            bodies.append('rect').attr('class', 'gm-win').attr('x', -9).attr('y', -6.5).attr('width', 4).attr('height', 3.5);
            bodies.append('rect').attr('class', 'gm-win').attr('x', -2).attr('y', -6.5).attr('width', 4).attr('height', 3.5);
            const badges = pins.append('g').attr('class', 'gm-badge');
            badges.append('circle').attr('r', 7);
            badges.append('text').attr('text-anchor', 'middle').attr('dy', '0.35em').text(d => d.i + 1);

            // Downtown, for bearings
            const [dx, dy] = proj(DOWNTOWN);
            const down = svg.insert('g', '.gm-plants').attr('class', 'gm-downtown').attr('transform', `translate(${dx.toFixed(1)},${dy.toFixed(1)})`);
            down.append('circle').attr('r', 3.5);
            down.append('text').attr('x', 8).attr('dy', '0.35em').text('Downtown Macon');
            // The year ticker, at the top of the map's half
            const tick = svg.append('g').attr('class', 'gm-ticker').attr('transform', wide ? `translate(${(W * 0.55).toFixed(1)},${(H * 0.2).toFixed(1)})` : `translate(16,${(dy + 34).toFixed(1)})`);
            const year = tick.append('text').attr('class', 'gm-year').text(FIRST);
            tick.append('text').attr('class', 'gm-year-cap').attr('y', 16).text('new & expanding plants');

            return (p, stage) => {
                tick.style('opacity', stage(0.28, 0.36));
                down.style('opacity', stage(0.2, 0.3));
                year.text(Math.min(LAST, FIRST + Math.floor(stage(T0, T1) * (LAST - FIRST + 0.999))));
                pins.each(function (d) {
                    const t = stage(at[d.i], at[d.i] + 0.07), rise = d3.easeBackOut.overshoot(1.6)(t), s = size(d.p);
                    const pin = d3.select(this).style('opacity', t > 0 ? 1 : 0);
                    pin.select('.gm-factory').attr('transform', `translate(${d.x.toFixed(1)},${(d.y + 6).toFixed(1)}) scale(${s.toFixed(2)},${(s * Math.max(0.001, rise)).toFixed(3)})`);
                    pin.select('.gm-badge').attr('transform', `translate(${(d.x + 12 * s).toFixed(1)},${(d.y + 6 - 19 * s).toFixed(1)}) scale(${Math.max(0.001, stage(at[d.i] + 0.04, at[d.i] + 0.08)).toFixed(3)})`);
                    pin.select('.gm-leader').style('opacity', stage(at[d.i], at[d.i] + 0.03));
                    if (listRows[d.i]) { const o = stage(at[d.i] + 0.02, at[d.i] + 0.07); listRows[d.i].style.opacity = o; listRows[d.i].style.transform = `translateY(${((1 - o) * 8).toFixed(1)}px)`; }
                });
                const b = stage(0.1, 0.4);
                barFills.forEach((f, i) => { f.style.transform = `scaleX(${d3.easeCubicOut(clampBar(b - i * 0.08)).toFixed(3)})`; });
            };
        },
    });
    const clampBar = v => Math.max(0, Math.min(1, v / 0.92));
})();
