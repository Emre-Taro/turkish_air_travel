#!/usr/bin/env node

/**
 * Playwrightのテスト結果を解析して、失敗したテストの詳細をYAML形式で出力するスクリプト
 */

const fs = require('fs');
const path = require('path');

// テストファイルとテスト名のマッピング（README.mdに基づく）
const TEST_MAPPING = {
  // WEBテスト
  'web-test/button-web-test/button-web-test.spec.ts': {
    '出発地を選択すると、かんたん検索UI上の表示（◯◯発）が追従する': {
      id: 1,
      name: '出発地を選択すると、かんたん検索UI上の表示（◯◯発）が追従する',
      page: 'https://turkish.jp/',
      description: '羽田発、成田発、関西発、名古屋発、福岡発を選択し、UI表示が追従することを確認'
    },
    '羽田発の人気ランキングカードの「詳細はこちら」「パンフレットはこちら」が正しく遷移する': {
      id: 2,
      name: '羽田発の人気ランキングカードの「詳細はこちら」「パンフレットはこちら」が正しく遷移する',
      page: 'https://turkish.jp/',
      description: '羽田発を選択後、人気ランキングに表示される8個のカードについて、各カードの「詳細はこちら」と「パンフレットはこちら」ボタンが正しいURLに遷移することを確認'
    }
  },
  'web-test/button-web-test/banner-button-test.spec.ts': {
    '左から2つのセクションと5つ目のセクション（hover必要）のボタンが正しく遷移する': {
      id: 3,
      name: '左から2つのセクションと5つ目のセクション（hover必要）のボタンが正しく遷移する',
      page: 'https://turkish.jp/',
      description: 'ページ上部バナーの左から1つ目、2つ目、5つ目（hover必要）のセクションのボタンが正しいURLに遷移することを確認'
    },
    'バナーセクション3（直接クリック）のボタンが正しく遷移する': {
      id: 4,
      name: 'バナーセクション3（直接クリック）のボタンが正しく遷移する',
      page: 'https://turkish.jp/',
      description: 'ページ上部バナーのセクション3（直接クリック可能）のボタンが正しいURLに遷移することを確認'
    },
    'バナーセクション4（直接クリック）のボタンが正しく遷移する': {
      id: 5,
      name: 'バナーセクション4（直接クリック）のボタンが正しく遷移する',
      page: 'https://turkish.jp/',
      description: 'ページ上部バナーのセクション4（直接クリック可能）のボタンが正しいURLに遷移することを確認'
    }
  },
  'web-test/sidebar-web-test/scroll/sidebar-web-test.spec.ts': {
    '右サイドバー：ボタン→スクロールを同一ページで順番に確認': {
      id: 6,
      name: '右サイドバー：ボタン→スクロールを同一ページで順番に確認',
      page: 'https://turkish.jp/',
      description: 'トルコツアー人気ランキング、ターキッシュのこだわり10ポイント、お客様の声満足度97%の3つのアンカーリンクをクリックし、正しい位置にスクロールすることを確認'
    }
  },
  'web-test/sidebar-web-test/jump-page/sidebar-web-jjump-page-test.spec.ts': {
    '「全コース簡単選択」→ overlay が visible になり is-visible が付く': {
      id: 7,
      name: '「全コース簡単選択」→ overlay が visible になり is-visible が付く',
      page: 'https://turkish.jp/',
      description: 'サイドバーの「全コース簡単選択」ボタンをクリックし、オーバーレイが表示されることを確認'
    },
    '外部/別URL遷移ボタン（href一致）→ 最終URLの origin+pathname を検証': {
      id: 8,
      name: '外部/別URL遷移ボタン（href一致）→ 最終URLの origin+pathname を検証',
      page: 'https://turkish.jp/',
      description: '外部/別URL遷移ボタンが正しいURLに遷移することを確認'
    }
  },
  // LPテスト
  'lp_test/button-lp-test/button-lp-test.spec.ts': {
    'ランキングカード内の「パンフレット」「詳細」がhref通りに遷移する': {
      id: 9,
      name: 'ランキングカード内の「パンフレット」「詳細」がhref通りに遷移する',
      page: 'https://turkish.co.jp/special/',
      description: 'ランキングカード内の「パンフレット」と「詳細」ボタンが正しいURLに遷移することを確認'
    },
    'ランキングカード下の追加リンクが正しく遷移する': {
      id: 10,
      name: 'ランキングカード下の追加リンクが正しく遷移する',
      page: 'https://turkish.co.jp/special/',
      description: 'ランキングカード下の追加リンク（成田発ツアー一覧、ビジネスクラス、ANA就航記念キャンペーン等）が正しいURLに遷移することを確認'
    }
  },
  'lp_test/sidebar-lp-test/sidebar-lp-test.spec.ts': {
    'LP右サイドバー：ボタン→スクロールを同一ページで順番に確認': {
      id: 11,
      name: 'LP右サイドバー：ボタン→スクロールを同一ページで順番に確認',
      page: 'https://turkish.co.jp/special/',
      description: 'サイドバーリンク（13項目）をクリックし、正しい位置にスクロールすることを確認'
    }
  },
  'lp_test/sidebar-lp-test/sidebar-lp-other-airport-test.spec.ts': {
    '関西発、名古屋発、福岡発ボタンが正しいURLに遷移する': {
      id: 12,
      name: '関西発、名古屋発、福岡発ボタンが正しいURLに遷移する',
      page: 'https://turkish.co.jp/special/',
      description: 'ランキングセクション下部の出発地ボタン（関空発、名古屋発、福岡発）が正しいURLに遷移することを確認'
    },
    '関西発ページのサイドバーが正常にスクロールする': {
      id: 13,
      name: '関西発ページのサイドバーが正常にスクロールする',
      page: 'https://turkish.co.jp/special-k/',
      description: '関西発ページのサイドバーリンク（13項目）をクリックし、正しい位置にスクロールすることを確認'
    },
    '名古屋発ページのサイドバーが正常にスクロールする': {
      id: 14,
      name: '名古屋発ページのサイドバーが正常にスクロールする',
      page: 'https://turkish.co.jp/special-n/',
      description: '名古屋発ページのサイドバーリンク（13項目）をクリックし、正しい位置にスクロールすることを確認'
    },
    '福岡発ページのサイドバーが正常にスクロールする': {
      id: 15,
      name: '福岡発ページのサイドバーが正常にスクロールする',
      page: 'https://turkish.jp/special-f/',
      description: '福岡発ページのサイドバーリンク（9項目）をクリックし、正しい位置にスクロールすることを確認'
    }
  }
};

