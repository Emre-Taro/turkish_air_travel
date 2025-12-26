import { test, expect, Page, BrowserContext } from '@playwright/test';

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
      // ポップアップ本体を消す
      document.querySelectorAll('[data-ttr="ep"]').forEach((el) => el.remove());
      // ついでに backdrop が残ってクリックを邪魔するのも消す
      document.querySelectorAll('[data-ttr="backdrop"]').forEach((el) => el.remove());
    };
    // 初回
    kill();
    // 生成監視
    new MutationObserver(kill).observe(document.documentElement, { childList: true, subtree: true });
    // 念のため定期実行も（稀にobserver前に挿入されるケース対策）
    setInterval(kill, 300);
  });
}

async function dismissAdvertisements(page: Page) {
  // 開発者ツールで確認されたポップアップ構造に基づく確実な閉じる処理
  // 閉じるボタン: <x-t data-ttr="dismiss" data-ttr-dismiss aria-label="このお知らせを消す">
  // ポップアップコンテナ: <x-t data-ttr="ep">
  
  // まずポップアップが存在するか確認
  const popupContainer = page.locator('[data-ttr="ep"]').first();
  const popupExists = await popupContainer.count().catch(() => 0);
  
  if (popupExists === 0) {
    // ポップアップが存在しない場合は何もしない
    return;
  }
  
  // ポップアップが見えるまで少し待つ
  await page.waitForTimeout(500);
  
  // 方法1: data-ttr-dismiss属性で探す（カスタム要素の場合）
  try {
    const dismissButton = page.locator('[data-ttr-dismiss]').first();
    const dismissCount = await dismissButton.count();
    if (dismissCount > 0) {
      // 要素が表示されるまで待つ
      await dismissButton.waitFor({ state: 'visible', timeout: 3_000 }).catch(() => {});
      const isVisible = await dismissButton.isVisible().catch(() => false);
      if (isVisible) {
        // スクロールしてからクリック
        await dismissButton.scrollIntoViewIfNeeded();
        await page.waitForTimeout(200);
        await dismissButton.click({ timeout: 3_000 }).catch(() => {
          // 通常のクリックが失敗した場合、forceでクリック
          dismissButton.click({ force: true, timeout: 3_000 }).catch(() => {});
        });
        await page.waitForTimeout(500);
        // ポップアップが消えたか確認
        const stillExists = await popupContainer.count().catch(() => 1);
        if (stillExists === 0) {
          return; // ポップアップが閉じられた
        }
      }
    }
  } catch (e) {
    // エラーが発生した場合は次の方法を試す
  }
  
  // 方法2: data-ttr="dismiss" 属性で直接探す
  try {
    const dismissButton2 = page.locator('[data-ttr="dismiss"]').first();
    const dismissCount2 = await dismissButton2.count();
    if (dismissCount2 > 0) {
      await dismissButton2.waitFor({ state: 'visible', timeout: 3_000 }).catch(() => {});
      const isVisible = await dismissButton2.isVisible().catch(() => false);
      if (isVisible) {
        await dismissButton2.scrollIntoViewIfNeeded();
        await page.waitForTimeout(200);
        await dismissButton2.click({ timeout: 3_000 }).catch(() => {
          dismissButton2.click({ force: true, timeout: 3_000 }).catch(() => {});
        });
        await page.waitForTimeout(500);
        const stillExists = await popupContainer.count().catch(() => 1);
        if (stillExists === 0) {
          return;
        }
      }
    }
  } catch {
    // エラーが発生した場合は次の方法を試す
  }
  
  // 方法3: aria-labelで探す
  try {
    const dismissByLabel = page.locator('[aria-label="このお知らせを消す"]').first();
    const labelCount = await dismissByLabel.count();
    if (labelCount > 0) {
      await dismissByLabel.waitFor({ state: 'visible', timeout: 3_000 }).catch(() => {});
      const isVisible = await dismissByLabel.isVisible().catch(() => false);
      if (isVisible) {
        await dismissByLabel.scrollIntoViewIfNeeded();
        await page.waitForTimeout(200);
        await dismissByLabel.click({ timeout: 3_000 }).catch(() => {
          dismissByLabel.click({ force: true, timeout: 3_000 }).catch(() => {});
        });
        await page.waitForTimeout(500);
        return;
      }
    }
  } catch {
    // エラーが発生した場合は次の方法を試す
  }
  
  // 方法4: ポップアップコンテナ内の閉じるボタンを探す
  try {
    const dismissInPopup = popupContainer.locator('[data-ttr-dismiss], [data-ttr="dismiss"]').first();
    const dismissCount3 = await dismissInPopup.count();
    if (dismissCount3 > 0) {
      await dismissInPopup.waitFor({ state: 'visible', timeout: 3_000 }).catch(() => {});
      const isVisible = await dismissInPopup.isVisible().catch(() => false);
      if (isVisible) {
        await dismissInPopup.scrollIntoViewIfNeeded();
        await page.waitForTimeout(200);
        await dismissInPopup.click({ timeout: 3_000 }).catch(() => {
          dismissInPopup.click({ force: true, timeout: 3_000 }).catch(() => {});
        });
        await page.waitForTimeout(500);
        return;
      }
    }
  } catch {
    // エラーが発生した場合は次の方法を試す
  }
  
  // 方法5: JavaScriptで直接クリック（カスタム要素の場合に有効）
  try {
    await page.evaluate(() => {
      const dismissButton = document.querySelector('[data-ttr-dismiss]') || document.querySelector('[data-ttr="dismiss"]');
      if (dismissButton && dismissButton instanceof HTMLElement) {
        dismissButton.click();
        return true;
      }
      return false;
    });
    await page.waitForTimeout(500);
    const stillExists = await popupContainer.count().catch(() => 1);
    if (stillExists === 0) {
      return; // ポップアップが閉じられた
    }
  } catch {
    // エラーが発生した場合は次の方法を試す
  }
  
  // 方法6: ESCキーを押す（フォールバック）
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(500);
  
  // 広告の閉じるボタンを探して閉じる（より積極的に）
  const adSelectors = [
    '[class*="close"]',
    '[class*="ad-close"]',
    '[class*="modal-close"]',
    '[class*="popup-close"]',
    '[class*="banner-close"]',
    '[id*="close"]',
    '[id*="Close"]',
    '[aria-label*="閉じる"]',
    '[aria-label*="Close"]',
    'button:has-text("×")',
    'button:has-text("✕")',
    'button:has-text("閉じる")',
    '.close-button',
    '.ad-close-button',
    '.modal-close-button',
  ];
  
  // 最大10回試行
  for (let attempt = 0; attempt < 10; attempt++) {
    let foundAny = false;
    
    for (const selector of adSelectors) {
      try {
        const closeBtns = page.locator(selector);
        const count = await closeBtns.count();
        for (let i = 0; i < Math.min(count, 5); i++) {
          const closeBtn = closeBtns.nth(i);
          const isVisible = await closeBtn.isVisible().catch(() => false);
          if (isVisible) {
            foundAny = true;
            await closeBtn.click({ timeout: 1_000, force: true }).catch(() => {});
            await page.waitForTimeout(300);
          }
        }
      } catch {
        // スキップ
      }
    }
    
    // 広告が見つからない場合は終了
    if (!foundAny) {
      break;
    }
    
    await page.waitForTimeout(500);
  }
  
  // iframe広告を閉じる
  const iframes = page.locator('iframe');
  const iframeCount = await iframes.count();
  for (let i = 0; i < Math.min(iframeCount, 10); i++) {
    try {
      const iframe = iframes.nth(i);
      let frame = null;
      try {
        frame = await iframe.contentFrame();
      } catch {
        // iframeが取得できない場合はスキップ
      }
      if (frame) {
        try {
          const closeBtn = frame.locator('[class*="close"], [aria-label*="閉じる"], [aria-label*="Close"], button').first();
          const btnCount = await closeBtn.count();
          if (btnCount > 0) {
            const isVisible = await closeBtn.isVisible().catch(() => false);
            if (isVisible) {
              await closeBtn.click({ timeout: 1_000, force: true }).catch(() => {});
            }
          }
        } catch {
          // スキップ
        }
      }
    } catch {
      // スキップ
    }
  }
  
  // オーバーレイやモーダルを閉じる（ESCキーや背景クリック）
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(300);
  
  // 背景クリックでモーダルを閉じる試行
  try {
    const modal = page.locator('[class*="modal"], [class*="overlay"], [class*="popup"]').first();
    const modalCount = await modal.count();
    if (modalCount > 0 && await modal.isVisible().catch(() => false)) {
      // モーダルの背景をクリック
      const box = await modal.boundingBox().catch(() => null);
      if (box) {
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      }
    }
  } catch {
    // スキップ
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
    await dismissAdvertisements(page);
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
      
      // ドロップダウンメニュー内のボタン（リンク）を取得
      // 構造: ul.nav_slist--noflx > li.nav_sitem--sm > a.nav_slink_ni
      const buttons1 = dropdown1.locator('a[href]');
      const buttonCount1 = await buttons1.count();
      
      expect(buttonCount1, '[セクション1] ボタンが見つからない').toBeGreaterThan(0);
      expect(buttonCount1, '[セクション1] ボタン24個あることを確認').toBeGreaterThanOrEqual(24);
      
      // 全てのボタン（24個）をクリックして遷移を確認
      for (let i = 0; i < Math.min(buttonCount1, 24); i++) {
        const button = buttons1.nth(i);
        const buttonText = await button.textContent().catch(() => '');
        const href = await button.getAttribute('href');
        
        if (href) {
          await test.step(`セクション1 / ボタン${i + 1} (${buttonText?.trim() || '無題'})`, async () => {
            await clickAndAssertFollowsHref(page, context, button, `セクション1 / ボタン${i + 1}`, { returnBack: true });
            
            // 戻ったら再度hoverする必要がある
            await section1.hover({ timeout: 15_000 });
            await page.waitForTimeout(300);
          });
        }
      }
    });
    
    // セクション2のhoverテストとボタンクリック
    await test.step('セクション2（左から2つ目）のボタンをクリック', async () => {
      // セクション1からマウスを離す
      await page.mouse.move(0, 0);
      await page.waitForTimeout(500);
      
      // 広告を非表示にして、ページの状態をリセット
      await dismissAdvertisements(page);
      await page.waitForTimeout(300);
      
      // ページを再読み込みして状態をリセット（セクション1のテストで多くの遷移があったため）
      await page.reload({ waitUntil: 'domcontentloaded' });
      await dismissSpcOverlay(page);
      await dismissAdvertisements(page);
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
      
      // 広告が表示されていないことを確認
      await dismissAdvertisements(page);
      await page.waitForTimeout(300);
      
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
