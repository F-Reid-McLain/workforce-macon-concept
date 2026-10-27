/* ===== INDUSTRIES TITLE SLIDE: WHAT'S GROWING — homepage =====
   "Manufacturing is growing three times as fast as health care": Macon-Bibb and its
   interstates draw in (js/intro-map.js), a year ticker counts from 2015 to 2026, and
   each new, expanding or modernizing manufacturer rises at its site as the ticker
   passes its first year. Plants announced but not yet open come last, drawn as dashed
   outlines. Hover a plant (or tap it, or Tab to it) for its milestones: what it makes,
   what it invested, and the jobs. Pins are loosely placed: nudged apart where they
   crowd (several sit in Sofkee Industrial Park) and kept inside Macon-Bibb.
   Headline, dek and bars are computed from data/Industry Snapshot.csv (NAICS 31-33
   manufacturing vs. 62 health care, five-year change); the plants are
   content/manufacturers.json. */
(function () {
    'use strict';
    const svgEl = document.getElementById('grow-intro-map');
    if (!svgEl || !window.WFIntroMap) return;
    const slide = svgEl.closest('.stop-intro');
    const barsEl = document.getElementById('grow-bars');
    const FIRST = 2015, LAST = 2026;
    const CENTER = [-83.645, 32.752];   // the plants sit in south and east Macon-Bibb, so the map centers on them
    const T0 = 0.34, T1 = 0.86;   // the ticker's run, in build progress
    const touch = !!(window.matchMedia && matchMedia('(hover: none)').matches);
    const toNum = v => +String(v || '').replace(/[$,]/g, '') || 0;
    const nw = s => s.replace(/Macon-Bibb/g, '<span class="nw">Macon-Bibb</span>');
    const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
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
    // The words and bars go in first, so the map is fitted to the finished layout
    const side = Promise.all([numbers, plants]).then(([{ mfg, avg }, list]) => {
        const announced = d3.sum(list.filter(p => p.status === 'coming' && p.year === LAST), p => p.jobs);
        const premium = Math.round((mfg.pay - avg) / 1000) * 1000;
        const dek = document.getElementById('grow-dek');
        if (dek) dek.innerHTML = nw(`Macon-Bibb added <b>${(Math.round(mfg.change / 100) * 100).toLocaleString()}</b> factory jobs in the past five years, paying <b>$${(Math.round(mfg.pay / 100) * 100).toLocaleString()}</b> on average` +
            (premium > 0 ? `, about $${premium.toLocaleString()} above the $${(Math.round(avg / 100) * 100).toLocaleString()} average across all industries here` : '') + '.' +
            (announced ? ` And <b>${announced.toLocaleString()}</b> more were announced in ${LAST} alone.` : ''));
        buildBars();
    });
    side.catch(err => console.error('Growth slide numbers failed to load', err));

    // ----- The bars (beside the headline) -----
    let barFills = [];
    function buildBars() {
        const max = d3.max(rows, r => r.pct) || 1;
        barsEl.innerHTML = '<p class="grow-bars__title">Job growth, past five years</p>' + rows.map(r =>
            `<div class="grow-bar ${r.cls}"><span class="grow-bar__label">${r.label}</span><span class="grow-bar__track"><span class="grow-bar__fill" style="width:${(r.pct / max * 100).toFixed(1)}%"></span></span><span class="grow-bar__val">+${(r.pct * 100).toFixed(1)}%</span></div>`).join('');
        barFills = [...barsEl.querySelectorAll('.grow-bar__fill')];
    }

    // ----- The plant card (hover, tap or focus a plant) -----
    const tip = document.createElement('div');
    tip.className = 'gm-tip';
    tip.setAttribute('role', 'status');
    slide.appendChild(tip);
    let tipFor = null, shownAt = 0;
    function showTip(d) {
        const p = d.p;
        if (tipFor !== d) shownAt = performance.now();
        tipFor = d;
        tip.innerHTML = `<b class="gm-tip__name">${esc(p.name)}</b>` +
            `<span class="gm-tip__makes">${esc(p.makes)}${p.status === 'coming' ? ' · <i>coming</i>' : ''}</span>` +
            `<ul>${p.events.map(e => `<li><b>${e.year}</b> ${esc(e.text)}</li>`).join('')}</ul>`;
        // Above the plant, kept inside the slide (the map may start partway down it, on phones)
        // (measured from the boxes: Safari gives an <svg> no offsetTop)
        const W = slide.clientWidth, w = tip.offsetWidth || 260, oy = svgEl.getBoundingClientRect().top - slide.getBoundingClientRect().top;
        const x = Math.max(8 + w / 2, Math.min(W - 8 - w / 2, d.x)), y = d.y - 22 * d.s;
        tip.style.left = x + 'px'; tip.style.top = (oy + y) + 'px';
        tip.classList.toggle('is-below', y - tip.offsetHeight < 70);   // too close to the top: open below instead
        if (tip.classList.contains('is-below')) tip.style.top = (oy + d.y + 14) + 'px';
        tip.classList.add('is-on');
    }
    function hideTip() { tipFor = null; tip.classList.remove('is-on'); }
    // A tap elsewhere closes it on phones
    document.addEventListener('pointerdown', e => { if (tipFor && !e.target.closest('.gm-pin')) hideTip(); }, { passive: true });

    // When each plant rises: as the ticker passes its first year; plants sharing a year follow one another
    const appearAt = list => list.map((p, i) => {
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
            if (wide) return { x: W * 0.75, y: H * 0.5, w: 0.62, h: 0.82, at: CENTER };
            // Phones: the map has its own screen, after the text (css/chapters.css)
            return { x: W / 2, y: H * 0.56, w: 0.88, h: 0.6 };   // the whole county, centered
        },
        layer({ svg, proj, W, H, wide, bounds, bibbRings, DOWNTOWN }) {
            hideTip();
            const list = plantList;
            const at = appearAt(list);
            const size = p => (wide ? 1.2 : 1.05) + 0.5 * Math.sqrt(p.jobs / 600);
            // Pins start on their real spots and are nudged apart where they'd overlap
            const nodes = list.map((p, i) => { const [x, y] = proj([p.lon, p.lat]); return { i, p, sx: x, sy: y, x, y: y - 6, r: 15 * size(p), s: size(p), shown: false }; });
            // and kept inside Macon-Bibb: one that drifts out is drawn back toward the county's middle
            const inside = (x, y) => bibbRings.some(r => d3.polygonContains(r, [x, y]));
            // the whole icon, with a little room, not just its middle
            const inBibb = (x, y) => [[0, 0], [-18, -20], [18, -20], [-18, 12], [18, 12]].every(([ox, oy]) => inside(x + ox, y + oy));
            const mid = [(bounds.x0 + bounds.x1) / 2, (bounds.y0 + bounds.y1) / 2];
            const sim = d3.forceSimulation(nodes)
                .force('x', d3.forceX(d => d.sx).strength(0.35)).force('y', d3.forceY(d => d.sy - 6).strength(0.35))
                .force('collide', d3.forceCollide(d => d.r).iterations(3)).stop();
            for (let k = 0; k < 220; k++) {
                sim.tick();
                nodes.forEach(d => { if (!inBibb(d.x, d.y + 2)) { d.x += (mid[0] - d.x) * 0.12; d.y += (mid[1] - d.y) * 0.12; } });
            }

            const g = svg.append('g').attr('class', 'gm-plants');
            const pins = g.selectAll('g.gm-pin').data(nodes).join('g')
                .attr('class', d => 'gm-pin' + (d.p.status === 'coming' ? ' is-coming' : ''))
                .attr('tabindex', 0).attr('role', 'button')
                .attr('aria-label', d => `${d.p.name}, ${d.p.makes}: ${d.p.events.map(e => e.year + ', ' + e.text).join('; ')}`)
                .on('mouseenter focus', (e, d) => { if (d.shown) showTip(d); })
                .on('mouseleave blur', hideTip)
                // A tap fires a hover and then a click: only a later click on the same plant closes it
                .on('click', (e, d) => { if (!d.shown) return; if (tipFor === d && performance.now() - shownAt > 400) hideTip(); else showTip(d); });
            // A generous invisible target, so small plants are easy to hover and tap
            pins.append('circle').attr('class', 'gm-hit').attr('cx', d => d.x).attr('cy', d => d.y - 4).attr('r', d => Math.max(22, 14 * d.s));
            const bodies = pins.append('g').attr('class', 'gm-factory');
            bodies.append('rect').attr('class', 'gm-chimney').attr('x', 6.5).attr('y', -22).attr('width', 3.6).attr('height', 9);
            bodies.append('path').attr('class', 'gm-roof').attr('d', ROOF);
            bodies.append('rect').attr('class', 'gm-wall').attr('x', -12).attr('y', -9).attr('width', 24).attr('height', 9);
            bodies.append('rect').attr('class', 'gm-win').attr('x', -9).attr('y', -6.5).attr('width', 4).attr('height', 3.5);
            bodies.append('rect').attr('class', 'gm-win').attr('x', -2).attr('y', -6.5).attr('width', 4).attr('height', 3.5);

            // Downtown, for bearings
            const [dx, dy] = proj(DOWNTOWN);
            const down = svg.insert('g', '.gm-plants').attr('class', 'gm-downtown').attr('transform', `translate(${dx.toFixed(1)},${dy.toFixed(1)})`);
            down.append('circle').attr('r', 3.5);
            // labeled above the dot, clear of the plants south of downtown
            down.append('text').attr('y', -10).attr('text-anchor', 'middle').text('Downtown Macon');
            // The year ticker, at the top of the map's half, with how to explore underneath
            const tick = svg.append('g').attr('class', 'gm-ticker').attr('transform', wide ? `translate(${(W * 0.55).toFixed(1)},${(H * 0.2).toFixed(1)})` : `translate(18,${(H * 0.12 + 20).toFixed(1)})`);
            const year = tick.append('text').attr('class', 'gm-year').text(FIRST);
            tick.append('text').attr('class', 'gm-year-cap').attr('y', 16).text('new & expanding plants');
            const hint = tick.append('text').attr('class', 'gm-hint').attr('y', 32).text(touch ? 'Tap a plant for its story' : 'Hover a plant for its story');

            return (p, stage) => {
                tick.style('opacity', stage(0.28, 0.36));
                hint.style('opacity', stage(0.9, 1));
                down.style('opacity', stage(0.2, 0.3));
                year.text(Math.min(LAST, FIRST + Math.floor(stage(T0, T1) * (LAST - FIRST + 0.999))));
                pins.each(function (d) {
                    const t = stage(at[d.i], at[d.i] + 0.07), rise = d3.easeBackOut.overshoot(1.6)(t), s = d.s;
                    d.shown = t > 0.6;
                    const pin = d3.select(this).style('opacity', t > 0 ? 1 : 0).classed('is-live', d.shown);
                    pin.select('.gm-factory').attr('transform', `translate(${d.x.toFixed(1)},${(d.y + 6).toFixed(1)}) scale(${s.toFixed(2)},${(s * Math.max(0.001, rise)).toFixed(3)})`);
                    if (!d.shown && tipFor === d) hideTip();   // the drawing pulled back
                });
                // the bars sit with the headline: on phones that's the screen before the map, so they show in full
                const b = wide ? stage(0.1, 0.4) : 1;
                barFills.forEach((f, i) => { f.style.transform = `scaleX(${d3.easeCubicOut(clampBar(b - i * 0.08)).toFixed(3)})`; });
            };
        },
    });
    const clampBar = v => Math.max(0, Math.min(1, v / 0.92));
})();
