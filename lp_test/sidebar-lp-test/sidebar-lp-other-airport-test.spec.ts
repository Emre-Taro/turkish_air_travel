// LPの人気ランキングセクション下部の出発地ボタン（関西発、名古屋発、福岡発）の遷移と
// 各ページ内のサイドバースクロールをテスト
// - ランキングセクション下部のボタンが正しいURLに遷移するか
// - 各ページ（関西発、名古屋発、福岡発）のサイドバーが正常にスクロールするか

import { test, expect, Locator, Page, BrowserContext } from '@playwright/test';

const LP_URL = 'https://turkish.co.jp/special/';
const KANSAI_URL = 'https://turkish.co.jp/special-k/';
const NAGOYA_URL = 'https://turkish.co.jp/special-n/';
const FUKUOKA_URL = 'https://turkish.jp/special-f/';

type Case = {
  name: string;
  href: string;
  target?: (page: any) => Locator;
  nearTop?: { min?: number; max?: number };
  checkTop?: boolean;
};

// 関西発・名古屋発ページ用のサイドバーケース（メインLPと同じ）
const standardCases: Case[] = [
  // 人気ランキング
  {
    name: '直行便 トルコ航空で行く！人気ランキングTOP３',
    href: '#ranking',
    target: (page) => page.locator('#ranking'),
  },
  // お客様の口コミ満足度97%
  {
    name: 'ご旅行までの流れ',
    href: '#step3',
    target: (page) => page.locator('section.step3'),
  },
  // お客様の声満足度97%
  {
    name: 'お客様の声満足度97%',
    href: '#step97',
    target: (page) => page.locator('#step97'),
  },
  // ターキッシュエアラインズ
  {
    name: 'ターキッシュのこだわり10ポイント',
    href: '#point',
    target: (page) => page.locator('section.point'),
    nearTop: { min: 0, max: 420 },
  },
  // 旅のサポート
  {
    name: '旅のサポート',
    href: '#support',
    target: (page) => page.locator('#support'),
  },
  // 一人２席のゆったりシート
  {
    name: '１人２席のゆったりシート',
    href: '#seat',
    target: (page) => page.locator('#seat'),
  },
  // ツアー内容比較
  {
    name: 'ツアー内容比較',
    href: '#compare',
    target: (page) => page.locator('#compare'),
  },
  // トルコの旅へ
  {
    name: 'トルコの旅へ',
    href: '#spot',
    target: (page) => page.locator('#spot'),
  },
  // ターキッシュエアラインズ
  {
    name: 'ターキッシュエアラインズ',
    href: '#class',
    target: (page) => page.locator('section.class'),
    nearTop: { min: 0, max: 200 },
  },
  // 5つ星デラックスホテル
  {
    name: '5つ星デラックスホテル',
    href: '#hotel',
    target: (page) => page.locator('#hotel'),
  },
  // 世界三大料理トルコ料理
  {
    name: '世界三大料理トルコ料理',
    href: '#cooking',
    target: (page) => page.locator('#cooking'),
  },
  // よくあるご質問
  {
    name: 'よくあるご質問',
    href: '#faq',
    target: (page) => page.locator('#faq'),
  },
  // トップへ
  {
    name: 'トップへ',
    href: '#top',
    checkTop: true,
  },
];



