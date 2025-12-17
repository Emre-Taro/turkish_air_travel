import { test, expect, Page, BrowserContext, Locator } from '@playwright/test';

const WEB_URL = 'https://turkish.jp/';

function originPath(u: string | URL) {
  const url = typeof u === 'string' ? new URL(u) : u;
  return url.origin + url.pathname;
}

async function findLinkByText(container: Locator, name: RegExp): Promise<Locator | null> {
  const links = container.locator('a[href]').filter({ hasText: name });
  return (await links.count()) > 0 ? links.first() : null;
}

function departureSelect(page: Page) {
  // Find a <select> that contains typical departure options (羽田/成田/関空/名古屋/福岡...).
  const optionNeedle = page.locator('option', { hasText: /羽田\s*発/ });
  return page.locator('select').filter({ has: optionNeedle }).first();
}

function fullCourseSearchButton(page: Page) {
  // The UI usually shows something like: "全コースかんたん検索 ▶"
  return page.getByRole('button', { name: /全コース[\s\S]*かんたん検索/ }).first();
}

async function dismissSpcOverlay(page: Page) {
  // The quick-search overlay (`#spc__overlay`) can intercept clicks on underlying links.
  const overlay = page.locator('#spc__overlay.is-visible');
  if ((await overlay.count()) > 0) {
    await overlay.click({ force: true }).catch(() => {});
    await expect(overlay).not.toBeVisible({ timeout: 5_000 }).catch(() => {});
  }
}

async function clickAndAssertFollowsHref(
  page: Page,
  context: BrowserContext,
  link: Locator,
  label: string,
  opts?: { returnBack?: boolean }
) {
  const returnBack = opts?.returnBack ?? true;

  await expect(link, `[${label}] link not visible`).toBeVisible({ timeout: 15_000 });
  await link.scrollIntoViewIfNeeded();

  const href = await link.getAttribute('href');
  expect(href, `[${label}] href is missing`).toBeTruthy();

  const expectedUrl = new URL(href!, page.url()).toString();
  const expectedOriginPath = originPath(expectedUrl);

  const popupP = context.waitForEvent('page', { timeout: 5_000 }).catch(() => null);
  const sameTabP = page
    .waitForURL((u) => originPath(u) === expectedOriginPath, { timeout: 15_000 })
    .then(() => true)
    .catch(() => false);

  // Close overlays that may intercept pointer events, then click.
  await dismissSpcOverlay(page);
  try {
    await link.click({ noWaitAfter: true });
  } catch {
    await dismissSpcOverlay(page);
    await link.click({ noWaitAfter: true, force: true });
  }

  const popup = await popupP;
  const sameTabMoved = await sameTabP;

  if (popup) {
    await popup.waitForLoadState('domcontentloaded');
    await expect.poll(
      async () => originPath(popup.url()),
      { timeout: 15_000 }
    ).toBe(expectedOriginPath);
    await popup.close();
    return;
  }

  if (sameTabMoved) {
    await expect.poll(async () => originPath(page.url()), { timeout: 15_000 }).toBe(expectedOriginPath);
    await expect(page, `[${label}] looks like a 404 page`).not.toHaveTitle(/404|not found/i);
    if (returnBack) {
      await page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => {});
    }
    return;
  }

  throw new Error(`[${label}] clicked but did not navigate (expected=${expectedOriginPath})`);
}

test.describe('WEB: 出発地(羽田/成田/関西…)選択 → 検索 → 各ボタン(詳しく見る)の遷移チェック', () => {
  const departures = [
    { name: '羽田発', selectLabel: '羽田 発' },
    { name: '成田発', selectLabel: '成田 発' },
    // UI上は「関西発」だが、selectの文言は「関空 発」になっていることが多い
    { name: '関西発', selectLabel: '関空 発' },
    { name: '名古屋発', selectLabel: '名古屋 発' },
    { name: '福岡発', selectLabel: '福岡 発' },
  ] as const;

  test('出発地を選択すると、かんたん検索UI上の表示（◯◯発）が追従する', async ({ page }) => {
    for (const d of departures) {
      await test.step(d.name, async () => {
        await page.goto(WEB_URL, { waitUntil: 'domcontentloaded' });

        const sel = departureSelect(page);
        await expect(sel, '[出発地select] が見つからない').toBeVisible({ timeout: 15_000 });
        await sel.selectOption({ label: d.selectLabel });

        // The site uses a custom dropdown UI that should show e.g. "羽田発/成田発...".
        const spc = page.locator('#spc');
        await expect(spc, '[#spc] かんたん検索UIが見つからない').toHaveCount(1, { timeout: 15_000 });
        await expect(spc, `[${d.name}] がUI上に反映されない`).toContainText(d.name, { timeout: 15_000 });
      });
    }
  });

  test('結果ページの「▶ 詳しく見る」リンクが href 通りに遷移する（先頭3件）', async ({ page, context }) => {
    await page.goto(WEB_URL, { waitUntil: 'domcontentloaded' });

    const sel = departureSelect(page);
    await expect(sel, '[出発地select] が見つからない').toBeVisible({ timeout: 15_000 });
    await sel.selectOption({ label: '羽田 発' });

    // If the overlay is open, close it before clicking content links.
    await dismissSpcOverlay(page);

    const detailLinks = page.locator('a[href]:not([href^="#"])').filter({ hasText: /詳しく見る/ });
    const count = await detailLinks.count();
    expect(count, '「詳しく見る」リンクが見つからない').toBeGreaterThan(0);

    const max = Math.min(3, count);
    for (let i = 0; i < max; i++) {
      const link = detailLinks.nth(i);
      await clickAndAssertFollowsHref(page, context, link, `詳しく見る #${i + 1}`, { returnBack: true });
    }
  });
});


