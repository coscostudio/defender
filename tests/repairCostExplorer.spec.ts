import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.setContent(`
    <!doctype html>
    <html>
      <head><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
      <body>
        <main>
          <div class="section_diagram">
            <div class="component-diagram" data-vsc-repair-diagram></div>
          </div>
          <section id="vsc-form"></section>
        </main>
      </body>
    </html>
  `);
  await page.addScriptTag({ url: 'http://127.0.0.1:3000/index.js' });
  await expect(page.locator('[data-vsc-repair-mounted="true"]')).toBeVisible();
  await expect(page.locator('[data-ddx]')).toHaveAttribute('data-figure', 'ready');
});

test('loads the figure with every repair system tagged', async ({ page }) => {
  const systems = await page
    .locator('[data-ddx-stage] [data-sys]')
    .evaluateAll((items) => [...new Set(items.map((item) => item.getAttribute('data-sys')))].sort());
  expect(systems).toEqual(
    [
      'ac-compressor',
      'alternator',
      'drive-axle',
      'engine',
      'fuel-pump',
      'navigation',
      'power-steering',
      'suspension',
      'transmission',
      'water-pump',
    ].sort()
  );
  await expect(page.locator('[data-ddx-select]')).toHaveCount(10);
});

test('a repair chosen in the list lights its parts in the drawing', async ({ page }) => {
  await page.locator('[data-ddx-select="transmission"]').click();

  await expect(page.locator('[data-ddx-name]')).toHaveText('Transmission');
  await expect(page.locator('[data-ddx-cost]')).toHaveText('$3,289');
  await expect(page.locator('[data-readout]')).toHaveText('transmission · $3,289');

  const lit = await page.locator('[data-ddx-stage] [data-on]').evaluateAll((items) => [
    ...new Set(items.map((item) => item.getAttribute('data-sys'))),
  ]);
  expect(lit).toEqual(['transmission']);
});

test('pointing at a part in the drawing selects its repair', async ({ page }) => {
  await page.locator('[data-sys="fuel-pump"] .iso-solid').first().dispatchEvent('click');

  await expect(page.locator('[data-ddx-name]')).toHaveText('Fuel pump');
  await expect(page.locator('[data-ddx-select="fuel-pump"]')).toHaveAttribute('aria-pressed', 'true');
});

test('arrow keys step through repairs, instantly under reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const stage = page.locator('[data-ddx-stage]');

  await stage.focus();
  await stage.press('ArrowRight');
  await expect(page.locator('[data-ddx-name]')).toHaveText('Transmission');
  await expect(page.locator('[data-ddx-cost]')).toHaveText('$3,289');

  await stage.press('ArrowLeft');
  await stage.press('ArrowLeft');
  await expect(page.locator('[data-ddx-name]')).toHaveText('Alternator');
});

test('the screen behind the windshield can be picked by pointing at it', async ({ page }) => {
  // The body shell (haze, glass, lines) lets the pointer through to the parts inside it.
  const point = await page.evaluate(() => {
    for (const item of document.querySelectorAll('[data-sys="navigation"]')) {
      const r = item.getBoundingClientRect();
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      if (item.contains(document.elementFromPoint(x, y))) return { x, y };
    }
    return null;
  });
  if (!point) throw new Error('no navigation part can be pointed at');
  await page.mouse.click(point.x, point.y);

  await expect(page.locator('[data-ddx-name]')).toHaveText('GPS / navigation');
});

test('fits a phone viewport without horizontal page overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });

  const pageWidth = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));

  expect(pageWidth.scroll).toBe(pageWidth.client);
  await expect(page.locator('[data-ddx-name]')).toBeVisible();
});

test('the arrows in the hint step through repairs on click', async ({ page }) => {
  await page.locator('[data-ddx-step="1"]').click();
  await expect(page.locator('[data-ddx-name]')).toHaveText('Transmission');
  await page.locator('[data-ddx-step="-1"]').click();
  await page.locator('[data-ddx-step="-1"]').click();
  await expect(page.locator('[data-ddx-name]')).toHaveText('Alternator');
});

test('in one column the pricing note comes after the price list', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const [listBottom, captionTop] = await page.evaluate(() => [
    document.querySelector('.diagram_list')!.getBoundingClientRect().bottom,
    document.querySelector('[data-ddx-caption]')!.getBoundingClientRect().top,
  ]);
  expect(captionTop).toBeGreaterThan(listBottom);
});

test('reads repairs from the Webflow markup and keeps it in place', async ({ page }) => {
  // A trimmed copy of the native Webflow structure, with an edited price.
  await page.setContent(`<!doctype html><html><body>
    <div class="component-diagram" data-vsc-repair-diagram>
      <div class="diagram_layout" data-ddx>
        <div class="diagram_figure" data-ddx-figure></div>
        <div class="diagram_panel">
          <h2 class="diagram_title">See what one breakdown can cost.</h2>
          <div class="diagram_cost" data-ddx-cost>$6,278</div><div class="diagram_name" data-ddx-name>Engine</div>
          <div class="diagram_bars"><div class="diagram_bar is-active" data-ddx-bar="engine"></div><div class="diagram_bar" data-ddx-bar="alternator"></div></div>
          <p class="diagram_detail" data-ddx-detail>Block</p>
          <ul class="diagram_list">
            <li><div class="diagram_row is-active" data-ddx-select="engine"><div class="diagram_row-name">Engine</div><div class="diagram_row-meter"><div class="diagram_row-fill is-active"></div></div><div class="diagram_row-cost">$6,278</div><p class="diagram_row-detail">Block</p></div></li>
            <li><div class="diagram_row" data-ddx-select="alternator"><div class="diagram_row-name">Alternator (edited)</div><div class="diagram_row-meter"><div class="diagram_row-fill"></div></div><div class="diagram_row-cost">$1,500</div><p class="diagram_row-detail">Edited in Webflow.</p></div></li>
          </ul>
        </div>
        <p class="diagram_caption" data-ddx-caption>Pricing note</p>
      </div>
    </div></body></html>`);
  await page.locator('h2').evaluate((h) => h.setAttribute('data-original', ''));
  await page.addScriptTag({ url: 'http://127.0.0.1:3000/index.js' });

  await expect(page.locator('[data-ddx]')).toHaveAttribute('data-figure', 'ready');
  await expect(page.locator('h2[data-original]')).toHaveCount(1);
  await page.locator('[data-ddx-select="alternator"]').click();
  await expect(page.locator('[data-ddx-cost]')).toHaveText('$1,500');
  await expect(page.locator('[data-ddx-name]')).toHaveText('Alternator (edited)');
  await expect(page.locator('[data-ddx-detail]')).toHaveText('Edited in Webflow.');
  await expect(page.locator('[data-ddx-select="alternator"]')).toHaveClass(/is-active/);
  await expect(page.locator('[data-ddx-bar="alternator"]')).toHaveClass(/is-active/);
});
