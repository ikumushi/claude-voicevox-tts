/**
 * Claudeの応答(Markdown)を、耳で聞いて意味が通るテキストに直す。
 *
 * 方針は「読んでも嬉しくないものは落とす」。
 * コードブロック・表・URL・長いパスは聞き取れないので捨て、
 * 文章と見出しだけを残して句点でつなぐ。
 */

/** 読み上げても意味のない記号。削って構わないもの。 */
const DECORATION_PATTERN = /[*_~`#>|•◦▪→←↔⇒★☆●○■□◆◇§¶]/g;

/** 日本語の文字(漢字・ひらがな・カタカナ・句読点)。 */
const JAPANESE_CHAR = '\\p{Script=Han}\\p{Script=Hiragana}\\p{Script=Katakana}ー。、';

/**
 * 日本語どうしに挟まれた空白。リンクやURLを外した跡に残るので詰める。
 * 英数字と日本語の間(「npm test を流した」など)は読みやすさのために残す。
 */
const JAPANESE_GAP_PATTERN = new RegExp(`(?<=[${JAPANESE_CHAR}])\\s+(?=[${JAPANESE_CHAR}])`, 'gu');

/**
 * パスらしい文字列をファイル名だけに縮める。
 *
 * 「docs/decisions/0001-x.md」→「0001-x.md」。
 * 日付(2026/10/03)を壊さないよう、末尾が拡張子の形のときだけ縮める。
 */
export function shortenPaths(text) {
  return text.replace(
    /(?:[A-Za-z]:)?[\w.~@+-]*(?:[\\/][\w.~@+-]+)+\.[A-Za-z0-9]{1,8}(?::\d+)?/g,
    (match) => {
      const withoutLine = match.replace(/:\d+$/, '');
      const segments = withoutLine.split(/[\\/]/);
      return segments[segments.length - 1];
    },
  );
}

/** 絵文字・装飾用の記号を落とす。 */
export function stripEmoji(text) {
  return text.replace(/[\p{Extended_Pictographic}\p{Emoji_Presentation}\uFE0F\u200D]/gu, '');
}

/**
 * 文字数が上限を超えていたら、文の区切りで打ち切って「以下は省略」と添える。
 * 途中でぶつ切りにすると聞いていて不安になるので、必ず文末で切る。
 */
export function truncateAtSentence(text, maxChars) {
  if (text.length <= maxChars) return text;
  const head = text.slice(0, maxChars);
  const lastBreak = Math.max(
    head.lastIndexOf('。'),
    head.lastIndexOf('!'),
    head.lastIndexOf('?'),
    head.lastIndexOf('！'),
    head.lastIndexOf('？'),
  );
  const body = (lastBreak >= Math.floor(maxChars * 0.4) ? head.slice(0, lastBreak + 1) : head)
    .trimEnd()
    // 文末で切れた場所に句点を足すと「。。」になるので、足すのは文中で切れたときだけ。
    .replace(/[。!?！？]$/, '。');
  const ending = /[。!?！？]$/.test(body) ? '' : '。';
  return `${body}${ending}以下は省略します。`;
}

export function toSpeakableText(markdown, { maxChars = 400 } = {}) {
  if (typeof markdown !== 'string' || markdown.trim() === '') return '';

  let text = markdown;

  // 囲みコードブロックは丸ごと落とす(閉じていない場合も末尾まで落とす)。
  text = text.replace(/```[\s\S]*?```/g, '\n');
  text = text.replace(/```[\s\S]*$/g, '\n');
  text = text.replace(/^(?: {4}|\t)\S.*$/gm, '');

  // 表の行は読み上げに向かないので落とす。
  text = text.replace(/^\s*\|.*$/gm, '');

  // 画像とリンクは、表示文字列だけ残す。
  text = text.replace(/!\[[^\]]*\]\([^)]*\)/g, '');
  text = text.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');

  // 裸のURLは落とす。
  text = text.replace(/<?https?:\/\/\S+>?/g, '');

  // インラインコードは中身だけ残す(コマンド名などは読んで役に立つ)。
  text = text.replace(/`([^`\n]*)`/g, '$1');

  // 行頭の記号(見出し・引用・箇条書き・番号・水平線・チェックボックス)を落とす。
  text = text.replace(/^\s*[-*_]{3,}\s*$/gm, '');
  text = text.replace(/^\s{0,3}#{1,6}\s*/gm, '');
  text = text.replace(/^\s*>\s?/gm, '');
  text = text.replace(/^\s*[-*+]\s+\[[ xX]\]\s*/gm, '');
  text = text.replace(/^\s*[-*+]\s+/gm, '');
  text = text.replace(/^\s*\d+[.)]\s+/gm, '');

  // 強調の記号を外して中身を残す。
  text = text.replace(/\*\*([^*]+)\*\*/g, '$1');
  text = text.replace(/__([^_]+)__/g, '$1');
  text = text.replace(/~~([^~]+)~~/g, '$1');

  text = shortenPaths(text);
  text = stripEmoji(text);

  // 残った装飾記号を落とす。
  text = text.replace(DECORATION_PATTERN, '');

  // 改行を句点に変えて、読み上げの間を作る。
  text = text.replace(/\r\n?/g, '\n');
  text = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .map((line) => (/[。!?！?、:：]$/.test(line) ? line : `${line}。`))
    .join('');

  // 句読点と空白の重なりをほどく。
  text = text.replace(/[ \t\u3000]{2,}/g, ' ');
  // リンクやURLを外した跡に残った、日本語どうしの間の空白を詰める。
  text = text.replace(JAPANESE_GAP_PATTERN, '');
  text = text.replace(/。{2,}/g, '。');
  text = text.replace(/、{2,}/g, '、');
  text = text.replace(/、。/g, '。');
  text = text.replace(/([:：])。/g, '$1');

  return truncateAtSentence(text.trim(), maxChars);
}
