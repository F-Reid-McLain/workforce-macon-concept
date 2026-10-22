/* Marketing stills of the homepage's 3D commuting story.
   Opens index.html?render=1 (js/commute-intro.js: one fixed moment of the day, no page
   chrome or labels) at the size asked for and saves a PNG.

   Needs Node, puppeteer-core and Google Chrome, and the site served locally, e.g.
   `python3 -m http.server 8765` from the repo root. Then:

     node tools/render-story.js --out rush-hour.png --hour 7.9 --w 1200 --h 660
     node tools/render-story.js --out midday.png --hour 12.5 --cam=-83.66,32.78,8.9,58,-12

   Options: --hour (5-21; 7.5-8.5 is the morning rush), --cam lon,lat,zoom,pitch,bearing,
   --w/--h (CSS px; the PNG is 2x), --trail (comet length, default 4), --dot (dot size, default 1),
   --labels (county names on), --base (default http://localhost:8765/). */
const puppeteer = require('puppeteer-core');

const args = {};
process.argv.slice(2).forEach((a, i, all) => {
    if (!a.startsWith('--')) return;
    const [k, v] = a.slice(2).split('=');
    args[k] = v !== undefined ? v : (all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : '1');
});
const W = +args.w || 1200, H = +args.h || 660;
const base = args.base || 'http://localhost:8765/';
const q = new URLSearchParams({ render: '1', hour: args.hour || '8.3' });
['cam', 'trail', 'dot'].forEach(k => { if (args[k]) q.set(k, args[k]); });
if (args.labels) q.set('labels', '1');

(async () => {
    const browser = await puppeteer.launch({
        executablePath: args.chrome || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        headless: 'new', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    });
    const page = await browser.newPage();
    await page.setViewport({ width: W, height: H, deviceScaleFactor: 2 });
    await page.goto(base + 'index.html?' + q, { waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, 4000));   // data, fonts and a few frames
    await page.screenshot({ path: args.out || 'story.png' });
    await browser.close();
    console.log('saved', args.out || 'story.png', `${W * 2}x${H * 2}`);
})();
