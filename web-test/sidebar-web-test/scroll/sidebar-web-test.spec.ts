

import { test, expect, Locator } from '@playwright/test';

const LP_URL = 'https://turkish.jp/';

type Case = {
  name: string;
  href: string;
  target?: (page: any) => Locator;
  nearTop?: { min?: number; max?: number };
  checkTop?: boolean;
};

const cases: Case[] = [
  // トルコツアー人気ランキング
  {
    name: 'トルコツアー人気ランキング',
    href: '#lp19__ranking',
    target: (page) => page.locator('#lp19__ranking'),
  },
  // こだわり10のポイント
  {
    name: 'ターキッシュのこだわり10ポイント',
    href: '#top_point',
    target: (page) => page.locator('section.lppoint'),
  },
  // お客様の声満足度97%
  {
    name: 'お客様の声満足度97%',
    href: '#top_review',
    target: (page) => page.locator('#top_review'),
  },
];

async function getTop(locator: Locator) {
  return await locator.evaluate((el: HTMLElement) =>
    Math.round(el.getBoundingClientRect().top)
  );
}

async function expectNearTop(locator: Locator, caseName: string, min = 0, max = 260) {
  // visible ではなく存在確認にする
  await expect(locator, `[${caseName}] targetが見つからない`).toHaveCount(1, { timeout: 15_000 });

  await expect.poll(async () => await getTop(locator), { timeout: 15_000, intervals: [100, 200, 300] })
    .toBeGreaterThanOrEqual(min);

  await expect.poll(async () => await getTop(locator), { timeout: 15_000, intervals: [100, 200, 300] })
    .toBeLessThanOrEqual(max);
}

async function waitForScrollToSettle(page: any, timeout = 8_000) {
  const start = Date.now();
  let stable = 0;
  let prev = await page.evaluate(() => window.scrollY);

  while (Date.now() - start < timeout) {
    await page.waitForTimeout(120);
    const cur = await page.evaluate(() => window.scrollY);

    const diff = Math.abs(cur - prev);
    prev = cur;

    // 画像遅延ロード等で 2〜3px 揺れることがあるので閾値を少し緩める
    if (diff <= 3) stable++;
    else stable = 0;

    // 4回連続で安定したらOK
    if (stable >= 4) return;
  }
  // タイムアウトでも致命ではないので throw しない（後段の nearTop 判定で落とす）
}

test('LP右サイドバー：ボタン→スクロールを同一ページで順番に確認', async ({ page }) => {
  await page.goto(LP_URL, { waitUntil: 'networkidle' });
  await page.addStyleTag({ content: `html { scroll-behavior: auto !important; }` });

  for (const c of cases) {
    const sidebar = page.locator('#side_navigation');
    const button = sidebar.locator(`a[href="${c.href}"]:visible`).first();
    await expect(button, `[${c.name}] サイドバーリンクが見つからない: href=${c.href}`).toBeVisible({ timeout: 15_000 });
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

