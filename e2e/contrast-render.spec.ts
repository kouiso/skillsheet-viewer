import { expect, type Page, test } from '@playwright/test';
import { contrastRatio, readContrastColors } from './contrast';
import { hasStableOpaquePaint } from './paint-stability';

// ブラウザ自身にスクリーンショットPNGをデコードさせ、CSS計算とは独立に実画素を読む。
async function screenshotPixel(page: Page, x: number, y: number) {
  const png = [...(await page.screenshot())];
  return page.evaluate(
    async ({ bytes, x, y }) => {
      const image = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: 'image/png' }));
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('PNG画素検証用Canvasを作成できません');
      ctx.drawImage(image, 0, 0);
      image.close();
      return [...ctx.getImageData(x, y, 1, 1).data];
    },
    { bytes: png, x, y },
  );
}

// DB・認証なしの合成DOMで計測器自体を検証する。期待色はCSSの群合成から独立に固定。
test.use({ storageState: { cookies: [], origins: [] } });

for (const [backdrop, foreground, background, expectedText, expectedBackground] of [
  ['black', 'black', 'white', 0, 127.5],
  ['white', 'white', 'black', 255, 127.5],
] as const) {
  test(`群 opacity は文字と背景を一度だけ合成する: ${backdrop}`, async ({ page }) => {
    await page.setContent(
      `<body style="background:${backdrop}"><div style="opacity:.5;background:${background};color:${foreground}"><span>合成文字</span></div></body>`,
    );
    const result = await page.evaluate(readContrastColors, undefined);
    expect(result.unsupported).toEqual([]);
    expect(result.samples).toHaveLength(1);
    expect(result.samples[0].color).toEqual([expectedText, expectedText, expectedText, 1]);
    expect(result.samples[0].background).toEqual([expectedBackground, expectedBackground, expectedBackground, 1]);
  });
}

test('親子双方の opacity と子の不透明背景を合成する', async ({ page }) => {
  await page.setContent(
    '<body style="background:black"><div style="opacity:.5;background:red"><span style="display:block;opacity:.5;background:white;color:black">合成文字</span></div></body>',
  );
  const result = await page.evaluate(readContrastColors, undefined);
  expect(result.unsupported).toEqual([]);
  expect(result.samples[0].color).toEqual([63.75, 0, 0, 1]);
  expect(result.samples[0].background).toEqual([127.5, 63.75, 63.75, 1]);
});

test('半透明の入力境界を不透明な黒として合格させない', async ({ page }) => {
  await page.setContent(
    '<body style="background:white"><div style="opacity:.5"><div id="control" style="opacity:.4;border:5px solid black;background:white;padding:20px">入力欄</div></div></body>',
  );
  const result = await page.locator('#control').evaluate(readContrastColors);
  expect(result.unsupported).toEqual([]);
  expect(result.background).toEqual([255, 255, 255, 1]);
  // bodyの既定margin 8px + 5px境界。文字と交差しない左上の境界・内側を読む。
  const paintedBorder = await screenshotPixel(page, 10, 10);
  for (const channel of paintedBorder.slice(0, 3)) expect(Math.abs(channel - 204)).toBeLessThanOrEqual(1);
  expect(await screenshotPixel(page, 16, 16)).toEqual([255, 255, 255, 255]);
  for (const border of result.borders) {
    expect(border.color).toEqual([204, 204, 204, 1]);
    if (!border.color || !result.background) throw new Error('境界色が取得できません');
    expect(contrastRatio(border.color, result.background)).toBeLessThan(3);
  }
});

test('境界色自身の alpha とグループ opacity をそれぞれ適用する', async ({ page }) => {
  await page.setContent(
    '<body style="background:black"><div id="control" style="opacity:.5;border:5px solid rgb(0 0 0 / 50%);background:white;padding:20px">入力欄</div></body>',
  );
  const result = await page.locator('#control').evaluate(readContrastColors);
  expect(result.unsupported).toEqual([]);
  expect(result.background).toEqual([127.5, 127.5, 127.5, 1]);
  // Canvasの8bit alpha(128/255)での丸めを含む期待値。
  expect(result.borders[0].color?.[0]).toBeCloseTo(63.5, 1);
  const borderPixel = await screenshotPixel(page, 10, 10);
  const backgroundPixel = await screenshotPixel(page, 16, 16);
  expect(Math.abs(borderPixel[0] - (result.borders[0].color?.[0] ?? -999))).toBeLessThanOrEqual(1);
  expect(Math.abs(backgroundPixel[0] - (result.background?.[0] ?? -999))).toBeLessThanOrEqual(1);
});

for (const image of [
  'linear-gradient(white, black)',
  'url("data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22/%3E")',
]) {
  test(`描画背景を計測できない場合は明示する: ${image.slice(0, 15)}`, async ({ page }) => {
    await page.setContent(`<body><div style='background-image:${image};color:black'>未対応背景</div></body>`);
    const result = await page.evaluate(readContrastColors, undefined);
    expect(result.samples).toHaveLength(0);
    expect(result.unsupported).toHaveLength(1);
    expect(result.unsupported[0].reason).toContain('background-image');
  });
}

