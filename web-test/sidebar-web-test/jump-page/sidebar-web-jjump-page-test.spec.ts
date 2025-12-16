

import { test, expect, Page, Locator } from '@playwright/test';

const WEB_URL = 'https://turkish.jp/';

type NavCase = {
  name: string;
  expectedUrl: string;
};

function sidebar(page: Page) {
  // 右サイドバー（PC想定）
  return page.locator('#side_navigation');
}

async function clickByHrefWithin(container: Locator, href: string) {
  const link = container.locator(`a[href="${href}"]`).first();
  await expect(link, `サイドバー内に a[href="${href}"] が見つからない`).toBeVisible({ timeout: 15000 });
  await link.click({ timeout: 15000 });
  return link;
}

async function expectOriginPath(page: Page, expectedUrl: string) {
  await expect.poll(async () => {
    const u = new URL(page.url());
    return u.origin + u.pathname;
  }, { timeout: 30000 }).toBe(new URL(expectedUrl).origin + new URL(expectedUrl).pathname);
}

test.describe('LP右サイドバー：hrefで確実に取得（表示切替・外部遷移）', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(WEB_URL, { waitUntil: 'domcontentloaded' });
    await expect(sidebar(page)).toBeVisible({ timeout: 15000 });
  });

    test('「全コース簡単選択」→ overlay が visible になり is-visible が付く', async ({ page }) => {
    const sb = sidebar(page);
    await expect(sb).toBeVisible({ timeout: 15000 });

    const openBtn = sb.locator('a').filter({
      hasText: /全コース[\s\S]*かんたん検索/,
    }).first();

    await expect(openBtn).toBeVisible({ timeout: 15000 });
    await openBtn.click();

    const overlay = page.locator('#spc__overlay');
    await expect(overlay).toHaveClass(/is-visible/, { timeout: 15000 });
    await expect(overlay).toBeVisible({ timeout: 15000 });
    });

  test('外部/別URL遷移ボタン（href一致）→ 最終URLの origin+pathname を検証', async ({ page }) => {
    const sb = sidebar(page);

    const navCases = [
        { name: 'トルコツアー一覧', href: 'https://turkish.jp/tour/', expected: 'https://turkish.jp/tour/' },
        { name: 'ビジネスクラス', href: 'https://turkish.co.jp/b-special/', expected: 'https://turkish.co.jp/b-special/' },
        { name: 'チェックしたツアー', href: 'https://turkish.jp/history/', expected: 'https://turkish.jp/history/' },
        { name: 'お気に入り', href: 'https://turkish.jp/favorite/', expected: 'https://turkish.jp/favorite/' },
        ] as const;

    for (const c of navCases) {
    test(`外部遷移: ${c.name}（href一致）→ origin+pathname 検証`, async ({ page }) => {
        await page.goto(WEB_URL, { waitUntil: 'domcontentloaded' });

        const sb = sidebar(page);
        await expect(sb).toBeVisible({ timeout: 15000 });

        const link = sb.locator(`a[href="${c.href}"]`).first();
        await expect(link).toBeVisible({ timeout: 15000 });

        // target=_blank 対応
        const target = await link.getAttribute('target');
        if (target === '_blank') {
        const [newPage] = await Promise.all([
            page.context().waitForEvent('page', { timeout: 15000 }),
            link.click(),
        ]);
        await newPage.waitForLoadState('domcontentloaded');
        await expectOriginPath(newPage, c.expected);
        await newPage.close();
        } else {
        await Promise.all([page.waitForLoadState('domcontentloaded'), link.click()]);
        await expectOriginPath(page, c.expected);
        }
    });
    }

  });
});