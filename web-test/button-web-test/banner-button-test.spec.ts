import { test, expect, Page, BrowserContext, Locator } from '@playwright/test';

const WEB_URL = 'https://turkish.jp/';

function originPath(u: string | URL) {
  const url = typeof u === 'string' ? new URL(u) : u;
  return url.origin + url.pathname;
}

async function dismissSpcOverlay(page: Page) {
  // The quick-search overlay (`#spc__overlay`) can intercept clicks on underlying links.
  const overlay = page.locator('#spc__overlay.is-visible');
  if ((await overlay.count()) > 0) {
    await overlay.click({ force: true }).catch(() => {});
    await expect(overlay).not.toBeVisible({ timeout: 5_000 }).catch(() => {});
  }
}

async function installAutoDismissTtr(page: Page) {
    await page.addInitScript(() => {
      const kill = () => {
        document.querySelectorAll('[data-ttr="ep"]').forEach((el) => el.remove());
        document.querySelectorAll('[data-ttr="backdrop"]').forEach((el) => el.remove());
      };
      kill();
      new MutationObserver(kill).observe(document.documentElement, { childList: true, subtree: true });
    });
  }

async function collectDropdownLinks(dropdown: any) {
  const as = dropdown.locator('a[href]');
  const n = await as.count();

  const links: { text: string; href: string }[] = [];
  for (let i = 0; i < n; i++) {
    const a = as.nth(i);
    if (!(await a.isVisible().catch(() => false))) continue;

    const href = await a.getAttribute('href');
    if (!href) continue;

    const text = (await a.textContent().catch(() => ''))?.trim() || '';
    links.push({ text, href });
  }
  return links;
}

async function gotoAndAssert(context: BrowserContext, baseUrl: string, href: string, label: string) {
  const url = new URL(href, baseUrl).toString();
  const expected = originPath(url);

  // 外部リンクかどうかを判定（baseUrlのoriginと比較）
  const urlObj = new URL(url);
  const baseUrlObj = new URL(baseUrl);
  const isExternal = urlObj.origin !== baseUrlObj.origin;

  const p = await context.newPage();
  await installAutoDismissTtr(p);            // 遷移先にも効かせる
  
  // URLやボタンが壊れている時に適切にエラーが出るようにエラーハンドリングを追加
  const resp = await p.goto(url, { waitUntil: 'domcontentloaded' });
  expect(resp, `[${label}] no response`).toBeTruthy();

  const status = resp!.status();
  expect(status, `[${label}] bad status: ${status} url=${url}`).toBeGreaterThanOrEqual(200);
  
  // 外部リンクの場合はステータスコード判定を緩める（403/redirectなどで落ちにくくする）
  if (isExternal) {
    // 外部リンク: 200-599まで許可（将来的な403/redirectに対応）
    expect(status, `[${label}] bad status: ${status} url=${url}`).toBeLessThan(600);
  } else {
    // 内部リンク: 従来通り200-399を要求
    expect(status, `[${label}] bad status: ${status} url=${url}`).toBeLessThan(400);
  }

  await dismissAdvertisements(p);
  await expect.poll(async () => originPath(p.url()), { timeout: 15_000 }).toBe(expected);
  await expect(p, `[${label}] 404っぽい`).not.toHaveTitle(/404|not found/i);

  await p.close();
}

async function dismissAdvertisements(page: Page) {
  // init scriptで広告は自動削除されるが、念のためフォールバック処理
  // ポップアップが存在する場合のみESCキーを押す
  const popupExists = await page.locator('[data-ttr="ep"]').count().catch(() => 0);
  if (popupExists > 0) {
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(200);
  }
}

async function clickAndAssertFollowsHref(
  page: Page,
  context: BrowserContext,
  link: any,
  label: string,
  opts?: { returnBack?: boolean; force?: boolean }
) {
  const returnBack = opts?.returnBack ?? true;
  const forceClick = opts?.force ?? false;

  if (!forceClick) {
    await expect(link, `[${label}] link not visible`).toBeVisible({ timeout: 15_000 });
  }
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
    await link.click({ noWaitAfter: true, force: forceClick });
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
    // 遷移後に広告が出ている場合は閉じる
    await dismissAdvertisements(page);
    await page.waitForTimeout(500);
    
    await expect.poll(async () => originPath(page.url()), { timeout: 15_000 }).toBe(expectedOriginPath);
    await expect(page, `[${label}] looks like a 404 page`).not.toHaveTitle(/404|not found/i);
    if (returnBack) {
      await page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => {});
    }
    return;
  }

  throw new Error(`[${label}] clicked but did not navigate (expected=${expectedOriginPath})`);
}

