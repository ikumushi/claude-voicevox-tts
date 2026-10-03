import { describe, expect, it } from 'vitest';

import { extractSummarySection } from '../src/section.mjs';

describe('extractSummarySection(既定: サマリ以降すべて)', () => {
  it('次にできることや作業依頼まで読む', () => {
    const input = [
      '## サマリ・結論',
      '',
      '動作確認まで完了した。',
      '',
      '## 次にできること',
      '',
      '1. 再起動する',
      '2. 速度を変える',
    ].join('\n');
    const result = extractSummarySection(input);
    expect(result).toContain('動作確認まで完了した。');
    expect(result).toContain('次にできること');
    expect(result).toContain('再起動する');
  });

  it('サマリ見出しの行は含めないが、後続の見出しは残す', () => {
    const result = extractSummarySection('## サマリ\n\n完了。\n\n## 次の手\n\n直す。');
    expect(result.startsWith('完了。')).toBe(true);
    expect(result).toContain('## 次の手');
  });

  it('サマリより前の本文は読まない', () => {
    const input = [
      '長い説明の本文。',
      '',
      '## 作ったもの',
      '',
      'あれこれ。',
      '',
      '## サマリ',
      '',
      '完了。',
    ].join('\n');
    const result = extractSummarySection(input);
    expect(result).toBe('完了。');
    expect(result).not.toContain('あれこれ');
  });
});

describe('extractSummarySection({ includeFollowing: false })', () => {
  const summaryOnly = (markdown) => extractSummarySection(markdown, { includeFollowing: false });

  it('サマリ節の本文だけを返し、見出し行は含めない', () => {
    const input = [
      '作業しました。',
      '',
      '## 作ったもの',
      '',
      'あれこれ作った。',
      '',
      '## サマリ',
      '',
      '完了した。テストは通った。',
    ].join('\n');
    expect(summaryOnly(input)).toBe('完了した。テストは通った。');
  });

  it('次の見出しが来たらそこで切る', () => {
    const input = [
      '## サマリ・結論',
      '',
      '動作確認まで完了した。',
      '',
      '## 次にできること',
      '',
      '1. 再起動する',
      '2. 速度を変える',
    ].join('\n');
    expect(summaryOnly(input)).toBe('動作確認まで完了した。');
  });

  it('より深い見出しは節の中に含める', () => {
    const input = [
      '## まとめ',
      '',
      '要点は2つ。',
      '',
      '### 補足',
      '',
      '細かい話。',
      '',
      '## 次の手',
    ].join('\n');
    expect(summaryOnly(input)).toBe('要点は2つ。\n\n### 補足\n\n細かい話。');
  });

  it('サマリ見出しが複数あれば最後のものを使う', () => {
    const input = ['## サマリ', '', '前半のまとめ。', '', '## サマリ', '', '後半のまとめ。'].join(
      '\n',
    );
    expect(summaryOnly(input)).toBe('後半のまとめ。');
  });

  it('太字だけの行も見出しとして扱う', () => {
    const input = [
      '調べました。',
      '',
      '**結論**',
      '',
      'これが原因だった。',
      '',
      '**次の手**',
      '',
      '直す。',
    ].join('\n');
    expect(summaryOnly(input)).toBe('これが原因だった。');
  });

  it('コードブロック内の見出し記号は見出しとして数えない', () => {
    const input = [
      '## サマリ',
      '',
      '設定例はこう。',
      '',
      '```sh',
      '# これはコメントで見出しではない',
      'npm test',
      '```',
      '',
      '以上。',
    ].join('\n');
    expect(summaryOnly(input)).toContain('設定例はこう。');
    expect(summaryOnly(input)).toContain('以上。');
  });

  it('見出しが最後にあり本文が続く場合は末尾まで返す', () => {
    expect(summaryOnly('## 結論\n\n直った。')).toBe('直った。');
  });
});

describe('extractSummarySection(どちらのモードでも同じ)', () => {
  it('サマリ節が無ければ空文字', () => {
    expect(extractSummarySection('## 作ったもの\n\nあれこれ。')).toBe('');
    expect(extractSummarySection('見出しの無い短い返答です。')).toBe('');
  });

  it('空の入力は空文字', () => {
    expect(extractSummarySection('')).toBe('');
    expect(extractSummarySection(undefined)).toBe('');
  });

  it('英語の Summary / Conclusion も拾う', () => {
    expect(extractSummarySection('## Summary\n\nDone.')).toBe('Done.');
    expect(extractSummarySection('## Conclusion\n\nShipped.')).toBe('Shipped.');
  });
});