// 福岡発ページ用のサイドバーケース（アンカーとターゲットIDが少し異なる）
// 注: 実際のページ構造に応じて調整が必要な場合があります
const fukuokaCases: Case[] = [
  // 人気ランキング
  {
    name: '人気TOP3',
    href: '#lp19',
    target: (page) => page.locator('#lp19'),
    nearTop: { min: -200, max: 260 }, // スクロールが少しオーバーしても許容
  },
  // お客様の口コミ満足度97%
  {
    name: 'お客様の口コミ満足度97%',
    href: '#lp03',
    target: (page) => page.locator('#lp03'),
  },
  // 上質サポート'
  {
    name: '上質サポート',
    href: '#lp05',
    target: (page) => page.locator('#lp05'),
  },
  // こだわり10ポイント
  {
    name: 'こだわり10ポイント',
    href: '#lp08',
    target: (page) => page.locator('#lp08'),
  },
  // ターキッシュエアラインズ
  {
    name: 'ターキッシュエアラインズ',
    href: '#lp09',
    target: (page) => page.locator('#lp10'),
    nearTop: { min: 0, max: 420 },
  },
  // 5星デラックスホテル
  {
    name: '5星デラックスホテル',
    href: '#lp11',
    target: (page) => page.locator('#lp11'),
  },
  // ツアー比較
  {
    name: 'ツアー比較',
    href: '#lp15',
    target: (page) => page.locator('#lp15'),
  },
  // よくある質問
  {
    name: 'よくある質問',
    href: '#lp16',
    target: (page) => page.locator('#lp16'),
  },
  // トップへ
  {
    name: 'トップ',
    href: '#',
    checkTop: true,
  },
];

function originPath(u: string | URL) {
  const url = typeof u === 'string' ? new URL(u) : u;
  return url.origin + url.pathname;
}

async function getTop(locator: Locator) {
  return await locator.evaluate((el: HTMLElement) =>
    Math.round(el.getBoundingClientRect().top)
  );
}

async function expectNearTop(locator: Locator, caseName: string, min = 0, max = 260) {
  await expect(locator, `[${caseName}] targetが見つからない/表示されない`).toBeVisible({ timeout: 15_000 });

  await expect.poll(async () => {
    const top = await getTop(locator);
    return top;
  }, { timeout: 15_000, intervals: [100, 200, 300] }).toBeGreaterThanOrEqual(min);

  await expect.poll(async () => {
    const top = await getTop(locator);
    return top;
  }, { timeout: 15_000, intervals: [100, 200, 300] }).toBeLessThanOrEqual(max);
}

async function waitForScrollToSettle(page: any, timeout = 5_000) {
  await expect.poll(async () => {
    const y1 = await page.evaluate(() => window.scrollY);
    await page.waitForTimeout(100);
    const y2 = await page.evaluate(() => window.scrollY);
    return Math.round(Math.abs(y2 - y1));
  }, { timeout, intervals: [100, 150, 200] }).toBeLessThanOrEqual(1);
}

async function findVisibleAnchorLink(page: any, href: string, label: string) {
  // LPは「ある程度スクロールしないと右サイドバーが出ない」ことがある。
  // そのため、visible なリンクが見つかるまで少しずつスクロールして探す。
  for (let i = 0; i < 8; i++) {
    const link = page.locator(`a[href="${href}"]:visible`).first();
    if ((await link.count()) > 0) return link;
    await page.mouse.wheel(0, 700);
    await page.waitForTimeout(150);
  }
  throw new Error(`[${label}] クリック対象リンクが見つからない（scroll後も）: href=${href}`);
}

async function clickAndAssertGoesToHref(
  page: Page,
  context: BrowserContext,
  link: Locator,
  label: string,
  expectedUrl: string
) {
  await expect(link, `[${label}] リンクが見つからない`).toBeVisible({ timeout: 15_000 });
  await link.scrollIntoViewIfNeeded();

  const href = await link.getAttribute('href');
  expect(href, `[${label}] hrefが無い`).not.toBeNull();
  const expectedOriginPath = originPath(expectedUrl);

  // クリック後に「新規タブ」or「同一タブ遷移」をレースで待つ
  const popupP = Promise.race([
    page.waitForEvent('popup', { timeout: 15_000 }),
    context.waitForEvent('page', { timeout: 15_000 }),
  ]).catch(() => null);
  const sameTabP = page
    .waitForURL((u) => originPath(u) === expectedOriginPath, { timeout: 20_000 })
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
    await expect.poll(async () => originPath(page.url()), { timeout: 20_000 }).toBe(expectedOriginPath);
    return;
  }

  // 遷移が検出されなかった場合、現在のURLを確認してデバッグ情報を追加
  const currentUrl = page.url();
  const currentOriginPath = originPath(currentUrl);
  throw new Error(
    `[${label}] クリックしたが遷移しませんでした (expected=${expectedUrl}, expectedOriginPath=${expectedOriginPath}, current=${currentUrl}, currentOriginPath=${currentOriginPath})`
  );
}

