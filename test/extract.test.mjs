import { describe, expect, it } from 'vitest';

import { extractFinalAssistantText, toNotificationSpeech } from '../src/extract.mjs';

/** トランスクリプト1行ぶんを組み立てる補助。 */
function assistant(blocks, extra = {}) {
  return JSON.stringify({ type: 'assistant', message: { content: blocks }, ...extra });
}

function user(text) {
  return JSON.stringify({ type: 'user', message: { content: [{ type: 'text', text }] } });
}

describe('extractFinalAssistantText', () => {
  it('最後のアシスタント応答を取り出す', () => {
    const lines = [user('やって'), assistant([{ type: 'text', text: '完了しました。' }])];
    expect(extractFinalAssistantText(lines)).toBe('完了しました。');
  });

  it('ツール実行の合間の中間コメントは読まない', () => {
    const lines = [
      user('やって'),
      assistant([
        { type: 'text', text: 'まず調べます。' },
        { type: 'tool_use', name: 'Bash' },
      ]),
      user('tool result'),
      assistant([{ type: 'text', text: '終わりました。' }]),
    ];
    expect(extractFinalAssistantText(lines)).toBe('終わりました。');
  });

  it('分割された複数のテキストブロックをつなぐ', () => {
    const lines = [
      user('やって'),
      assistant([{ type: 'text', text: '前半です。' }]),
      assistant([{ type: 'text', text: '後半です。' }]),
    ];
    expect(extractFinalAssistantText(lines)).toBe('前半です。\n後半です。');
  });

  it('サブエージェントの発言は無視する', () => {
    const lines = [
      user('やって'),
      assistant([{ type: 'text', text: '本体の応答。' }]),
      assistant([{ type: 'text', text: 'サブの応答。' }], { isSidechain: true }),
    ];
    expect(extractFinalAssistantText(lines)).toBe('本体の応答。');
  });

  it('thinkingブロックは読まない', () => {
    const lines = [
      user('やって'),
      assistant([
        { type: 'thinking', thinking: '考え中の内容' },
        { type: 'text', text: '答えです。' },
      ]),
    ];
    expect(extractFinalAssistantText(lines)).toBe('答えです。');
  });

  it('応答より後ろの記録用イベントを読み飛ばす', () => {
    // 実際のトランスクリプトは最終応答のあとに system / attachment などが並ぶ。
    const lines = [
      user('やって'),
      JSON.stringify({ type: 'attachment', isSidechain: false }),
      assistant([{ type: 'text', text: '終わりました。' }]),
      JSON.stringify({ type: 'system', isSidechain: false }),
      JSON.stringify({ type: 'atis-latch' }),
      JSON.stringify({ type: 'bridge-session' }),
    ];
    expect(extractFinalAssistantText(lines)).toBe('終わりました。');
  });

  it('記録用イベントを挟んでもツール呼び出しより前には戻らない', () => {
    const lines = [
      user('やって'),
      assistant([{ type: 'text', text: '中間コメント。' }]),
      assistant([{ type: 'tool_use', name: 'Bash' }]),
      user('tool result'),
      JSON.stringify({ type: 'attachment' }),
      assistant([{ type: 'text', text: '最終応答。' }]),
      JSON.stringify({ type: 'system' }),
    ];
    expect(extractFinalAssistantText(lines)).toBe('最終応答。');
  });

  it('壊れた行は読み飛ばす', () => {
    const lines = [user('やって'), assistant([{ type: 'text', text: '応答。' }]), '{ broken json'];
    expect(extractFinalAssistantText(lines)).toBe('応答。');
  });

  it('応答が見つからなければ空文字', () => {
    expect(extractFinalAssistantText([user('やって')])).toBe('');
    expect(extractFinalAssistantText([])).toBe('');
  });
});

describe('toNotificationSpeech', () => {
  it('ツールの許可待ちを日本語にする', () => {
    expect(toNotificationSpeech('Claude needs your permission to use Bash')).toBe(
      'Bashの実行許可を待っています。',
    );
  });

  it('入力待ちを日本語にする', () => {
    expect(toNotificationSpeech('Claude is waiting for your input')).toBe('入力を待っています。');
  });

  it('想定外の文面はそのまま返す', () => {
    expect(toNotificationSpeech('Something else happened')).toBe('Something else happened');
  });

  it('空なら空文字', () => {
    expect(toNotificationSpeech('')).toBe('');
    expect(toNotificationSpeech(undefined)).toBe('');
  });
});
