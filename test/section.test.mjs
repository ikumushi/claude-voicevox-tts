import { describe, expect, it } from 'vitest';

import { extractSummarySection } from '../src/section.mjs';

describe('extractSummarySection', () => {
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
    expect(extractSummarySection(input)).toBe('完了した。テストは通った。');
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
    expect(extractSummarySection(input)).toBe('動作確認まで完了した。');
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
    expect(extractSummarySection(input)).toBe('要点は2つ。\n\n### 補足\n\n細かい話。');
  });

  it('サマリ見出しが複数あれば最後のものを使う', () => {
    const input = ['## サマリ', '', '前半のまとめ。', '', '## サマリ', '', '後半のまとめ。'].join(
      '\n',
    );
    expect(extractSummarySection(input)).toBe('後半のまとめ。');
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
    expect(extractSummarySection(input)).toBe('これが原因だった。');
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
    expect(extractSummarySection(input)).toContain('設定例はこう。');
    expect(extractSummarySection(input)).toContain('以上。');
  });

  it('見出しが最後にあり本文が続く場合は末尾まで返す', () => {
    expect(extractSummarySection('## 結論\n\n直った。')).toBe('直った。');
  });

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