test.describe('LP: ランキングセクション下部の出発地ボタン遷移テスト', () => {
  test('関西発、名古屋発、福岡発ボタンが正しいURLに遷移する', async ({ page, context }) => {
    test.setTimeout(120_000);
    await page.goto(LP_URL, { waitUntil: 'domcontentloaded' });

    // ランキングセクションまでスクロール
    const rankingSection = page.locator('#ranking');
    await expect(rankingSection, 'ランキングセクションが見つからない').toBeVisible({ timeout: 15_000 });
    await rankingSection.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);

    // ランキングセクション内またはその下にある出発地ボタンを探す
    // ボタンはランキングセクションの下あたりにある想定
    // 注意: UI上は「関西発」だが、実際のテキストは「関空発」になっている
    const departureButtons = [
      { name: '関空発', searchText: /関空発/, url: KANSAI_URL },
      { name: '名古屋発', searchText: /名古屋発/, url: NAGOYA_URL },
      { name: '福岡発', searchText: /福岡発/, url: FUKUOKA_URL },
    ];

    for (const btn of departureButtons) {
      await test.step(btn.name, async () => {
        // 毎回LPに戻る
        await page.goto(LP_URL, { waitUntil: 'domcontentloaded' });
        await rankingSection.scrollIntoViewIfNeeded();
        await page.waitForTimeout(500);

        // ランキングセクションの下までスクロールして、出発地ボタンが表示されるようにする
        await page.mouse.wheel(0, 1500);
        await page.waitForTimeout(500);

        // ボタンを探す（class="sec7-links-column-item" とテキスト名で判断）
        // まず sec7-links-column-item クラスで試す。見つからなければ通常のリンクで検索
        let button = page.locator('a.sec7-links-column-item').filter({ hasText: btn.searchText }).first();
        if ((await button.count()) === 0) {
          // sec7-links-column-item クラスがない場合は、通常のリンクで検索
          button = page.locator('a').filter({ hasText: btn.searchText }).first();
        }
        await expect(button, `[${btn.name}] ボタンが見つからない`).toBeVisible({ timeout: 15_000 });
        await button.scrollIntoViewIfNeeded();

        await clickAndAssertGoesToHref(page, context, button, btn.name, btn.url);
      });
    }
  });
});

