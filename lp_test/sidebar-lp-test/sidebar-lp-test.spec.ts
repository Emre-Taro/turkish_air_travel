
// LPの画面の右側にあるサイドバーのボタンが正常に動くかをテスト
// - サイドバー
//     - サイドバーを押す。
//     - それぞれのサイドバーを押してスクロールしたときに正しい位置に来るのかを確認

import { test, expect, Locator } from '@playwright/test';

const LP_URL = 'https://turkish.co.jp/special/';

type Case = {
  name: string;
  href: string;
  target?: (page: any) => Locator;
  nearTop?: { min?: number; max?: number };
  checkTop?: boolean;
};

const cases: Case[] = [
  // 人気ランキング
  {
    name: '直行便 トルコ航空で行く！人気ランキングTOP３',
    href: '#ranking',
    target: (page) => page.locator('#ranking'),
  },
  // ご旅行までの流れ
  {
    name: 'ご旅行までの流れ',
    href: '#step3',
    target: (page) => page.locator('section.step3'), 
  },
  // お客様の声満足度97%
  {
    name: 'お客様の声満足度97%（画像）',
    href: '#step97',
    target: (page) => page.locator('#step97'), 
  },
  // こだわり10のポイント
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

async function getTop(locator: Locator) {
  return await locator.evaluate((el: HTMLElement) =>
    Math.round(el.getBoundingClientRect().top)
  );
}

async function expectNearTop(locator: Locator, caseName: string, min = 0, max = 260) {
  await expect(locator, `[${caseName}] targetが見つからない/表示されない`).toBeVisible({ timeout: 15_000 });

  await expect.poll(async () => {
    const top = await getTop(locator);
    // top を返して、失敗時に catch 側で使えるようにする
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

test('LP右サイドバー：ボタン→スクロールを同一ページで順番に確認', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto(LP_URL, { waitUntil: 'networkidle' });
  await page.addStyleTag({ content: `html { scroll-behavior: auto !important; }` });

  // まず少しスクロールして、右サイドバー（固定ナビ）が表示される状態にする
  await page.mouse.wheel(0, 900);
  await page.waitForTimeout(200);

  for (const c of cases) {
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