test('不透明な子が隠す祖先のグラデーションは計測を妨げない', async ({ page }) => {
  await page.setContent(
    '<body style="background:black"><div style="opacity:.5;background:linear-gradient(red, blue)"><span style="display:block;background:white;color:black">不透明な子</span></div></body>',
  );
  const result = await page.evaluate(readContrastColors, undefined);
  expect(result.unsupported).toEqual([]);
  expect(result.samples[0].color).toEqual([0, 0, 0, 1]);
  expect(result.samples[0].background).toEqual([127.5, 127.5, 127.5, 1]);
});

test('自身の不透明な背景に隠れる背景ぼかしは計測を妨げない', async ({ page }) => {
  await page.setContent('<div style="background:white;backdrop-filter:blur(8px);color:black">不透明面</div>');
  const result = await page.evaluate(readContrastColors, undefined);
  expect(result.unsupported).toEqual([]);
  expect(result.samples).toHaveLength(1);
  expect(contrastRatio(result.samples[0].color, result.samples[0].background)).toBe(21);
});

test('ゼロ面積clipの読み上げ専用文字を可視文字として計測しない', async ({ page }) => {
  await page.setContent(
    '<div style="position:absolute;clip:rect(0,0,0,0);overflow:hidden;width:1px;height:1px;color:white;background:white"><span>読み上げ専用</span></div><p style="background:white;color:black">可視本文</p>',
  );
  const result = await page.evaluate(readContrastColors, undefined);
  expect(result.unsupported).toEqual([]);
  expect(result.samples.map((s) => s.text)).toEqual(['可視本文']);
});

test('clipが作用しないstatic要素の可視文字は除外しない', async ({ page }) => {
  await page.setContent('<div style="clip:rect(0,0,0,0);color:white;background:white">可視の低コントラスト文字</div>');
  const result = await page.evaluate(readContrastColors, undefined);
  expect(result.samples).toHaveLength(1);
  expect(contrastRatio(result.samples[0].color, result.samples[0].background)).toBe(1);
});

for (const [label, markup] of [
  ['text-fill-color', '<p style="color:black;-webkit-text-fill-color:white;background:white">実際の字色</p>'],
  ['display:contents', '<div style="display:contents;color:#eee">ボックスなしの可視文字</div>'],
  ['aria-hidden', '<p aria-hidden="true" style="color:white;background:white">可視文字</p>'],
]) {
  test(`可視グリフの低コントラストを見逃さない: ${label}`, async ({ page }) => {
    await page.setContent(`<body style="background:white">${markup}</body>`);
    const result = await page.evaluate(readContrastColors, undefined);
    expect(result.unsupported).toEqual([]);
    expect(result.samples).toHaveLength(1);
    expect(contrastRatio(result.samples[0].color, result.samples[0].background)).toBeLessThan(1.2);
  });
}

for (const hiddenStyle of ['display:none', 'opacity:0']) {
  test(`display:contentsの文字も非表示の祖先では除外する: ${hiddenStyle}`, async ({ page }) => {
    await page.setContent(`<div style="${hiddenStyle}"><div style="display:contents">非表示</div></div>`);
    const result = await page.evaluate(readContrastColors, undefined);
    expect(result.samples).toEqual([]);
  });
}

test('遅延fade中の不透明入力は確定色の計測まで待つ', async ({ page }) => {
  await page.setContent(
    '<div style="backdrop-filter:blur(12px);background:rgb(255 255 255 / 95%)"><form><input style="background:white;border:2px solid black" /></form></div>',
  );
  await page
    .locator('form')
    .evaluate((el) => el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 100, delay: 100, fill: 'both' }));
  const input = page.locator('input');
  expect(await input.evaluate(hasStableOpaquePaint)).toBe(false);
  await page.locator('form').evaluate((el) => {
    for (const animation of el.getAnimations()) animation.play();
  });
  await expect.poll(() => input.evaluate(hasStableOpaquePaint)).toBe(true);
  const colors = await input.evaluate(readContrastColors);
  expect(colors.unsupported).toEqual([]);
  expect(colors.background).toEqual([255, 255, 255, 1]);
});

test('無限の兄弟装飾は待たず、恒久的な未対応背景は合格させない', async ({ page }) => {
  await page.setContent(
    '<aside></aside><input style="background:transparent;border:2px solid black" /><style>body{background-image:linear-gradient(white,black)}</style>',
  );
  await page
    .locator('aside')
    .evaluate((el) => el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 100, iterations: Infinity }));
  const input = page.locator('input');
  expect(await input.evaluate(hasStableOpaquePaint)).toBe(true);
  expect((await input.evaluate(readContrastColors)).unsupported.length).toBeGreaterThan(0);
});
