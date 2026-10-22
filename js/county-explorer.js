/* ===== YOUR COUNTY — inside the story's finished regional map =====
   Pick any of Macon-Bibb's 16 neighbors (from the list in the map's card, or by
   clicking it on the map) to see how the two trade workers: jobs in Macon-Bibb held
   by the county's residents, Macon-Bibb residents working there, what those jobs
   pay, and the county's overall commuting balance.

   Talks to the map (js/commute-intro.js) through two events on document:
     county:pick      {fips}  the map was clicked
     county:selected  {fips, in, out} or null   tells the map what to draw (outline, arcs)
   Links: #counties/<county> (via js/lookups.js); #counties lands on the map.
   Also fills the closing slide's regional population ("one labor market").

   Data: data/commute-region.json (LODES 2023 flows and pay bands), data/Net
   Commuting LODES.csv, data/Population By County.csv (ACS 2024). */
(function () {
    'use strict';
    if (!window.d3 || !window.WFTools) return;
    const T = window.WFTools;
    const BIBB = '13021';
    const fmt = n => Math.round(n).toLocaleString();
    const pct = v => Math.round(100 * v) + '%';
    const PAY = ['#a0aabe', '#f2c46b', '#2dd4bf'];   // ≤ $1,250 · $1,251–3,333 · > $3,333 a month (as in the story)
    const f5 = v => String(v).padStart(5, '0');

    const select = document.getElementById('cty-select'), card = document.getElementById('cty-card');
    if (!select || !card) return;
    const storyCard = card.closest('.ci-card');   // with a county open, its intro and notes fold away (css/chapters.css)

    Promise.all([
        d3.json('data/commute-region.json'),
        d3.csv('data/Net Commuting LODES.csv'),
        d3.csv('data/Population By County.csv'),
    ]).then(([region, netRows, popRows]) => {
        const net = new Map(netRows.map(r => [f5(r.FIPS), { net: +r.NetCommuting, jobs: +r.JobsLocatedHere, res: +r.EmployedResidents }]));
        const pop = new Map(popRows.map(r => [f5(r.FIPS), +String(r.Population).replace(/,/g, '')]));
        const flow = (a, b) => region.flows.find(f => f.from === a && f.to === b) || { jobs: 0, pay: [0, 0, 0] };
        const neighbors = region.counties.filter(c => c.fips !== BIBB).map(c => {
            const i = flow(c.fips, BIBB), o = flow(BIBB, c.fips), n = net.get(c.fips) || {};
            const short = c.name.replace(/ County$/, '');
            return { fips: c.fips, name: short + ' County', short, in: i.jobs, pay: i.pay, out: o.jobs,
                     net: n.net, jobs: n.jobs, res: n.res, pop: pop.get(c.fips), share: n.res ? i.jobs / n.res : 0 };
        });

        // ----- The closing slide: everyone who lives in the region -----
        const regionEl = document.getElementById('region-pop');
        if (regionEl && pop.size) regionEl.textContent = (Math.round(d3.sum([...pop.values()]) / 1000) * 1000).toLocaleString();

        // ----- The list (alphabetical, so people can find their own county) -----
        select.innerHTML = '<option value="">Pick a county</option>' + neighbors.slice().sort((a, b) => a.name.localeCompare(b.name))
            .map(c => `<option value="${c.fips}">${c.name}: ${fmt(c.in)} jobs in Macon-Bibb</option>`).join('');

        // ----- The card -----
        card.innerHTML = `<h3></h3>
            <div class="cty-big"><b data-k="in" data-f="int"></b><span>jobs in <span class="nw">Macon-Bibb</span> are held by <span data-name></span> residents</span></div>
            <div class="cty-share"><div class="cty-share__bar"><i></i></div><span data-share></span></div>
            <dl class="tool-stats">
                <div><dt>Reverse commute</dt><dd data-k="out" data-f="int"></dd></div>
                <div><dt>Net, all places</dt><dd data-net></dd></div>
                <div><dt>Residents</dt><dd data-k="pop" data-f="int"></dd></div>
                <div><dt>Jobs located there</dt><dd data-k="jobs" data-f="int"></dd></div>
            </dl>
            <div class="cty-pay">
                <p class="cty-pay__title">What those jobs pay a month</p>
                <div class="cty-pay__bar">${PAY.map((c, k) => `<i style="background:${c}" data-band="${k}"></i>`).join('')}</div>
                <div class="cty-pay__key">${region.payBands.map((b, k) => `<span><i style="background:${PAY[k]}"></i>${b.replace('/month', '')}</span>`).join('')}</div>
                <p class="cty-pay__vs" data-vs></p>
            </div>
            <button type="button" class="cty-back">← Back to the whole picture</button>`;
        const last = {}, localOver = region.localPay[2] / d3.sum(region.localPay);
        let current = null;
        // The map may still be loading when a link selects a county, so the choice is also kept on window.WFCounty
        const tell = c => {
            const detail = c ? { fips: c.fips, in: c.in, out: c.out } : null;
            window.WFCounty = { current: detail };
            document.dispatchEvent(new CustomEvent('county:selected', { detail }));
        };
        function choose(c, byUser) {
            if (!c) { clear(); return; }
            const changed = current !== c;
            current = c;
            select.value = c.fips;
            card.hidden = false;
            if (storyCard) storyCard.classList.add('has-county');
            card.querySelector('h3').textContent = c.name;
            card.querySelector('[data-name]').textContent = c.name;
            ['in', 'out', 'pop', 'jobs'].forEach(k => { card.querySelector(`[data-k="${k}"]`).dataset.num = c[k] || 0; });
            T.countIn(card, last);
            card.querySelector('.cty-share__bar i').style.width = pct(c.share);
            card.querySelector('[data-share]').innerHTML = `<b>${pct(c.share)}</b> of all jobs held by ${c.name} residents`;
            const n = card.querySelector('[data-net]');
            n.textContent = c.net < 0 ? `${fmt(-c.net)} more workers than jobs` : `${fmt(c.net)} more jobs than workers`;
            n.className = c.net < 0 ? 'is-down' : 'is-up';
            const tot = d3.sum(c.pay) || 1;
            card.querySelectorAll('.cty-pay__bar i').forEach((el, k) => { el.style.width = (100 * c.pay[k] / tot).toFixed(1) + '%'; });
            const over = c.pay[2] / tot;
            card.querySelector('[data-vs]').innerHTML = `<b>${pct(over)}</b> pay more than $3,333 a month, compared with ${pct(localOver)} of jobs held by people who live and work in Macon-Bibb.`;
            if (changed) T.swap(card);
            tell(c);
            if (byUser) T.remember('counties', c.name);
        }
        function clear() {
            current = null;
            select.value = '';
            card.hidden = true;
            if (storyCard) storyCard.classList.remove('has-county');
            tell(null);
            if (location.hash.startsWith('#counties/')) history.replaceState(null, '', '#counties');
        }
        select.addEventListener('change', () => choose(neighbors.find(c => c.fips === select.value), true));
        card.querySelector('.cty-back').addEventListener('click', () => { clear(); select.focus(); });
        document.addEventListener('county:pick', e => {
            const c = neighbors.find(c => c.fips === e.detail.fips);
            if (c && c !== current) choose(c, true); else if (c) clear();   // clicking the selected county again lets it go
        });
        T.register('counties', s => { const c = neighbors.find(c => T.slug(c.name) === s || T.slug(c.short) === s); if (c) choose(c); return !!c; });
    }).catch(err => console.error('County explorer failed to load', err));
})();
