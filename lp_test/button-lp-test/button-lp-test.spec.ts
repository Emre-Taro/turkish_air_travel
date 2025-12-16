
// LPのボタンが正常に動くかをテスト
// - ボタン系、webpageに飛ぶ系
//     - パンフレットはこちらとか、詳細はこちらとかは押す
//     - ツアーを見る系のボタン（websiteの方に飛ぶやつ）

// => これは正直保留でもよい（全然実装自体はできそう）

type LinkCase = {
  name: string;
  locator: (page: Page) => Locator;
  newTab?: boolean;
};

const cases: LinkCase[] = [
  {
    name: 'パンフレットはこちら',
    locator: (page) =>
      page.locator('a', { hasText: 'パンフレットはこちら' }),
    newTab: true,
  },
  {
    name: '詳細はこちら',
    locator: (page) =>
      page.locator('a', { hasText: '詳細はこちら' }),
    newTab: false,
  },
];
import { test, expect, Page, Locator, BrowserContext } from '@playwright/test';

const LP_URL = 'https://turkish.co.jp/special/';

async function clickAndAssertGoesToHref(
  page: Page,
  context: BrowserContext,
  link: Locator,
  label: string
) {
  await expect(link, `[${label}] リンクが見つからない`).toBeVisible();
  await link.scrollIntoViewIfNeeded();

  const href = await link.getAttribute('href');
  expect(href, `[${label}] hrefが無い`).not.toBeNull();
  const expected = new URL(href!, page.url()).toString();

  // クリック後に「新規タブ」or「同一タブ遷移」をレースで待つ
  const popupP = context.waitForEvent('page', { timeout: 4000 }).catch(() => null);
  const sameTabP = page.waitForURL(expected, { timeout: 4000 }).then(() => true).catch(() => false);

  await link.click({ noWaitAfter: true });

  const popup = await popupP;
  const sameTabMoved = await sameTabP;

  if (popup) {
    await popup.waitForLoadState('domcontentloaded');
    await expect(popup, `[${label}] 遷移先URLがhrefと一致しない`).toHaveURL(expected);
    await popup.close();
    return;
  }

  if (sameTabMoved) {
    await expect(page, `[${label}] 遷移先URLがhrefと一致しない`).toHaveURL(expected);
    await page.goBack();
    return;
  }

  // どちらでもない＝クリックはされたが遷移が起きていない
  throw new Error(`[${label}] クリックしたが遷移しませんでした (href=${expected})`);
}

test('ランキングカード内の「パンフレット」「詳細」がhref通りに遷移する', async ({ page, context }) => {
  await page.goto(LP_URL);

  const cards = page.locator('.ranking-tour-item');
  const count = await cards.count();
  expect(count, 'ランキングカードが1件以上ある想定').toBeGreaterThan(0);

  for (let i = 0; i < count; i++) {
    const card = cards.nth(i);

    const pamphlet = card.locator('a.ranking-button.pamphlet');
    const detail = card.locator('a.ranking-button.detail');

    await clickAndAssertGoesToHref(page, context, pamphlet, `カード${i + 1} / パンフレット`);
    await clickAndAssertGoesToHref(page, context, detail, `カード${i + 1} / 詳細`);
  }
});
