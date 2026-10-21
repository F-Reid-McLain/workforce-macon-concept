/* ===== TAKEAWAY TOOLS — homepage =====
   Two small lookups people can come back to, each deliberately limited to
   the essentials (the depth is what custom research is for):

   - Job lookup: average pay, jobs in Macon-Bibb, openings a year and outlook
     for any of ~800 occupations (data/Occupation Snapshot.csv, OES-based).
   - What Macon is strong in: industries where Macon-Bibb is far more
     specialized than the U.S. (location quotient), plus a search across
     all industries (data/Industry Snapshot.csv, QCEW-based). */
(function () {
    'use strict';
    if (!window.d3) return;
    const num = v => +String(v == null ? '' : v).replace(/[$,%]/g, '') || 0;
    const fmt = n => Math.round(n).toLocaleString();
    const money = n => '$' + (Math.round(n / 100) * 100).toLocaleString();
    const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const timesUS = lq => (lq >= 10 ? Math.round(lq) : lq.toFixed(1)) + '×';

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

    // ----- Job lookup -----
    d3.csv('data/Occupation Snapshot.csv').then(rows => {
        const jobs = rows.filter(r => r['SOC'] && r['SOC'].slice(-2) !== '00' && num(r['Empl']) > 0 && num(r['Mean Ann Wages2']) > 0)
            .map(r => ({ name: r['Occupation'].trim(), empl: num(r['Empl']), wage: num(r['Mean Ann Wages2']),
                         openings: num(r['Total Demand']), growth: num(r['Ann % Growth']) }))
            .sort((a, b) => b.empl - a.empl);
        const out = document.getElementById('job-result');
        const outlook = g => g > 0.005 ? ['Growing', 'is-up'] : g < -0.005 ? ['Shrinking', 'is-down'] : ['Steady', ''];
        function show(j) {
            const [word, cls] = outlook(j.growth);
            out.innerHTML = `<h4>${esc(j.name)}</h4>
                <dl class="tool-stats">
                    <div><dt>Average pay</dt><dd>${money(j.wage)}</dd></div>
                    <div><dt>Jobs in Macon-Bibb</dt><dd>${fmt(j.empl)}</dd></div>
                    <div><dt>Openings a year</dt><dd>~${fmt(j.openings)}</dd></div>
                    <div><dt>Outlook</dt><dd class="${cls}">${word}</dd></div>
                </dl>`;
        }
        const count = document.getElementById('job-count');
        if (count) count.textContent = jobs.length.toLocaleString();
        typeahead({ input: document.getElementById('job-q'), list: document.getElementById('job-list'), items: jobs, label: j => j.name, onPick: show });
        show(jobs[0]);   // start on the most common job
    }).catch(err => console.error('Job lookup failed to load', err));

    // ----- What Macon is strong in -----
    d3.csv('data/Industry Snapshot.csv').then(rows => {
        const inds = rows.filter(r => (r['NAICS'] || '').trim() && num(r['Empl']) > 0)
            .map(r => ({ name: r['Industry'].trim(), empl: num(r['Empl']), wage: num(r['Avg Ann Wages']), lq: num(r['LQ']), change: num(r['Empl Change']) }))
            .sort((a, b) => b.empl - a.empl);
        // Specialties: much more concentrated here than nationally, and big enough to matter
        const top = inds.filter(i => i.lq >= 2 && i.empl >= 200).sort((a, b) => b.lq - a.lq).slice(0, 8);
        document.getElementById('strength-list').innerHTML = top.map(i => `<li>
            <b>${timesUS(i.lq)}</b><span>${esc(i.name)}</span><small>${fmt(i.empl)} jobs · ${money(i.wage)} avg</small></li>`).join('');
        const out = document.getElementById('strength-result');
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
        typeahead({ input: document.getElementById('strength-q'), list: document.getElementById('strength-qlist'), items: inds, label: i => i.name, onPick: show });
    }).catch(err => console.error('Industry lookup failed to load', err));

    // ----- Replay / present the commuting story -----
    document.querySelectorAll('[data-commute]').forEach(b => b.addEventListener('click', () => {
        if (window.WFCommute) window.WFCommute[b.dataset.commute]();
    }));
})();
