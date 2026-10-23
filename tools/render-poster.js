/* The phone opening's stand-in picture: Macon-Bibb's block as the 3D story first shows it,
   so phones see Macon the moment the page opens, while the 3D library starts up (a few
   seconds on a phone). js/commute-intro.js's opening camera puts the block at a fixed size
   and spot relative to the middle of the stage, so the picture is cropped to the block and
   placed by its offset from that middle (css/commute-intro.css, .ci-poster).

   Rerun after changing the story's opening camera, the county shapes or the night lighting,
   then paste the CSS it prints over the .ci-poster numbers. Needs Node, puppeteer-core,
   pngjs, Google Chrome, and the site served locally (python3 -m http.server 8765):

     node tools/render-poster.js            (writes assets/story/opening-phone.png)

   Options: --w/--h, the window in CSS px (default 390 x 844; the stage is that less the
   header's room), --base (default http://localhost:8765/). */
const puppeteer = require('puppeteer-core');
const { PNG } = require('pngjs');
const fs = require('fs');

const args = {};
process.argv.slice(2).forEach((a, i, all) => {
    if (!a.startsWith('--')) return;
    const [k, v] = a.slice(2).split('=');
    args[k] = v !== undefined ? v : all[i + 1];
});
const W = +args.w || 390, H = +args.h || 844, SCALE = 2;
const base = args.base || 'http://localhost:8765/';
const OUT = 'assets/story/opening-phone.png';

(async () => {
    const browser = await puppeteer.launch({
        executablePath: args.chrome || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        headless: 'new', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    });
    const page = await browser.newPage();
    await page.setViewport({ width: W, height: H, deviceScaleFactor: SCALE, isMobile: true });
    // The opening moment (5 AM), no labels, on a transparent page
    await page.goto(base + 'index.html?render=1&hour=5', { waitUntil: 'networkidle0' });
    await page.addStyleTag({ content: 'html, body, .ci, .ci-stage { background: transparent !important; } .ci-shadow, .ci-poster { display: none !important; }' });
    await new Promise(r => setTimeout(r, 4000));   // data and a few frames
    // the stage's own box (the page keeps room for the header even with it hidden)
    const stage = await page.evaluate(() => { const r = document.querySelector('.ci-stage').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    const shot = PNG.sync.read(Buffer.from(await page.screenshot({ omitBackground: true })));
    await browser.close();

    // Crop to the block (anything not fully transparent), with a little room
    let x0 = shot.width, y0 = shot.height, x1 = 0, y1 = 0;
    for (let y = 0; y < shot.height; y++) for (let x = 0; x < shot.width; x++) {
        if (shot.data[(y * shot.width + x) * 4 + 3] > 8) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    }
    const pad = 4 * SCALE;
    x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(shot.width - 1, x1 + pad); y1 = Math.min(shot.height - 1, y1 + pad);
    const out = new PNG({ width: x1 - x0 + 1, height: y1 - y0 + 1 });
    PNG.bitblt(shot, out, x0, y0, out.width, out.height, 0, 0);
    fs.mkdirSync('assets/story', { recursive: true });
    fs.writeFileSync(OUT, PNG.sync.write(out, { deflateLevel: 9 }));

    // Where it sits: its center's offset from the stage's middle, in CSS px
    const cx = (x0 + x1 + 1) / 2 / SCALE - stage.x, cy = (y0 + y1 + 1) / 2 / SCALE - stage.y;
    console.log(`saved ${OUT} (${out.width}x${out.height}, ${Math.round(fs.statSync(OUT).size / 1024)} KB)`);
    console.log(`.ci-poster { --poster-w: ${(out.width / SCALE).toFixed(1)}px; --poster-dx: ${cx.toFixed(1)}px; --poster-dy: ${cy.toFixed(1)}px; }`);
})();
