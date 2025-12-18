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

function originPathWithQuery(u: string | URL) {
  const url = typeof u === 'string' ? new URL(u) : u;
  return url.origin + url.pathname + url.search;
}

function originPathWithImportantQuery(u: string | URL, importantParams: string[] = []) {
  const url = typeof u === 'string' ? new URL(u) : u;
  const params = new URLSearchParams(url.search);
  const important = new URLSearchParams();
  for (const key of importantParams) {
    if (params.has(key)) {
      important.set(key, params.get(key)!);
    }
  }
  const queryString = important.toString();
  return url.origin + url.pathname + (queryString ? `?${queryString}` : '');
}

async function clickAndAssertGoesToHref(
  page: Page,
  context: BrowserContext,
  link: Locator,
  label: string,
  opts?: { returnTo?: string; includeQuery?: boolean; importantParams?: string[] }
) {
  await expect(link, `[${label}] リンクが見つからない`).toBeVisible({ timeout: 15_000 });
  await link.scrollIntoViewIfNeeded();

  const href = await link.getAttribute('href');
  expect(href, `[${label}] hrefが無い`).not.toBeNull();
  const expectedUrl = new URL(href!, page.url()).toString();
  const includeQuery = opts?.includeQuery ?? false;
  const importantParams = opts?.importantParams ?? [];
  
  // 重要なクエリパラメータが指定されている場合はそれを使用、そうでなければ通常の比較
  let expectedPath: string;
  if (importantParams.length > 0) {
    expectedPath = originPathWithImportantQuery(expectedUrl, importantParams);
  } else {
    expectedPath = includeQuery ? originPathWithQuery(expectedUrl) : originPath(expectedUrl);
  }

  // クリック後に「新規タブ」or「同一タブ遷移」をレースで待つ
  const popupP = Promise.race([
    page.waitForEvent('popup', { timeout: 15_000 }),
    context.waitForEvent('page', { timeout: 15_000 }),
  ]).catch(() => null);
  const sameTabP = page
    .waitForURL((u) => {
      let actualPath: string;
      if (importantParams.length > 0) {
        actualPath = originPathWithImportantQuery(u, importantParams);
      } else {
        actualPath = includeQuery ? originPathWithQuery(u) : originPath(u);
      }
      return actualPath === expectedPath;
    }, { timeout: 20_000 })
    .then(() => true)
    .catch(() => false);

  await link.click({ noWaitAfter: true });

  const popup = await popupP;
  const sameTabMoved = await sameTabP;

  if (popup) {
    await popup.waitForLoadState('domcontentloaded');
    // ポーリングでURLが安定するまで待つ
    await expect.poll(
      async () => {
        let actualPath: string;
        if (importantParams.length > 0) {
          actualPath = originPathWithImportantQuery(popup.url(), importantParams);
        } else {
          actualPath = includeQuery ? originPathWithQuery(popup.url()) : originPath(popup.url());
        }
        return actualPath;
      },
      { timeout: 15_000, intervals: [100, 200, 300] }
    ).toBe(expectedPath);
    await popup.close();
    return;
  }

  if (sameTabMoved) {
    // ポーリングでURLが安定するまで待つ
    await expect.poll(
      async () => {
        let actualPath: string;
        if (importantParams.length > 0) {
          actualPath = originPathWithImportantQuery(page.url(), importantParams);
        } else {
          actualPath = includeQuery ? originPathWithQuery(page.url()) : originPath(page.url());
        }
        return actualPath;
      },
      { timeout: 10_000, intervals: [100, 200, 300] }
    ).toBe(expectedPath);
    if (opts?.returnTo) {
      await page.goto(opts.returnTo, { waitUntil: 'domcontentloaded' });
    } else {
      await page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => {});
    }
    return;
  }

  // どちらでもない＝クリックはされたが遷移が起きていない
  // デバッグ情報を追加
  const currentUrl = page.url();
  let currentPath: string;
  if (importantParams.length > 0) {
    currentPath = originPathWithImportantQuery(currentUrl, importantParams);
  } else {
    currentPath = includeQuery ? originPathWithQuery(currentUrl) : originPath(currentUrl);
  }
  throw new Error(
    `[${label}] クリックしたが遷移しませんでした (expected=${expectedPath}, actual=${currentPath}, currentUrl=${currentUrl}, href=${expectedUrl})`
  );
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