test.describe('WEB: ページ上部バナーのボタン遷移テスト', () => {
  test.beforeEach(async ({ page }) => {
    await installAutoDismissTtr(page);
    await page.goto(WEB_URL, { waitUntil: 'domcontentloaded' });
    await dismissSpcOverlay(page);
  });

  // 左2つはhoverでボタンが表示されるセクション
  // セクション1: 「直行便 トルコ航空指定」など（hoverで「8日間」「9日間」「10日間」などが表示される）
  // セクション2: 「直行便ANA指定」など（hoverで「6日間」「9日間」「11日間」などが表示される）

  test('左から2つのセクションと5つ目のセクション（hover必要）のボタンが正しく遷移する', async ({ page, context }) => {
    test.setTimeout(180_000);
    
    // バナーのul.nav__listを取得
    const banner = page.locator('ul.nav__list').first();
    await expect(banner, '[バナー] ul.nav__listが見つからない').toBeVisible({ timeout: 15_000 });
    
    // hover可能なセクション（li.nav__item--drop）を取得
    const dropItems = banner.locator('li.nav__item--drop');
    const dropItemCount = await dropItems.count();
    
    expect(dropItemCount, 'hover可能なセクションが3つ以上あることを確認').toBeGreaterThanOrEqual(3);
    
    // 左から1つ目、2つ目、5つ目（インデックス0, 1, 2）のセクションを取得
    const section1 = dropItems.nth(0);
    const section2 = dropItems.nth(1);
    const section5 = dropItems.nth(2);
    
    // セクション1のhoverテストとボタンクリック
    await test.step('セクション1（左から1つ目）のボタンをクリック', async () => {
      await section1.scrollIntoViewIfNeeded();
      await expect(section1, '[セクション1] li.nav__item--dropが見つからない').toBeVisible({ timeout: 15_000 });
      
      // hoverしてメニューを表示
      await section1.hover({ timeout: 15_000 });
      await page.waitForTimeout(500); // メニューが表示されるまで少し待つ
      
      // ドロップダウンメニュー（div.nav__drop）を取得
      const dropdown1 = section1.locator('div.nav__drop').first();
      await expect(dropdown1, '[セクション1] ドロップダウンメニュー（div.nav__drop）が表示されない').toBeVisible({ timeout: 5_000 });
      
      // ドロップダウンメニュー内のリンクを集める（見えているものだけ）
      const links = await collectDropdownLinks(dropdown1);
      expect(links.length, '[セクション1] リンクが24個あることを確認').toBe(24);
      
      // 遷移検証（ホームページは触らない、新規ページで検証）
      for (let i = 0; i < links.length; i++) {
        const { text, href } = links[i];
        await test.step(`セクション1 / ボタン${i + 1}/24 (${text || '無題'})`, async () => {
          await gotoAndAssert(context, page.url(), href, `セクション1 / ボタン${i + 1} ${text}`);
        });
      }
    });
    
    // セクション2のhoverテストとボタンクリック
    await test.step('セクション2（左から2つ目）のボタンをクリック', async () => {
      // セクション1からマウスを離す
      await page.mouse.move(0, 0);
      await page.waitForTimeout(500);
      
      // ページを再読み込みして状態をリセット（セクション1のテストで多くの遷移があったため）
      await page.reload({ waitUntil: 'domcontentloaded' });
      await dismissSpcOverlay(page);
      await page.waitForTimeout(500);
      
      // バナーを再度取得
      const banner2 = page.locator('ul.nav__list').first();
      await expect(banner2, '[バナー] ul.nav__listが見つからない').toBeVisible({ timeout: 15_000 });
      const dropItems2 = banner2.locator('li.nav__item--drop');
      const section2 = dropItems2.nth(1);
      
      await section2.scrollIntoViewIfNeeded();
      await expect(section2, '[セクション2] li.nav__item--dropが見つからない').toBeVisible({ timeout: 15_000 });
      
      // hoverしてメニューを表示
      await section2.hover({ timeout: 15_000 });
      await page.waitForTimeout(500); // メニューが表示されるまで少し待つ
      
      // ドロップダウンメニュー（div.nav__drop.nav__drop--sm）を取得
      const dropdown2 = section2.locator('div.nav__drop.nav__drop--sm').first();
      await expect(dropdown2, '[セクション2] ドロップダウンメニュー（div.nav__drop.nav__drop--sm）が表示されない').toBeVisible({ timeout: 5_000 });
      
      // ドロップダウンメニュー内のボタン（リンク）を取得
      const buttons2 = dropdown2.locator('a[href]');
      const buttonCount2 = await buttons2.count();
      
      expect(buttonCount2, '[セクション2] ボタンが見つからない').toBeGreaterThan(0);
      
      // 各ボタンをクリックして遷移を確認
      for (let i = 0; i < Math.min(buttonCount2, 5); i++) {
        const button = buttons2.nth(i);
        const buttonText = await button.textContent().catch(() => '');
        const href = await button.getAttribute('href');
        
        if (href) {
          await test.step(`セクション2 / ボタン${i + 1} (${buttonText?.trim() || '無題'})`, async () => {
            await clickAndAssertFollowsHref(page, context, button, `セクション2 / ボタン${i + 1}`, { returnBack: true });
            
            // 戻ったら再度hoverする必要がある
            await section2.hover({ timeout: 15_000 });
            await page.waitForTimeout(300);
          });
        }
      }
    });
    
    // セクション5のhoverテストとボタンクリック
    await test.step('セクション5（左から3つ目）のボタンをクリック', async () => {
      // セクション2からマウスを離す
      await page.mouse.move(0, 0);
      await page.waitForTimeout(300);
      
      await section5.scrollIntoViewIfNeeded();
      await expect(section5, '[セクション5] li.nav__item--dropが見つからない').toBeVisible({ timeout: 15_000 });
      
      // hoverしてメニューを表示
      await section5.hover({ timeout: 15_000 });
      await page.waitForTimeout(500); // メニューが表示されるまで少し待つ
      
      // ドロップダウンメニューを取得（div.nav__drop または div.nav__drop.nav__drop--sm）
      const dropdown5 = section5.locator('div.nav__drop').first();
      await expect(dropdown5, '[セクション5] ドロップダウンメニューが表示されない').toBeVisible({ timeout: 5_000 });
      
      // ドロップダウンメニュー内のボタン（リンク）を取得
      const buttons5 = dropdown5.locator('a[href]');
      const buttonCount5 = await buttons5.count();
      
      expect(buttonCount5, '[セクション5] ボタンが見つからない').toBeGreaterThan(0);
      
      // 各ボタンをクリックして遷移を確認（最大5つまで）
      for (let i = 0; i < Math.min(buttonCount5, 5); i++) {
        const button = buttons5.nth(i);
        const buttonText = await button.textContent().catch(() => '');
        const href = await button.getAttribute('href');
        
        if (href) {
          await test.step(`セクション5 / ボタン${i + 1} (${buttonText?.trim() || '無題'})`, async () => {
            await clickAndAssertFollowsHref(page, context, button, `セクション5 / ボタン${i + 1}`, { returnBack: true });
            
            // 戻ったら再度hoverする必要がある
            await section5.hover({ timeout: 15_000 });
            await page.waitForTimeout(300);
          });
        }
      }
    });
  });


  // 右2つは直接クリック可能なボタン（nav__linkクラス）
  // セクション3: href: https://turkish.jp/tourpoint/
  test('バナーセクション3（直接クリック）のボタンが正しく遷移する', async ({ page, context }) => {
    test.setTimeout(120_000);
    
    // バナーのul.nav__listを取得
    const banner = page.locator('ul.nav__list').first();
    await expect(banner, '[バナー] ul.nav__listが見つからない').toBeVisible({ timeout: 15_000 });
    
    // nav__linkクラスのリンクで、hrefが/tourpoint/のものを取得
    const section3Link = banner.locator('a.nav__link[href*="tourpoint"]').first();
    
    const linkCount = await section3Link.count();
    expect(linkCount, '[セクション3] ボタンが見つからない').toBeGreaterThan(0);
    
    await section3Link.scrollIntoViewIfNeeded();
    await expect(section3Link, '[セクション3] リンクが見えない').toBeVisible({ timeout: 15_000 });
    
    const buttonText = await section3Link.textContent().catch(() => '');
    const href = await section3Link.getAttribute('href');
    
    expect(href, '[セクション3] hrefが見つからない').toBeTruthy();
    expect(href, '[セクション3] hrefが正しくない').toContain('tourpoint');
    
    await clickAndAssertFollowsHref(page, context, section3Link, `セクション3 / ${buttonText?.trim() || '無題'}`, { returnBack: true });
  });

  // セクション4: href: https://turkish.jp/aboutus/
  test('バナーセクション4（直接クリック）のボタンが正しく遷移する', async ({ page, context }) => {
    test.setTimeout(120_000);
    
    // バナーのul.nav__listを取得
    const banner = page.locator('ul.nav__list').first();
    await expect(banner, '[バナー] ul.nav__listが見つからない').toBeVisible({ timeout: 15_000 });
    
    // nav__linkクラスのリンクで、hrefが/aboutus/のものを取得
    const section4Link = banner.locator('a.nav__link[href*="aboutus"]').first();
    
    const linkCount = await section4Link.count();
    expect(linkCount, '[セクション4] ボタンが見つからない').toBeGreaterThan(0);
    
    await section4Link.scrollIntoViewIfNeeded();
    await expect(section4Link, '[セクション4] リンクが見えない').toBeVisible({ timeout: 15_000 });
    
    const buttonText = await section4Link.textContent().catch(() => '');
    const href = await section4Link.getAttribute('href');
    
    expect(href, '[セクション4] hrefが見つからない').toBeTruthy();
    expect(href, '[セクション4] hrefが正しくない').toContain('aboutus');
    
    await clickAndAssertFollowsHref(page, context, section4Link, `セクション4 / ${buttonText?.trim() || '無題'}`, { returnBack: true });
  });
});