function escapeYamlString(str) {
  if (!str) return '';
  // YAML文字列のエスケープ
  return str
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '');
}

function findTestInfo(filePath, testTitle, specTitle) {
  // ファイルパスを正規化（相対パスで比較）
  const normalizedPath = filePath.replace(/\\/g, '/').replace(/^\.\//, '');
  const fileName = path.basename(normalizedPath);
  
  // test.describeブロックのタイトルを除去
  // PlaywrightのJSONレポートは "describe > test" や "describe › test" 形式で出力されることがある
  let cleanTitle = testTitle || '';
  
  // 区切り文字 > と › の両方を処理
  if (cleanTitle.includes(' > ') || cleanTitle.includes(' › ')) {
    const parts = cleanTitle.split(/\s*[>›]\s*/);
    cleanTitle = parts[parts.length - 1] || ''; // 最後の部分が実際のテスト名
  }
  
  // testTitleが空の場合は部分一致をしない（誤爆を防ぐ）
  const hasValidTitle = cleanTitle && cleanTitle.length > 0;
  
  // 1. 完全一致を試す（ファイルパスとテストタイトルの完全一致）
  if (TEST_MAPPING[normalizedPath]) {
    if (TEST_MAPPING[normalizedPath][testTitle]) {
      return TEST_MAPPING[normalizedPath][testTitle];
    }
    if (cleanTitle && TEST_MAPPING[normalizedPath][cleanTitle]) {
      return TEST_MAPPING[normalizedPath][cleanTitle];
    }
    // spec.titleとの組み合わせも試す
    if (specTitle && TEST_MAPPING[normalizedPath][specTitle]) {
      return TEST_MAPPING[normalizedPath][specTitle];
    }
  }
  
  // 2. ファイル名でマッチして、テストタイトルで完全一致を試す
  for (const [key, tests] of Object.entries(TEST_MAPPING)) {
    const keyFileName = path.basename(key);
    if (keyFileName === fileName || key.endsWith(fileName) || normalizedPath.endsWith(key)) {
      // 完全一致を試す
      if (testTitle && tests[testTitle]) {
        return tests[testTitle];
      }
      if (cleanTitle && tests[cleanTitle]) {
        return tests[cleanTitle];
      }
      // spec.titleとの組み合わせも試す
      if (specTitle && tests[specTitle]) {
        return tests[specTitle];
      }
      
      // 部分一致を試す（testTitleが空でない場合のみ）
      if (hasValidTitle) {
        for (const [title, info] of Object.entries(tests)) {
          // より厳密な部分一致：両方が空でない、かつ適度に長い場合のみ
          if (title && title.length > 3) {
            // testTitleまたはcleanTitleがtitleを含む場合のみ（逆はしない）
            if (testTitle && testTitle.length > 3 && testTitle.includes(title)) {
              return info;
            }
            if (cleanTitle && cleanTitle.length > 3 && cleanTitle.includes(title)) {
              return info;
            }
            // specTitleとの組み合わせも試す
            if (specTitle && specTitle.length > 3 && specTitle.includes(title)) {
              return info;
            }
          }
        }
      }
    }
  }
  
  return null;
}

function parseTestResults() {
  const resultsPath = process.argv[2] || 'test-results.json';
  
  if (!fs.existsSync(resultsPath)) {
    // ファイルがない場合は空の結果を返す
    return {
      yaml: 'failed_tests:\n  []\n\ntotal_failed: 0\ntotal_tests: 15\n',
      failedTests: []
    };
  }

  const results = JSON.parse(fs.readFileSync(resultsPath, 'utf-8'));
  const failedTests = [];

  // PlaywrightのJSONレポート形式に基づいて解析
  // 形式: { config: {...}, suites: [{ specs: [{ tests: [{ results: [...] }] }] }] }
  function processSuites(suites) {
    for (const suite of suites || []) {
      // 再帰的にサブスイートを処理
      if (suite.suites) {
        processSuites(suite.suites);
      }
      
      // スペックを処理
      for (const spec of suite.specs || []) {
        const specTitle = spec.title || '';
        for (const test of spec.tests || []) {
          if (test.results && test.results.some(r => r.status === 'failed' || r.status === 'timedOut')) {
            const filePath = spec.file || '';
            const testTitle = test.title || '';
            
            // テストマッピングから情報を取得（spec.titleも併用）
            const testInfo = findTestInfo(filePath, testTitle, specTitle);

            // 失敗した結果を取得（最新の失敗結果を使用）
            const failedResult = test.results.find(r => r.status === 'failed' || r.status === 'timedOut');
            const errorMessage = failedResult?.error?.message || failedResult?.error?.value || 'Unknown error';
            const errorLocation = failedResult?.error?.location?.file 
              ? `${path.basename(failedResult.error.location.file)}:${failedResult.error.location.line || '?'}:${failedResult.error.location.column || '?'}`
              : '';

            // 失敗したステップを取得
            const failedSteps = [];
            if (failedResult?.error?.snippet) {
              failedSteps.push(failedResult.error.snippet.trim());
            }

            failedTests.push({
              id: testInfo?.id || '?',
              name: testInfo?.name || testTitle,
              page: testInfo?.page || 'Unknown',
              description: testInfo?.description || '',
              error: errorMessage,
              location: errorLocation,
              file: path.basename(filePath),
              steps: failedSteps,
              duration: failedResult?.duration || 0
            });
          }
        }
      }
    }
  }

  // ルートレベルから処理開始
  processSuites(results.suites || []);

  // YAML形式で出力
  let yaml = 'failed_tests:\n';
  
  if (failedTests.length === 0) {
    yaml += '  []\n';
  } else {
    for (const test of failedTests) {
      yaml += `  - id: ${test.id}\n`;
      yaml += `    name: "${escapeYamlString(test.name)}"\n`;
      yaml += `    page: "${escapeYamlString(test.page)}"\n`;
      yaml += `    description: "${escapeYamlString(test.description)}"\n`;
      yaml += `    error: "${escapeYamlString(test.error.substring(0, 500))}"\n`; // エラーメッセージを500文字に制限
      if (test.location) {
        yaml += `    location: "${escapeYamlString(test.location)}"\n`;
      }
      yaml += `    file: "${escapeYamlString(test.file)}"\n`;
      if (test.steps && test.steps.length > 0) {
        yaml += `    steps:\n`;
        for (const step of test.steps) {
          // ステップも長すぎる場合は切り詰める
          const stepText = step.substring(0, 200);
          yaml += `      - "${escapeYamlString(stepText)}"\n`;
        }
      }
    }
  }

  yaml += `\ntotal_failed: ${failedTests.length}\n`;
  yaml += `total_tests: 15\n`;

  return { yaml, failedTests };
}

try {
  const { yaml: yamlOutput, failedTests } = parseTestResults();
  
  // 標準出力にYAMLを出力（ワークフローでリダイレクトされる）
  process.stdout.write(yamlOutput);
  
  // デバッグ情報は標準エラー出力に（YAMLファイルには含めない）
  process.stderr.write(`Test failures written: ${failedTests.length} failed tests\n`);
  
  // 終了コードは0（成功）を返す（ワークフローでは既に失敗判定されているため）
  process.exit(0);
} catch (error) {
  // エラーが発生した場合でも空のYAMLを出力
  const emptyYaml = 'failed_tests:\n  []\n\ntotal_failed: 0\ntotal_tests: 15\n';
  process.stdout.write(emptyYaml);
  process.stderr.write(`Error parsing test results: ${error.message}\n`);
  process.exit(1);
}

