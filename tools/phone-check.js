/* Phone check: the homepage as an iPhone sees it, in WebKit (Safari's engine) with Safari's
   real visible area (the address bar and toolbar leave 393 x 659 on an iPhone 15, not the
   full 852-px screen). Catches what shrinking a desktop browser misses: Safari-only bugs,
   layouts that overflow the shorter real screen, and taps that are too small for a thumb.

   Needs Node, Playwright with its WebKit, and the site served locally:
     npm install playwright && npx playwright install webkit
     python3 -m http.server 8765

     node tools/phone-check.js                 (iPhone 15; screens saved to phone-check/)
     node tools/phone-check.js --device "iPhone SE"   (any Playwright device name)
     node tools/phone-check.js --base http://localhost:8765/ --out /tmp/shots

   It reports page errors, sideways scrolling, tap targets under 40 px, whether each stop's
   key interaction works (pick a county, search a job, open a sector, tap a plant), and saves
   a screenshot of every stop. phone-check/ is for looking at, not for committing. */
const { webkit, devices } = require('playwright');
const fs = require('fs');

const args = {};
process.argv.slice(2).forEach((a, i, all) => { if (a.startsWith('--')) args[a.slice(2)] = all[i + 1]; });
const device = args.device || 'iPhone 15', base = args.base || 'http://localhost:8765/', out = args.out || 'phone-check';

