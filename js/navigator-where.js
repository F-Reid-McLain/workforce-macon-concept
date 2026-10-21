/* ===== WHERE MAP — Workforce Navigator corner =====
   The corner has two views: Where (this file) and Ecosystem (the organization network,
   js/navigator-minimap.js). Where draws the region's counties (data/counties.geojson,
   the same shapes as the homepage's commuting story) with a dot on each town where
   the programs now showing are taught, sized by how many. Hover a town for its count;
   click one to show only its programs (click again to clear). Hovering a program
   lights its towns. Online programs and towns outside the region are counted below
   the map. Training defaults to Where; the support and employer doors to Ecosystem.
   Listens for the finder's 'finder:update' and 'finder:hover' (js/navigator-finder.js). */
(function () {
    'use strict';
    if (document.body.classList.contains('embed-mode') || !window.d3) return;
    const svgEl = document.getElementById('where-svg');
    if (!svgEl) return;
    const svg = d3.select(svgEl), wrap = document.getElementById('wheremap');
    const tip = wrap.querySelector('.where-tip'), extra = document.getElementById('where-extra');
    const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

    // Town centers (longitude, latitude); inside: on the map, the rest are counted below it
    const PLACES = {
        'macon':         { label: 'Macon',          at: [-83.6324, 32.8407], inside: true },
        'warner-robins': { label: 'Warner Robins',  at: [-83.6242, 32.6130], inside: true },
        'milledgeville': { label: 'Milledgeville',  at: [-83.2321, 33.0801], inside: true },
        'cochran':       { label: 'Cochran',        at: [-83.3546, 32.3868], inside: true },
        'eatonton':      { label: 'Eatonton',       at: [-83.3885, 33.3268], inside: true },
        'fort-valley':   { label: 'Fort Valley',    at: [-83.8874, 32.5538], inside: true },
        'dublin':        { label: 'Dublin',         at: [-82.9038, 32.5404], inside: true },
        'eastman':       { label: 'Eastman',        at: [-83.1774, 32.1977], inside: true },
        'hawkinsville':  { label: 'Hawkinsville',   at: [-83.4721, 32.2838], inside: true },
        'augusta':       { label: 'Augusta' }, 'atlanta': { label: 'Atlanta' }, 'brunswick': { label: 'Brunswick' },
        'albany':        { label: 'Albany' },  'fayetteville': { label: 'Fayetteville' },
    };
    window.WFWhere = { label: id => (PLACES[id] || { label: id }).label };

    // ----- The two corner views -----
    const tabs = Array.from(document.querySelectorAll('.corner-tabs [data-pane]'));
    const panes = Array.from(document.querySelectorAll('.corner-pane'));
    let pane = null, chosen = null;   // chosen: what the visitor picked, until they change doors
    function show(which) {
        pane = which;
        tabs.forEach(t => { const on = t.dataset.pane === which; t.classList.toggle('is-on', on); t.setAttribute('aria-selected', String(on)); });
        panes.forEach(p => p.classList.toggle('is-on', p.dataset.pane === which));
        document.querySelector('.finder-side').dataset.pane = which;
    }
    tabs.forEach(t => t.addEventListener('click', () => { chosen = t.dataset.pane; show(chosen); }));

    // ----- Drawing -----
    let counties = null, proj = null, W = 0, H = 0, lastDoor = null, lastPrograms = [], place = '';
    const gCounty = svg.append('g').attr('class', 'where-counties');
    const gDots = svg.append('g').attr('class', 'where-dots');
    const lat0 = 32.7 * Math.PI / 180;
    const flat = ([lon, lat]) => [lon * Math.cos(lat0), lat];
    const flatGeom = g => ({ type: g.type, coordinates: g.type === 'Polygon' ? g.coordinates.map(r => r.map(flat)) : g.coordinates.map(p => p.map(r => r.map(flat))) });

    function layout() {
        if (!counties) return;
        W = Math.max(200, wrap.clientWidth); H = Math.max(160, wrap.clientHeight);
        svg.attr('viewBox', `0 0 ${W} ${H}`).attr('width', W).attr('height', H);
        // Frame the counties and every town on the map, including the few just beyond them
        const frame = { type: 'FeatureCollection', features: counties.features.map(f => ({ type: 'Feature', geometry: flatGeom(f.geometry) }))
            .concat(Object.values(PLACES).filter(p => p.inside).map(p => ({ type: 'Feature', geometry: { type: 'Point', coordinates: flat(p.at) } }))) };
        proj = d3.geoIdentity().reflectY(true).fitExtent([[10, 12], [W - 10, H - 12]], frame);
        const path = d3.geoPath(proj);
        gCounty.selectAll('path').data(counties.features).join('path')
            .attr('d', f => path(flatGeom(f.geometry)))
            .attr('class', f => (f.properties.name === 'Bibb' ? 'is-bibb' : null));
        draw();
    }

    let drawCounts = {};
    function draw() {
        if (!proj) return;
        const counts = drawCounts = {};
        let online = 0;
        lastPrograms.forEach(p => {
            (p.places || []).forEach(id => { counts[id] = (counts[id] || 0) + 1; });
            if (p.online) online++;
        });
        const inside = Object.entries(PLACES).filter(([, p]) => p.inside);
        const max = d3.max(inside, ([id]) => counts[id] || 0) || 1;
        const r = d3.scaleSqrt().domain([0, max]).range([0, Math.min(W, H) * 0.06]);
        const dots = gDots.selectAll('g.where-dot').data(inside, d => d[0]).join(enter => {
            const g = enter.append('g').attr('class', 'where-dot').attr('tabindex', 0).attr('role', 'button');
            g.append('circle').attr('class', 'where-dot__ring');
            g.append('circle').attr('class', 'where-dot__fill');
            g.append('text').attr('class', 'where-dot__label');
            g.on('mouseenter focus', (e, d) => tipFor(d)).on('mouseleave blur', () => tip.classList.remove('is-on'))
             .on('click', (e, d) => { if (drawCounts[d[0]] || place === d[0]) window.WFFinder && WFFinder.setPlace(d[0]); })
             .on('keydown', (e, d) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); window.WFFinder && WFFinder.setPlace(d[0]); } });
            return g;
        });
        dots.attr('transform', d => `translate(${proj(flat(d[1].at)).join(',')})`)
            .classed('is-empty', d => !counts[d[0]]).classed('is-picked', d => place === d[0])
            .attr('aria-label', d => `${d[1].label}: ${counts[d[0]] || 0} program${counts[d[0]] === 1 ? '' : 's'}`);
        dots.select('.where-dot__fill').transition().duration(450).attr('r', d => counts[d[0]] ? Math.max(3, r(counts[d[0]])) : 2);
        dots.select('.where-dot__ring').attr('r', d => counts[d[0]] ? Math.max(3, r(counts[d[0]])) + 4 : 0);
        dots.select('.where-dot__label').text(d => counts[d[0]] ? d[1].label : '')
            .attr('dy', d => -(counts[d[0]] ? Math.max(3, r(counts[d[0]])) : 2) - 4);
        // Online, and towns beyond the map
        const outside = Object.entries(PLACES).filter(([id, p]) => !p.inside && counts[id]).map(([id, p]) => `${p.label} ${counts[id]}`);
        const bits = [];
        if (online) bits.push(`<b>${online}</b> also online`);
        if (outside.length) bits.push(`Outside the region: ${esc(outside.join(' · '))}`);
        if (place) bits.push(`<button type="button" class="where-clear">Show all towns</button>`);
        extra.innerHTML = bits.join(' · ');
    }
    function tipFor(d) {
        const n = drawCounts[d[0]] || 0;
        tip.innerHTML = `<b>${esc(d[1].label)}</b><span>${n ? `${n} of these program${n === 1 ? '' : 's'}${place === d[0] ? ' · click to show all towns' : ' · click to show only these'}` : 'None of these programs'}</span>`;
        const [x, y] = proj(flat(d[1].at)), s = svgEl.getBoundingClientRect().width / W || 1;
        tip.style.transform = `translate(${Math.round(x * s)}px, ${Math.round(y * s - 12)}px) translate(-50%, -100%)`;
        tip.classList.add('is-on');
    }
    extra.addEventListener('click', e => { if (e.target.closest('.where-clear') && window.WFFinder) WFFinder.setPlace(place); });

    // ----- From the finder -----
    document.addEventListener('finder:update', e => {
        const { door, programs, place: picked } = e.detail;
        lastPrograms = programs; place = picked;
        if (door !== lastDoor) { chosen = null; lastDoor = door; }
        show(chosen || (door === 'training' ? 'where' : 'eco'));
        document.querySelector('.corner-tabs [data-pane="where"]').disabled = door !== 'training';
        draw();
    });
    document.addEventListener('finder:hover', e => {
        const lit = new Set(e.detail.places);
        gDots.selectAll('g.where-dot').classed('is-hot', d => lit.has(d[0]));
    });

    d3.json('data/counties.geojson').then(g => { counties = g; layout(); }).catch(err => console.error('Where map failed to load', err));
    let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(layout, 200); });
    show('where');
})();
