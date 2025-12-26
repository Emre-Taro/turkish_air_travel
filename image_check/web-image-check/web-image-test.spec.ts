import { test, expect } from '@playwright/test';

const WEB_URL = 'https://turkish.jp/';

test('画像が正しく表示されている', async ({ page }) => {
  test.setTimeout(120000); // テスト全体のタイムアウトを2分に延長

  await page.goto(WEB_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {}); // ネットワークが安定するまで待つ

  // 全画像情報を一括取得（1回のevaluateで高速）
  const results = await page.evaluate(() => {
    const isTracking = (u: string) =>
      /bat\.bing\.com\/action\/0|google-analytics|googletagmanager|doubleclick/i.test(u);

    return Array.from(document.images).map((img) => {
      const src = img.currentSrc || img.getAttribute('src') || '';
      const rect = img.getBoundingClientRect();

      // srcが空の場合は除外（検証対象外）
      if (!src || src.trim() === '') {
        return { skip: 'emptySrc', src: '' };
      }

      // 計測系は除外
      if (isTracking(src)) {
        return { skip: 'tracking', src };
      }

      // レンダリングされていない（boundingBox === null相当）
      if (rect.width === 0 && rect.height === 0) {
        return { skip: 'notRendered', src };
      }

      // 表示サイズ0は除外（トラッキングピクセル等）
      if (rect.width === 0 || rect.height === 0) {
        return { skip: 'zeroSize', src };
      }

      return {
        src,
        loaded: img.complete && img.naturalWidth > 0,
      };
    });
  });

  expect(results.length, '画像が1件以上ある想定').toBeGreaterThan(0);

  // Node側で集計
  const checked = results.filter((r) => !r.skip);
  const failed = checked.filter((r) => !r.loaded);

  // 統計情報を集計
  const loadedCount = checked.filter((r) => r.loaded).length;
  const failedCount = failed.length;
  const skippedNotRendered = results.filter((r) => r.skip === 'notRendered').length;
  const skippedZeroSize = results.filter((r) => r.skip === 'zeroSize').length;
  const skippedTracking = results.filter((r) => r.skip === 'tracking').length;
  const skippedEmptySrc = results.filter((r) => r.skip === 'emptySrc').length;
  const totalSkipped = skippedNotRendered + skippedZeroSize + skippedTracking + skippedEmptySrc;

  // 統計情報を表示
  const totalChecked = loadedCount + failedCount;
  const successRate = totalChecked > 0 ? ((loadedCount / totalChecked) * 100).toFixed(2) : '0.00';

  console.log('\n=== 画像ロード検証結果 ===');
  console.log(`総画像数: ${results.length}`);
  console.log(`検証対象: ${totalChecked}件`);
  console.log(`✅ 正常に読み込めた: ${loadedCount}件`);
  console.log(`❌ 読み込み失敗: ${failedCount}件`);
  console.log(`📊 成功率: ${successRate}%`);
  console.log(`\nスキップ詳細:`);
  console.log(`  - レンダリングされていない（display:none等）: ${skippedNotRendered}件`);
  console.log(`  - 表示サイズ0（トラッキングピクセル等）: ${skippedZeroSize}件`);
  console.log(`  - 計測系（Google Analytics等）: ${skippedTracking}件`);
  console.log(`  - srcが空: ${skippedEmptySrc}件`);
  console.log(`  - 合計スキップ: ${totalSkipped}件`);
  if (failed.length > 0) {
    console.log(`\n読み込み失敗した画像:`);
    failed.forEach((f) => {
      console.log(`  - ${f.src}`);
    });
  }
  console.log('========================\n');

  // 最終アサーション：失敗がある場合はエラー
  expect(
    failedCount,
    `読み込み失敗した画像が${failedCount}件あります:\n${failed.map((f) => f.src).join('\n')}`
  ).toBe(0);
});


