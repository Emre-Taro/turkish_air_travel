import { test, expect, Page, Locator, BrowserContext } from '@playwright/test';

// LPのボタンが正常に動くかをテスト
// - ボタン系、webpageに飛ぶ系
//     - パンフレットはこちらとか、詳細はこちらとかは押す
//     - ツアーを見る系のボタン（websiteの方に飛ぶやつ）

const LP_URL = 'https://turkish.co.jp/special/';

function originPath(u: string | URL) {
  const url = typeof u === 'string' ? new URL(u) : u;
  return url.origin + url.pathname;
}

async function clickAndAssertGoesToHref(
  page: Page,
  context: BrowserContext,
  link: Locator,
  label: string,
  opts?: { returnTo?: string }
) {
  await expect(link, `[${label}] リンクが見つからない`).toBeVisible({ timeout: 15_000 });
  await link.scrollIntoViewIfNeeded();

  const href = await link.getAttribute('href');
  expect(href, `[${label}] hrefが無い`).not.toBeNull();
  const expectedUrl = new URL(href!, page.url()).toString();
  const expectedOriginPath = originPath(expectedUrl);

  // クリック後に「新規タブ」or「同一タブ遷移」をレースで待つ
  const popupP = Promise.race([
    page.waitForEvent('popup', { timeout: 15_000 }),
    context.waitForEvent('page', { timeout: 15_000 }),
  ]).catch(() => null);
  const sameTabP = page
    .waitForURL((u) => originPath(u) === expectedOriginPath, { timeout: 15_000 })
    .then(() => true)
    .catch(() => false);

  await link.click({ noWaitAfter: true });

  const popup = await popupP;
  const sameTabMoved = await sameTabP;

  if (popup) {
    await popup.waitForLoadState('domcontentloaded');
    await expect.poll(async () => originPath(popup.url()), { timeout: 15_000 }).toBe(expectedOriginPath);
    await popup.close();
    return;
  }

  if (sameTabMoved) {
    await expect.poll(async () => originPath(page.url()), { timeout: 15_000 }).toBe(expectedOriginPath);
    if (opts?.returnTo) {
      await page.goto(opts.returnTo, { waitUntil: 'domcontentloaded' });
    } else {
      await page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => {});
    }
    return;
  }

  // どちらでもない＝クリックはされたが遷移が起きていない
  throw new Error(`[${label}] クリックしたが遷移しませんでした (href=${expectedUrl})`);
}

test('ランキングカード内の「パンフレット」「詳細」がhref通りに遷移する', async ({ page, context }) => {
  test.setTimeout(120_000);
  await page.goto(LP_URL, { waitUntil: 'domcontentloaded' });

  async function getVisibleCards() {
    // ランキングがカルーセル実装の場合、DOM上は複数あるが「表示中」のカードだけがクリック可能。
    const visibleCards = page
      .locator('.ranking-tour-item')
      .filter({ has: page.locator('a.ranking-button.pamphlet:visible') })
      .filter({ has: page.locator('a.ranking-button.detail:visible') });

    await expect(visibleCards.first(), 'ランキングカードが表示されない').toBeVisible({ timeout: 20_000 });
    return visibleCards;
  }

  const count = await (await getVisibleCards()).count();
  expect(count, 'ランキングカードが1件以上ある想定').toBeGreaterThan(0);

  // すべて検証すると時間がかかり、外部要因で不安定になりやすいので先頭のみスモークする
  const max = Math.min(3, count);
  for (let i = 0; i < max; i++) {
    // 各クリックで別ページへ遷移し得るため、毎回LPへ戻してからカードを取り直す
    await page.goto(LP_URL, { waitUntil: 'domcontentloaded' });
    const card = (await getVisibleCards()).nth(i);
    await card.scrollIntoViewIfNeeded();

    const pamphlet = card.locator('a.ranking-button.pamphlet');
    const detail = card.locator('a.ranking-button.detail');

    await clickAndAssertGoesToHref(page, context, pamphlet, `カード${i + 1} / パンフレット`, { returnTo: LP_URL });

    // 詳細も同様に、必ずLPへ戻す
    await page.goto(LP_URL, { waitUntil: 'domcontentloaded' });
    const card2 = (await getVisibleCards()).nth(i);
    await card2.scrollIntoViewIfNeeded();
    const detail2 = card2.locator('a.ranking-button.detail');
    await clickAndAssertGoesToHref(page, context, detail2, `カード${i + 1} / 詳細`, { returnTo: LP_URL });
  }
});