test('ランキングカード下の追加リンクが正しく遷移する', async ({ page, context }) => {
  test.setTimeout(120_000);
  await page.goto(LP_URL, { waitUntil: 'domcontentloaded' });

  // ランキングセクションまでスクロール
  const rankingSection = page.locator('#ranking');
  await expect(rankingSection, 'ランキングセクションが見つからない').toBeVisible({ timeout: 15_000 });
  await rankingSection.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);

  // ランキングカードの下までスクロールして、追加リンクが表示されるようにする
  await page.mouse.wheel(0, 2000);
  await page.waitForTimeout(500);

  // リンクが見つかるまで少しずつスクロールして探すヘルパー関数
  async function findVisibleLink(selector: string, label: string, maxScrolls = 5): Promise<Locator | null> {
    for (let i = 0; i < maxScrolls; i++) {
      const link = page.locator(selector).first();
      const count = await link.count();
      if (count > 0) {
        const isVisible = await link.isVisible().catch(() => false);
        if (isVisible) return link;
      }
      await page.mouse.wheel(0, 800);
      await page.waitForTimeout(300);
    }
    return null;
  }

  // 1. 成田発のツアー一覧リンク: hrefにクエリパラメータとハッシュが含まれるが、origin+pathnameのみで比較
  const naritaTourLink = await findVisibleLink(
    'a[href*="/tour/?tour_category[]=turkish_air"][href*="narita"]',
    '成田発ツアー一覧'
  );
  if (naritaTourLink) {
    await clickAndAssertGoesToHref(page, context, naritaTourLink, '成田発ツアー一覧', {
      returnTo: LP_URL,
      includeQuery: false, // origin+pathname のみで比較（/tour/ に遷移することを確認）
    });
  }

  // 2. ビジネスクラス（成田発）リンク: 重要なクエリパラメータ（ranking-tab）のみを比較
  const businessNaritaLink = await findVisibleLink(
    'a[href*="b-special"][href*="ranking-tab=narita"]',
    'ビジネスクラス（成田発）'
  );
  if (businessNaritaLink) {
    await clickAndAssertGoesToHref(page, context, businessNaritaLink, 'ビジネスクラス（成田発）', {
      returnTo: LP_URL,
      importantParams: ['ranking-tab'], // ranking-tab パラメータのみを比較（トラッキングパラメータは無視）
    });
  }

  // 3. ビジネスクラス（羽田発）リンク: 重要なクエリパラメータ（ranking-tab）のみを比較
  const businessHanedaLink = await findVisibleLink(
    'a[href*="b-special"][href*="ranking-tab=haneda"]',
    'ビジネスクラス（羽田発）'
  );
  if (businessHanedaLink) {
    await clickAndAssertGoesToHref(page, context, businessHanedaLink, 'ビジネスクラス（羽田発）', {
      returnTo: LP_URL,
      importantParams: ['ranking-tab'], // ranking-tab パラメータのみを比較（トラッキングパラメータは無視）
    });
  }

  // 4. ANA就航記念キャンペーンの「詳細はこちら」: クエリパラメータやハッシュは無視して origin+pathname のみで比較
  const anaDetailLink = await findVisibleLink('a[href*="/tour_category/ana_air"]', 'ANA就航記念キャンペーン / 詳細');
  if (anaDetailLink) {
    // テキストに「詳細」が含まれるか確認
    const hasDetailText = await anaDetailLink.filter({ hasText: /詳細/ }).count();
    if (hasDetailText > 0) {
      await clickAndAssertGoesToHref(page, context, anaDetailLink.filter({ hasText: /詳細/ }), 'ANA就航記念キャンペーン / 詳細', {
        returnTo: LP_URL,
        includeQuery: false, // origin+pathname のみで比較（/tour_category/ana_air に遷移することを確認）
      });
    }
  }
});
