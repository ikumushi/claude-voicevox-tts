import { describe, expect, it } from 'vitest';

import {
  shortenPaths,
  stripEmoji,
  toSpeakableText,
  truncateAtSentence,
} from '../src/normalize.mjs';

describe('toSpeakableText', () => {
  it('空の入力は空文字を返す', () => {
    expect(toSpeakableText('')).toBe('');
    expect(toSpeakableText('   \n  ')).toBe('');
    expect(toSpeakableText(undefined)).toBe('');
  });

  it('囲みコードブロックを落とす', () => {
    const input = ['設定しました。', '', '```powershell', 'npm run lint', '```', '', '以上です。'];
    const result = toSpeakableText(input.join('\n'));
    expect(result).not.toContain('npm run lint');
    expect(result).toBe('設定しました。以上です。');
  });

  it('閉じていないコードブロックも末尾まで落とす', () => {
    const result = toSpeakableText('結果です。\n\n```js\nconst a = 1;');
    expect(result).toBe('結果です。');
  });

  it('表の行を落とす', () => {
    const input = ['比較します。', '| 項目 | 値 |', '| --- | --- |', '| a | b |', '以上。'];
    expect(toSpeakableText(input.join('\n'))).toBe('比較します。以上。');
  });

  it('Markdownリンクはリンク文字列だけ残す', () => {
    expect(toSpeakableText('[設定ファイル](https://example.com/a) を直した。')).toBe(
      '設定ファイルを直した。',
    );
  });

  it('裸のURLを落とす', () => {
    expect(toSpeakableText('詳細は https://example.com/foo?a=1 を見てください。')).toBe(
      '詳細はを見てください。',
    );
  });

  it('英数字と日本語の間の空白は残す', () => {
    expect(toSpeakableText('`npm test` を流した。')).toBe('npm test を流した。');
  });

  it('インラインコードは中身を残す', () => {
    expect(toSpeakableText('`npm test` を流した。')).toBe('npm test を流した。');
  });

  it('見出し・箇条書き・強調の記号を落とす', () => {
    const input = ['## サマリ', '', '- **完了**しました', '- 2番目の項目', '1. 番号つき'];
    expect(toSpeakableText(input.join('\n'))).toBe('サマリ。完了しました。2番目の項目。番号つき。');
  });

  it('チェックボックスの記号を落とす', () => {
    expect(toSpeakableText('- [x] 済み\n- [ ] 未着手')).toBe('済み。未着手。');
  });

  it('長いパスはファイル名だけにする', () => {
    expect(toSpeakableText('設定は C:/Users/taro/.claude/settings.json にある。')).toBe(
      '設定は settings.json にある。',
    );
  });

  it('上限を超えたら文末で打ち切る', () => {
    const input = 'あいうえお。'.repeat(30);
    const result = toSpeakableText(input, { maxChars: 50 });
    expect(result.length).toBeLessThan(70);
    expect(result.endsWith('。以下は省略します。')).toBe(true);
  });
});

describe('shortenPaths', () => {
  it('Windowsパスをファイル名に縮める', () => {
    expect(shortenPaths('C:\\dev\\Claude_Projects\\src\\speak.mjs')).toBe('speak.mjs');
  });

  it('行番号つきの参照も縮める', () => {
    expect(shortenPaths('src/utils/foo.ts:42')).toBe('foo.ts');
  });

  it('日付は壊さない', () => {
    expect(shortenPaths('2026/10/03 に実施')).toBe('2026/10/03 に実施');
  });

  it('拡張子の無いパスは触らない', () => {
    expect(shortenPaths('docs/decisions')).toBe('docs/decisions');
  });
});

describe('stripEmoji', () => {
  it('絵文字を落とす', () => {
    expect(stripEmoji('完了しました ✅🎉').trim()).toBe('完了しました');
  });
});

describe('truncateAtSentence', () => {
  it('上限以内ならそのまま返す', () => {
    expect(truncateAtSentence('短い文。', 100)).toBe('短い文。');
  });

  it('文末で切れたときに句点を重ねない', () => {
    const result = truncateAtSentence('あいうえお。かきくけこ。さしすせそ。', 12);
    expect(result).toBe('あいうえお。かきくけこ。以下は省略します。');
    expect(result).not.toContain('。。');
  });

  it('文の区切りが近くに無ければそのまま切る', () => {
    const result = truncateAtSentence('あ'.repeat(100), 20);
    expect(result).toBe('あ'.repeat(20) + '。以下は省略します。');
  });
});
