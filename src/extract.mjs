/**
 * Claude Code のトランスクリプト(JSONL)から、直前のターンの最終応答テキストを取り出す。
 *
 * トランスクリプトは1行1イベントのJSONL。末尾から遡り、
 * 「最後のツール呼び出しより後に書かれた本文」だけを拾う。
 * ツール実行の合間に出る中間コメントは読み上げない。
 */

/** サブエージェント(isSidechain)の発言は読み上げない。本人の応答だけを拾う。 */
function isOwnAssistantEntry(entry) {
  return entry?.type === 'assistant' && entry.isSidechain !== true;
}

/**
 * そのイベントがターンの境界かどうか。
 *
 * 境界は `user` だけ(ユーザーの入力、またはツールの実行結果)。
 * トランスクリプトには `system` `attachment` `atis-latch` `bridge-session` のような
 * 記録用のイベントが応答の後ろに混ざる。これらを境界にすると最終応答に届かないので、
 * 境界にはせず読み飛ばす。実際に最終行が `system` のトランスクリプトで空振りした。
 */
function isTurnBoundary(entry) {
  return entry?.type === 'user';
}

/**
 * @param {string[]} lines JSONLの各行
 * @returns {string} 最終応答の本文(見つからなければ空文字)
 */
export function extractFinalAssistantText(lines) {
  const chunks = [];

  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i].trim();
    if (line === '') continue;

    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue; // 書き込み途中の行が混ざることがあるので、壊れた行は読み飛ばす
    }

    if (entry?.isSidechain === true) continue;
    if (isTurnBoundary(entry)) break;
    if (!isOwnAssistantEntry(entry)) continue;

    const content = entry.message?.content;
    if (!Array.isArray(content)) continue;

    // ツール呼び出しを含むイベントに達したら、そこより前は中間コメントなので止める。
    if (content.some((block) => block?.type === 'tool_use')) break;

    const text = content
      .filter((block) => block?.type === 'text' && typeof block.text === 'string')
      .map((block) => block.text)
      .join('\n');

    if (text.trim() !== '') chunks.unshift(text);
  }

  return chunks.join('\n').trim();
}

/**
 * Notification Hook のメッセージ(英語)を、短い日本語の読み上げ文に直す。
 * 想定外の文面はそのまま返す(読み上げないよりは読み上げたほうがよい)。
 */
export function toNotificationSpeech(message) {
  if (typeof message !== 'string' || message.trim() === '') return '';
  const text = message.trim();

  const permission = text.match(/needs your permission to use ([\w.-]+)/i);
  if (permission) return `${permission[1]}の実行許可を待っています。`;

  if (/waiting for your input/i.test(text)) return '入力を待っています。';
  if (/permission/i.test(text)) return '許可を待っています。';

  return text;
}
