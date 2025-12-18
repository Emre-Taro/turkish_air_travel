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

  // 羽田発の人気ランキングカード情報を定義
  // 各カードには「詳細はこちら」（カード全体がaタグ）と「パンフレットはこちら」（ボタンがaタグ）がある
  type CardConfig = {
    detail: {
      cardClass: string; // カード全体のaタグのclass（例: "lp19__card"）
      expectedHref: string; // 期待されるhref（例: "https://turkish.jp/tour/istanbul-cruise-9days-turkish/"）
    };
    pamphlet: {
      buttonClass: string; // パンフレットボタンのclass（例: "lp19__list__btn-brown"）
      expectedHref: string; // 期待されるhref（例: "https://turkish.jp/p_pamphlet/t9sah/"）
    };
  };

  // 羽田発の8個のカードの設定を定義
  // 必要に応じて、実際のサイトから取得したclassとhrefを設定してください
  const hanedaCardConfigs: CardConfig[] = [
    {
      detail: {
        cardClass: 'lp19__card',
        expectedHref: 'https://turkish.jp/tour/istanbul-cruise-9days-turkish/',
      },
      pamphlet: {
        buttonClass: 'lp19__list__btn-brown',
        expectedHref: 'https://turkish.jp/p_pamphlet/t9sah/',
      },
      
    },
    {
      detail: {
        cardClass: 'lp19__card',
        expectedHref: 'https://turkish.jp/tour/business_bt9sah/',
      },
      pamphlet: {
        buttonClass: 'lp19__list__btn-brown',
        expectedHref: 'https://turkish.jp/p_pamphlet/bt9sah/',
      },
    },
    {
      detail: {
        cardClass: 'lp19__card',
        expectedHref: 'https://turkish.jp/tour/t1swsh/',
      },
      pamphlet: {
        buttonClass: 'lp19__list__btn-brown',
        expectedHref: 'https://turkish.jp/p_pamphlet/t1swsh/',
      },
    },
    {
      detail: {
        cardClass: 'lp19__card',
        expectedHref: 'https://turkish.jp/tour/bt1swsh/',
      },
      pamphlet: {
        buttonClass: 'lp19__list__btn-brown',
        expectedHref: 'https://turkish.jp/p_pamphlet/bt1swsh/',
      },
    },
    {
      detail: {
        cardClass: 'lp19__card',
        expectedHref: 'https://turkish.jp/tour/haneda-8days-turkish/',
      },
      pamphlet: {
        buttonClass: 'lp19__list__btn-brown',
        expectedHref: 'https://turkish.jp/p_pamphlet/t8sah/',
      },
    },
    {
      detail: {
        cardClass: 'lp19__card',
        expectedHref: 'https://turkish.jp/tour/business_bt8sah/',
      },
      pamphlet: {
        buttonClass: 'lp19__list__btn-brown',
        expectedHref: 'https://turkish.jp/p_pamphlet/bt8sah/',
      },
    },
    {
      detail: {
        cardClass: 'lp19__card',
        expectedHref: 'https://turkish.jp/tour/ana9ssh/',
      },
      pamphlet: {
        buttonClass: 'lp19__list__btn-brown',
        expectedHref: 'https://turkish.jp/p_pamphlet/ana9ssh/',
      },
    },
    {
      detail: {
        cardClass: 'lp19__card',
        expectedHref: 'https://turkish.jp/tour/anab9ssh/',
      },
      pamphlet: {
        buttonClass: 'lp19__list__btn-brown',
        expectedHref: 'https://turkish.jp/p_pamphlet/anab9ssh/',
      },
    },

  ];

  test('羽田発の人気ランキングカードの「詳細はこちら」「パンフレットはこちら」が正しく遷移する', async ({
    page,
    context,
  }) => {
    test.setTimeout(300_000); // 8カード×2ボタンで時間がかかるため

    await page.goto(WEB_URL, { waitUntil: 'domcontentloaded' });

    const sel = departureSelect(page);
    await expect(sel, '[出発地select] が見つからない').toBeVisible({ timeout: 15_000 });
    await sel.selectOption({ label: '羽田 発' });

    // オーバーレイを閉じる
    await dismissSpcOverlay(page);

    // 人気ランキングセクションが表示されるまで待つ
    await page.waitForTimeout(1000);

    // 各カードをテスト
    for (let cardIndex = 0; cardIndex < hanedaCardConfigs.length; cardIndex++) {
      const cardConfig = hanedaCardConfigs[cardIndex];
      await test.step(`羽田発 / カード${cardIndex + 1}`, async () => {
        // cardClassを使ってカード全体のaタグを取得
        // その中に「詳細はこちら」のdivがあることを確認
        let detailCard: Locator;
        const detailCardExact = page.locator(`a.${cardConfig.detail.cardClass}`).nth(cardIndex);
        const detailCardCount = await detailCardExact.count();
        if (detailCardCount === 0) {
          // カードが見つからない場合は、より柔軟なセレクタで探す
          const allCards = page.locator(`a[class*="${cardConfig.detail.cardClass}"]`);
          const count = await allCards.count();
          if (count > cardIndex) {
            detailCard = allCards.nth(cardIndex);
          } else {
            throw new Error(
              `[羽田発 / カード${cardIndex + 1}] 詳細カードが見つかりません (class: ${cardConfig.detail.cardClass})`
            );
          }
        } else {
          detailCard = detailCardExact;
        }

        await detailCard.scrollIntoViewIfNeeded();

        // カード内に「詳細はこちら」のdivがあることを確認
        // 「詳細はこちら」のdivは通常 `lp19__list__btn-blue` というclassを持つ
        // 複数マッチする可能性があるので、.first()で最初の要素を取得
        const detailDiv = detailCard.locator('div').filter({ hasText: /詳細はこちら/ }).first();
        const detailDivCount = await detailDiv.count();
        if (detailDivCount === 0) {
          throw new Error(
            `[羽田発 / カード${cardIndex + 1}] カード内に「詳細はこちら」のdivが見つかりません`
          );
        }

        // カード全体のaタグのhrefを取得
        const actualDetailHref = await detailCard.getAttribute('href');
        expect(actualDetailHref, `[羽田発 / カード${cardIndex + 1} / 詳細] hrefが取得できません`).toBeTruthy();

        // hrefが期待値と一致するか確認
        const actualDetailUrl = new URL(actualDetailHref!, page.url()).toString();
        const expectedDetailUrl = new URL(cardConfig.detail.expectedHref, page.url()).toString();
        expect(originPath(actualDetailUrl), `[羽田発 / カード${cardIndex + 1} / 詳細] hrefが期待値と一致しません`).toBe(
          originPath(expectedDetailUrl)
        );

        // 「詳細はこちら」のdivをクリック（親のaタグのhrefに遷移する）
        // カード全体のaタグのhrefを使って遷移を確認
        const expectedOriginPath = originPath(actualDetailUrl);

        const popupP = context.waitForEvent('page', { timeout: 5_000 }).catch(() => null);
        const sameTabP = page
          .waitForURL((u) => originPath(u) === expectedOriginPath, { timeout: 15_000 })
          .then(() => true)
          .catch(() => false);

        // Close overlays that may intercept pointer events, then click.
        await dismissSpcOverlay(page);
        try {
          await detailDiv.click({ noWaitAfter: true });
        } catch {
          await dismissSpcOverlay(page);
          await detailDiv.click({ noWaitAfter: true, force: true });
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
        } else if (sameTabMoved) {
          await expect.poll(async () => originPath(page.url()), { timeout: 15_000 }).toBe(expectedOriginPath);
          await expect(page, `[羽田発 / カード${cardIndex + 1} / 詳細] looks like a 404 page`).not.toHaveTitle(/404|not found/i);
          await page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => {});
        } else {
          throw new Error(`[羽田発 / カード${cardIndex + 1} / 詳細] clicked but did not navigate (expected=${expectedOriginPath})`);
        }

        // パンフレットボタンを取得
        let pamphletButton: Locator;
        const pamphletButtonExact = page
          .locator(`a.${cardConfig.pamphlet.buttonClass}`)
          .nth(cardIndex);
        const pamphletCount = await pamphletButtonExact.count();
        if (pamphletCount === 0) {
          // ボタンが見つからない場合は、より柔軟なセレクタで探す
          const allPamphlets = page.locator(`a[class*="${cardConfig.pamphlet.buttonClass}"]`);
          const count = await allPamphlets.count();
          if (count > cardIndex) {
            pamphletButton = allPamphlets.nth(cardIndex);
          } else {
            throw new Error(
              `[羽田発 / カード${cardIndex + 1}] パンフレットボタンが見つかりません (class: ${cardConfig.pamphlet.buttonClass})`
            );
          }
        } else {
          pamphletButton = pamphletButtonExact;
        }

        await pamphletButton.scrollIntoViewIfNeeded();
        // hrefが期待値と一致するか確認
        const actualPamphletHref = await pamphletButton.getAttribute('href');
        if (actualPamphletHref) {
          const actualPamphletUrl = new URL(actualPamphletHref, page.url()).toString();
          const expectedPamphletUrl = new URL(cardConfig.pamphlet.expectedHref, page.url()).toString();
          expect(originPath(actualPamphletUrl), `[羽田発 / カード${cardIndex + 1} / パンフレット] hrefが期待値と一致しません`).toBe(
            originPath(expectedPamphletUrl)
          );
        }
        await clickAndAssertFollowsHref(
          page,
          context,
          pamphletButton,
          `羽田発 / カード${cardIndex + 1} / パンフレット`,
          { returnBack: true }
        );
      });
    }
  });
});