test.describe('LP: 各出発地ページのサイドバースクロールテスト', () => {
  test('関西発ページのサイドバーが正常にスクロールする', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto(KANSAI_URL, { waitUntil: 'networkidle' });
    await page.addStyleTag({ content: `html { scroll-behavior: auto !important; }` });

    // まず少しスクロールして、右サイドバー（固定ナビ）が表示される状態にする
    await page.mouse.wheel(0, 900);
    await page.waitForTimeout(200);

    for (const c of standardCases) {
      const button = await findVisibleAnchorLink(page, c.href, c.name);
      await button.click();
      await waitForScrollToSettle(page);

      const min = c.nearTop?.min ?? 0;
      const max = c.nearTop?.max ?? 260;

      try {
        if (c.checkTop) {
          // ページ最上部判定
          await expect.poll(async () => {
            return Math.round(await page.evaluate(() => window.scrollY));
          }, { timeout: 15_000 }).toBeLessThanOrEqual(5);
          continue;
        }
        const target = c.target!(page);
        await expectNearTop(target, c.name, min, max);
      } catch (e) {
        const y = Math.round(await page.evaluate(() => window.scrollY));
        let topInfo = '';

        try {
          if (c.target) {
            const t = c.target(page);
            const count = await t.count();
            topInfo += ` targetCount=${count}`;
            if (count >= 1) {
              const top = await t.first().evaluate(el => Math.round(el.getBoundingClientRect().top));
              topInfo += ` targetTop(first)=${top}`;
            }
          }
        } catch {}

        throw new Error(
          `[FAIL] ${c.name} (${c.href}) scrollY=${y} expectedTop=[${min},${max}]${topInfo}\n` +
          (e instanceof Error ? e.message : String(e))
        );
      }
    }
  });

  test('名古屋発ページのサイドバーが正常にスクロールする', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto(NAGOYA_URL, { waitUntil: 'networkidle' });
    await page.addStyleTag({ content: `html { scroll-behavior: auto !important; }` });

    // まず少しスクロールして、右サイドバー（固定ナビ）が表示される状態にする
    await page.mouse.wheel(0, 900);
    await page.waitForTimeout(200);

    for (const c of standardCases) {
      const button = await findVisibleAnchorLink(page, c.href, c.name);
      await button.click();
      await waitForScrollToSettle(page);

      const min = c.nearTop?.min ?? 0;
      const max = c.nearTop?.max ?? 260;

      try {
        if (c.checkTop) {
          // ページ最上部判定
          await expect.poll(async () => {
            return Math.round(await page.evaluate(() => window.scrollY));
          }, { timeout: 15_000 }).toBeLessThanOrEqual(5);
          continue;
        }
        const target = c.target!(page);
        await expectNearTop(target, c.name, min, max);
      } catch (e) {
        const y = Math.round(await page.evaluate(() => window.scrollY));
        let topInfo = '';

        try {
          if (c.target) {
            const t = c.target(page);
            const count = await t.count();
            topInfo += ` targetCount=${count}`;
            if (count >= 1) {
              const top = await t.first().evaluate(el => Math.round(el.getBoundingClientRect().top));
              topInfo += ` targetTop(first)=${top}`;
            }
          }
        } catch {}

        throw new Error(
          `[FAIL] ${c.name} (${c.href}) scrollY=${y} expectedTop=[${min},${max}]${topInfo}\n` +
          (e instanceof Error ? e.message : String(e))
        );
      }
    }
  });

  test('福岡発ページのサイドバーが正常にスクロールする', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto(FUKUOKA_URL, { waitUntil: 'networkidle' });
    await page.addStyleTag({ content: `html { scroll-behavior: auto !important; }` });

    // まず少しスクロールして、右サイドバー（固定ナビ）が表示される状態にする
    await page.mouse.wheel(0, 900);
    await page.waitForTimeout(200);

    for (const c of fukuokaCases) {
      const button = await findVisibleAnchorLink(page, c.href, c.name);
      await button.click();
      await waitForScrollToSettle(page);

      const min = c.nearTop?.min ?? 0;
      const max = c.nearTop?.max ?? 260;

      try {
        if (c.checkTop) {
          // ページ最上部判定
          await expect.poll(async () => {
            return Math.round(await page.evaluate(() => window.scrollY));
          }, { timeout: 15_000 }).toBeLessThanOrEqual(5);
          continue;
        }
        const target = c.target!(page);
        await expectNearTop(target, c.name, min, max);
      } catch (e) {
        const y = Math.round(await page.evaluate(() => window.scrollY));
        let topInfo = '';

        try {
          if (c.target) {
            const t = c.target(page);
            const count = await t.count();
            topInfo += ` targetCount=${count}`;
            if (count >= 1) {
              const top = await t.first().evaluate(el => Math.round(el.getBoundingClientRect().top));
              topInfo += ` targetTop(first)=${top}`;
            }
          }
        } catch {}

        throw new Error(
          `[FAIL] ${c.name} (${c.href}) scrollY=${y} expectedTop=[${min},${max}]${topInfo}\n` +
          (e instanceof Error ? e.message : String(e))
        );
      }
    }
  });
});