(async () => {
    if (!devices[device]) { console.error(`Unknown device "${device}". Try "iPhone 15", "iPhone SE" or "iPhone 15 Pro Max".`); process.exit(1); }
    fs.mkdirSync(out, { recursive: true });
    const browser = await webkit.launch();
    const page = await (await browser.newContext({ ...devices[device] })).newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    const wait = ms => page.waitForTimeout(ms);
    const ok = (label, pass, detail = '') => console.log(`${pass ? '  ok  ' : ' FAIL '} ${label}${detail ? ': ' + detail : ''}`);
    const scrollToY = async (y, ms = 1500) => { await page.evaluate(y => window.scrollTo(0, y), y); await wait(ms); };
    const yOf = expr => page.evaluate(expr);
    // A point that really lands on the element (the first one's middle may be a hole, as in a donut slice)
    const pointOn = sel => page.evaluate(sel => {
        const el = document.querySelector(sel); if (!el) return null;
        const r = el.getBoundingClientRect();
        for (let i = 1; i < 12; i++) for (let j = 1; j < 12; j++) {
            const x = r.left + r.width * i / 12, y = r.top + r.height * j / 12, hit = document.elementFromPoint(x, y);
            if (hit === el || el.contains(hit)) return { x, y };
        }
        return null;
    }, sel);
    const tapOn = async sel => { const p = await pointOn(sel); if (!p) return false; await page.touchscreen.tap(p.x, p.y); await wait(900); return true; };

    await page.goto(base + 'index.html');
    await wait(3500);
    const vp = await page.evaluate(() => `${innerWidth} x ${innerHeight}`);
    console.log(`${device} in WebKit, visible area ${vp}\n`);

    // ----- Layout -----
    ok('no sideways scrolling', !(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)));
    const small = await page.evaluate(() => {
        const seen = new Map();
        document.querySelectorAll('a[href], button, select, input, summary, [role=button]').forEach(el => {
            if (el.closest('[hidden], .main-footer') || el.offsetParent === null) return;
            const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || +cs.opacity === 0) return;
            const r = el.getBoundingClientRect(); if (!r.width || r.height >= 38 && r.width >= 38) return;
            // a ::after hit area counts (the small "i" buttons)
            const after = getComputedStyle(el, '::after'); if (after.content !== 'none' && after.position === 'absolute' && parseFloat(after.top) < -8) return;
            const k = `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''} "${(el.textContent || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 24)}" ${Math.round(r.width)}x${Math.round(r.height)}`;
            if (!/^a /.test(k) || r.height < 24) seen.set(k, true);   // links in running text are fine
        });
        return [...seen.keys()];
    });
    ok('tap targets at least 38 px', !small.length, small.join(' · '));

    // ----- Each stop -----
    const shot = name => page.screenshot({ path: `${out}/${name}.png` });
    await shot('1-opening');
    await scrollToY(1500); await shot('2-story');

    // The finished map: its card in view, and picking a county fills it
    await scrollToY(await yOf(() => { const m = document.getElementById('section-region'); return m.getBoundingClientRect().top + scrollY + m.offsetHeight - innerHeight; }), 3000);
    const card = await page.evaluate(() => { const r = document.querySelector('.ci-step--map .ci-card').getBoundingClientRect(); return { top: r.top, bottom: r.bottom, vh: innerHeight }; });
    ok('map card fits on screen', card.bottom <= card.vh && card.top >= 60, `${Math.round(card.top)}..${Math.round(card.bottom)} of ${card.vh}`);
    const select = page.locator('.ci-step--map select').first();
    await select.selectOption(await select.evaluate(s => s.options[3].value)); await wait(900);
    ok('picking a county shows its numbers', /jobs/i.test(await page.locator('.ci-step--map .ci-card').innerText()));
    await shot('3-map');

    // Title slides: each one's words, then its map, which draws itself
    const slides = await page.evaluate(() => [...document.querySelectorAll('.stop-intro--map')].map(s => {
        // the stops js/chapters.js settles on: the slide's first screen (its words) and its last (its map)
        const top = s.getBoundingClientRect().top + scrollY;
        return { words: Math.round(top), map: Math.round(top + s.offsetHeight - innerHeight) };
    }));
    for (const [i, s] of slides.entries()) {
        await scrollToY(s.words);
        ok(`title ${i + 1}'s words show`, await page.evaluate(() => { const h = [...document.querySelectorAll('.stop-intro--map .chapter-finding')].find(f => { const r = f.getBoundingClientRect(); return r.top > 0 && r.bottom < innerHeight; }); return !!h && +getComputedStyle(h.closest('.stop-intro__inner')).opacity > 0.9; }));
        await shot(`${4 + i * 3}-slide${i + 1}-words`);
        await scrollToY(s.map, 6500);
        ok(`title map ${i + 1} draws itself`, await page.evaluate(i => document.querySelectorAll('.intro-map')[i].classList.contains('is-drawn'), i));
        if (i === 1 && await tapOn('.gm-pin .gm-hit')) {
            const tip = await page.evaluate(() => { const t = document.querySelector('.gm-tip'), r = t.getBoundingClientRect(); return { on: t.classList.contains('is-on'), top: r.top, bottom: r.bottom, vh: innerHeight }; });
            ok('tapping a plant opens its card on screen', tip.on && tip.top >= 60 && tip.bottom <= tip.vh, `${Math.round(tip.top)}..${Math.round(tip.bottom)}`);
        }
        await shot(`${5 + i * 3}-slide${i + 1}-map`);
        // the tool after it
        const tool = i === 0 ? '#jobs' : '#industries';
        await scrollToY(await yOf(new Function(`const e = document.querySelector('${tool}'); return e.getBoundingClientRect().top + scrollY - 64;`)));
        if (i === 0) {
            await tapOn('#jobs input[type=search]'); await page.keyboard.type('nurse', { delay: 40 }); await wait(600);
            await tapOn('#jobs .tool-matches li');
            ok('job search opens a job', await page.evaluate(() => { const r = document.querySelector('#jobs .tool-result'); return !!r && !r.hidden; }));
            ok('keyboard closes after the pick', await page.evaluate(() => document.activeElement.tagName !== 'INPUT'));
        } else {
            await page.evaluate(() => { const e = document.getElementById('donut'); window.scrollTo(0, e.getBoundingClientRect().top + scrollY - 80); }); await wait(1500);
            await tapOn('.d-ring path'); await wait(600);
            ok('tapping a donut slice opens its sector', await page.evaluate(() => document.getElementById('donut').classList.contains('is-drilled')));
        }
        await shot(`${6 + i * 3}-${tool.slice(1)}`);
    }
    await scrollToY(await yOf(() => { const c = document.querySelector('.stop-intro--close'); return c.getBoundingClientRect().top + scrollY + c.offsetHeight / 2 - innerHeight / 2; }));
    await shot('10-close');

    ok('no page errors', !errors.length, errors.slice(0, 3).join(' | '));
    console.log(`\nScreens saved to ${out}/`);
    await browser.close();
})();
