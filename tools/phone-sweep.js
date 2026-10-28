/* Phone sweep: the whole homepage on six iPhone screen shapes (Safari's real visible area, and a
   320px-wide page as Display Zoom gives), every swipe scene and the states inside them (a county
   picked, each Jobs ranking, search, a job's card, a plant tapped, the menu, the page's foot). Each
   screen is flagged for anything past the screen's edge, text under the top buttons, and a tool that
   doesn't fit, and all of them land on one contact sheet per phone to look over.

     node tools/phone-sweep.js                     (all six phones, Reduce Motion on, as calm scenes)
     node tools/phone-sweep.js 15 motion           (one phone, full motion)
     BASE=http://localhost:8765/ OUT=/tmp/sweep node tools/phone-sweep.js

   Needs Playwright's WebKit (see tools/README.md) and Python with Pillow for the sheets. */
const { webkit } = require('playwright'); const fs = require('fs');
const BASE = process.env.BASE || 'http://localhost:8765/', OUT = process.env.OUT || 'phone-sweep'; const wait = ms => new Promise(r => setTimeout(r, ms)); const { execSync } = require('child_process');
const phones = [['zoomed-15', 320, 600], ['SE-2nd-3rd', 375, 553], ['13-mini', 375, 629], ['15', 393, 659], ['16-Pro', 402, 674], ['15-Pro-Max', 430, 739]];
const only = process.argv[2] && process.argv[2] !== 'all' ? process.argv[2] : null, mode = process.argv[3] || 'calm';
const FLAGS = () => {
  const W = innerWidth, H = innerHeight, out = new Set();
  const nav = document.querySelector('.nav-toggle').getBoundingClientRect(), find = document.querySelector('#industries .ind-find');
  const btns = [nav, find && find.offsetParent ? find.getBoundingClientRect() : null].filter(Boolean);
  const seen = e => { for (let n = e; n && n !== document.documentElement; n = n.parentElement) { const c = getComputedStyle(n); if (c.visibility === 'hidden' || c.display === 'none' || +c.opacity < 0.05) return false; } return true; };
  const label = e => `${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}${e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/)[0] : ''} "${(e.textContent || e.value || '').trim().replace(/\s+/g, ' ').slice(0, 28)}"`;
  for (const e of document.body.querySelectorAll('*')) {
    if (e.closest('svg') || e.closest('.scene-bar, .main-nav:not(.is-open), #debug-scroll')) continue;
    { const top = document.elementFromPoint(Math.min(W - 1, Math.max(0, (Math.max(0, e.getBoundingClientRect().left) + Math.min(W, e.getBoundingClientRect().right)) / 2)), Math.min(H - 1, Math.max(0, e.getBoundingClientRect().top + 2))); }
    const r = e.getBoundingClientRect(); if (r.width < 1 || r.height < 1 || r.bottom <= 0 || r.top >= H) continue;
    const text = [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
    if (!text && !/^(BUTTON|INPUT|SELECT|IMG)$/.test(e.tagName)) continue;
    if (!seen(e)) continue;
    // (hidden inside a box that scrolls or clips: not on screen)
    let inside = true; for (let n = e.parentElement; n && n !== document.body; n = n.parentElement) { const c = getComputedStyle(n); if (/(hidden|auto|scroll|clip)/.test(c.overflowY + c.overflowX)) { const pr = n.getBoundingClientRect(); if (r.bottom <= pr.top + 1 || r.top >= pr.bottom - 1) { inside = false; break; } } }
    if (!inside) continue;
    if (r.right > W + 1 || r.left < -1) {
      let scroller = false; for (let n = e.parentElement; n && n !== document.body; n = n.parentElement) { const c = getComputedStyle(n); if (/(hidden|auto|scroll|clip)/.test(c.overflowX)) { const pr = n.getBoundingClientRect(); if (pr.right <= W + 1 && pr.left >= -1) { scroller = true; break; } } }
      if (!scroller) out.add('OFF PAGE ' + label(e));
    }
    if (text && !e.closest('.nav-toggle, .ind-find, .main-nav')) for (const b of btns) if (r.left < b.right - 2 && r.right > b.left + 2 && r.top < b.bottom - 2 && r.bottom > b.top + 2) out.add('UNDER A TOP BUTTON ' + label(e));
  }
  document.querySelectorAll('.stop').forEach(s => { const r = s.getBoundingClientRect(); if (r.top > -2 && r.top < 2 && s.scrollHeight > s.clientHeight + 1) out.add(`#${s.id} scrolls ${s.scrollHeight - s.clientHeight}px inside`); });
  return [...out];
};
(async () => { fs.mkdirSync(OUT, { recursive: true }); const b = await webkit.launch();
  for (const [name, w, h] of phones.filter(p => !only || p[0] === only)) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, reducedMotion: mode === 'calm' ? 'reduce' : 'no-preference',
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await p.goto(BASE + 'index.html'); await wait(5000);
    const files = []; const T = mode === 'calm' ? 1600 : 4200;
    const snap = async tag => { const f = `${OUT}/${name}-${mode}-${String(files.length).padStart(2, '0')}-${tag}.png`; await p.screenshot({ path: f }); files.push(f);
      const fl = await p.evaluate(FLAGS); console.log(`${(name + ' ' + mode).padEnd(16)} ${String(files.length - 1).padStart(2)} ${tag.padEnd(16)} ${fl.length ? fl.join(' | ') : 'ok'}`); };
    const scenes = await p.evaluate(() => WFScenes.list());
    const go = async (i, ms = T) => { await p.evaluate(i => WFScenes.go(i), i); await wait(ms); };
    for (let i = 0; i < scenes.length; i++) {
      const s = scenes[i], id = s.id.split(' ')[0].replace(/^(ci-step|stop-intro).*/, '$1');
      await go(i, s.kind === 'map' ? T + 4500 : T);
      const tag = s.kind === 'story' ? 'story' + i : s.kind === 'words' || s.kind === 'map' ? `${s.kind}${i}` : s.kind === 'close' ? 'close' : s.id.split(' ')[0];
      await snap(tag);
      if (s.id === 'section-region') { const sel = p.locator('.ci-step--map select').first(); await sel.selectOption(await sel.evaluate(x => x.options[3].value)); await wait(1200); await snap('county-picked'); }
      if (s.kind === 'map' && i > 8) { const hit = await p.$('.gm-pin .gm-hit'); if (hit) { const bb = await hit.boundingBox(); if (bb) { await p.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2); await wait(900); await snap('plant-tapped'); await p.touchscreen.tap(w / 2, 90); await wait(500); } } }
      if (s.id === 'jobs') {
        await p.evaluate(() => document.querySelector('#job-sorts [data-view=paid]').click()); await wait(900); await snap('jobs-best-paid');
        await p.evaluate(() => document.querySelector('#job-sorts [data-view=growing]').click()); await wait(900); await snap('jobs-growing');
        await p.evaluate(() => document.querySelector('#job-sorts [data-view=common]').click()); await wait(600);
        await p.tap('#jobs input[type=search]'); await p.keyboard.type('nur', { delay: 30 }); await wait(500); await snap('jobs-search');
        await p.tap('#jobs .tool-matches li'); await wait(1000); await snap('jobs-popup');
        await p.tap('#jobs .pop-close'); await wait(500);
      }
      if (s.id === 'custom-research') { await p.evaluate(() => scrollTo(0, document.documentElement.scrollHeight)); await wait(1200); await snap('page-bottom'); }
    }
    await go(4); await p.tap('.nav-toggle'); await wait(700); await snap('menu-open'); await p.tap('.nav-toggle'); await wait(400);
    if (errs.length) console.log('  errors', [...new Set(errs)].slice(0, 5));
    const list = files.join(' ');
    execSync(`python3 -c "
from PIL import Image
fs='${list}'.split(); ims=[Image.open(f) for f in fs]; W,H=ims[0].size; cols=7; rows=(len(ims)+cols-1)//cols
c=Image.new('RGB',(cols*(W+24),rows*(H+24)),'white')
for k,i in enumerate(ims): c.paste(i,((k%cols)*(W+24),(k//cols)*(H+24)))
c.resize((c.width*3//10,c.height*3//10)).save('${OUT}/sheet-${name}-${mode}.png')"`);
    await ctx.close(); }
  await b.close(); })();