test('画像が正しい縦横比で表示されている', async ({ page }) => {
  test.setTimeout(120000); // テスト全体のタイムアウトを2分に延長

  await page.goto(WEB_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {}); // ネットワークが安定するまで待つ

  // lazyloadを強制的に解除（data-lazy-src等をsrcに設定）
  await page.evaluate(() => {
    document.querySelectorAll('img').forEach((img) => {
      const real =
        img.getAttribute('data-lazy-src') ||
        img.getAttribute('data-src') ||
        img.getAttribute('data-original');

      if (real && img.getAttribute('src') !== real) {
        img.setAttribute('src', real);
      }
    });
  });

  // src差し替え後に画像のロード完了を待つ
  await page.evaluate(async () => {
    const imgs = Array.from(document.images);
    await Promise.all(
      imgs.map((img) => {
        if (img.complete) return Promise.resolve();
        return new Promise<void>((resolve) => {
          img.addEventListener('load', () => resolve(), { once: true });
          img.addEventListener('error', () => resolve(), { once: true });
        });
      })
    );
  });

  // ネットワークが安定するまで待つ
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});

  // 全画像情報を一括取得（1回のevaluateで高速）
  const imgs = await page.evaluate(() => {
    const isTracking = (u: string) =>
      /bat\.bing\.com\/action\/0|google-analytics\.com|googletagmanager\.com|doubleclick\.net/i.test(u);

    return Array.from(document.images).map((el) => {
      const cs = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      const src = el.currentSrc || el.getAttribute('src') || '';
      return {
        src,
        loaded: el.complete && el.naturalWidth > 0,
        naturalW: el.naturalWidth,
        naturalH: el.naturalHeight,
        boxW: rect.width,
        boxH: rect.height,
        objectFit: cs.objectFit || 'fill',
        isPlaceholder: src.startsWith('data:image/svg+xml'),
        isTracking: isTracking(src),
      };
    });
  });

  expect(imgs.length, '画像が1件以上ある想定').toBeGreaterThan(0);

  // 統計情報を集計
  let validCount = 0; // 正常な縦横比の数
  let invalidCount = 0; // 縦横比が許容範囲を超えた数
  let notApplicableCount = 0; // object-fit: cover/contain/scale-down（検証対象外）
  let skippedNotLoaded = 0; // ロードされていないでスキップ
  let skippedByReason = 0; // その他の理由でスキップ（自然サイズ0など）
  let skippedZeroSize = 0; // 表示サイズ0でスキップ（トラッキングピクセル等）
  let skippedTracking = 0; // 計測系でスキップ
  let skippedPlaceholder = 0; // プレースホルダー（data:image/svg+xml）でスキップ
  let skippedDuplicate = 0; // 重複URLでスキップ

  const seenUrls = new Set<string>(); // 重複チェック用
  const checkedUrls: string[] = []; // 検証対象になった画像のURLリスト

  // Node側でフィルタリング・集計（高速）
  for (let i = 0; i < imgs.length; i++) {
    const info = imgs[i];

    // 1) 計測系は除外
    if (info.isTracking) {
      skippedTracking++;
      continue;
    }

    // 2) プレースホルダー（data:image/svg+xml）は除外
    if (info.isPlaceholder) {
      skippedPlaceholder++;
      continue;
    }

    // 3) 重複URLの除外
    if (info.src && seenUrls.has(info.src)) {
      skippedDuplicate++;
      continue;
    }
    if (info.src) {
      seenUrls.add(info.src);
    }

    // 4) 表示サイズ0は除外（トラッキングピクセル等）
    if (info.boxW === 0 || info.boxH === 0) {
      skippedZeroSize++;
      continue;
    }

    // 5) ロードされていない画像はスキップ
    if (!info.loaded) {
      skippedNotLoaded++;
      continue;
    }

    // 6) 自然なサイズが0の場合はスキップ
    if (info.naturalW === 0 || info.naturalH === 0) {
      skippedByReason++;
      continue;
    }

    // 7) cover/contain/scale-down は「枠とARが一致しないのが正常」なのでNGにしない
    if (['cover', 'contain', 'scale-down'].includes(info.objectFit)) {
      notApplicableCount++;
      continue;
    }

    // 8) fill（長体が起きうる）だけARチェック
    const naturalAR = info.naturalW / info.naturalH;
    const boxAR = info.boxW / info.boxH;
    const relDiff = Math.abs(naturalAR - boxAR) / naturalAR;

    // 検証対象になった画像のURLを記録
    checkedUrls.push(info.src);

    // 許容誤差を0.05（5%）に設定
    if (relDiff > 0.05) {
      invalidCount++;
      // 縦横比エラーの詳細情報を出力
      console.log(`\n[縦横比エラー] 画像${i + 1}:`);
      console.log(`  URL: ${info.src}`);
      console.log(`  自然サイズ: ${info.naturalW}x${info.naturalH}`);
      console.log(`  表示サイズ: ${info.boxW}x${info.boxH}`);
      console.log(`  自然な縦横比: ${naturalAR.toFixed(4)}`);
      console.log(`  表示の縦横比: ${boxAR.toFixed(4)}`);
      console.log(`  相対誤差: ${(relDiff * 100).toFixed(2)}%`);
      console.log(`  object-fit: ${info.objectFit}`);
    } else {
      validCount++;
    }
  }

  // 統計情報を表示
  const totalChecked = validCount + invalidCount;
  const totalSkipped = skippedNotLoaded + skippedByReason + skippedZeroSize + skippedTracking + skippedPlaceholder + skippedDuplicate;
  const successRate = totalChecked > 0 ? ((validCount / totalChecked) * 100).toFixed(2) : '0.00';

  console.log('\n=== 画像縦横比検証結果 ===');
  console.log(`総画像数: ${imgs.length}`);
  console.log(`検証対象: ${totalChecked}件`);
  console.log(`✅ 正常な縦横比: ${validCount}件`);
  console.log(`❌ 縦横比エラー: ${invalidCount}件`);
  console.log(`📊 成功率: ${successRate}%`);
  console.log(`\nスキップ詳細:`);
  console.log(`  - ロード未完了: ${skippedNotLoaded}件`);
  console.log(`  - 表示サイズ0（トラッキングピクセル等）: ${skippedZeroSize}件`);
  console.log(`  - 計測系（Google Analytics等）: ${skippedTracking}件`);
  console.log(`  - プレースホルダー（data:image/svg+xml）: ${skippedPlaceholder}件`);
  console.log(`  - 重複URL: ${skippedDuplicate}件`);
  console.log(`  - その他: ${skippedByReason}件`);
  console.log(`  - 合計スキップ: ${totalSkipped}件`);
  console.log(`\n検証対象外（object-fit: cover/contain/scale-down）: ${notApplicableCount}件`);
  if (checkedUrls.length > 0) {
    console.log(`\n検証対象になった画像 (${checkedUrls.length}件):`);
    checkedUrls.forEach((url, idx) => {
      console.log(`  ${idx + 1}. ${url}`);
    });
  }
  console.log('========================\n');

  // 最終アサーション：縦横比エラーがある場合はエラー
  expect(invalidCount, `縦横比が許容範囲を超えた画像が${invalidCount}件あります`).toBe(0);
});

