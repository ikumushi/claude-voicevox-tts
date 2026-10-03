/**
 * 応答の中から「まとめ・サマリ・結論」の節だけを切り出す。
 *
 * ユーザーの `~/.claude/CLAUDE.md` は応答の末尾に必ずサマリ節を置く決まりなので、
 * そこだけを読み上げれば要点が最短で耳に入る。
 * 節が見つからない場合は呼び出し側が応答全体にフォールバックする。
 */

/** サマリ節と見なす見出しの文字。 */
const SUMMARY_HEADING = /(まとめ|サマリー?|結論|要約|summary|conclusion)/i;

/**
 * 太字だけの行を見出しとして扱うときの階層。
 * `##` などより深い扱いにして、次の見出しで必ず区切れるようにする。
 */
const BOLD_HEADING_LEVEL = 99;

/**
 * 見出しの一覧を作る。囲みコードブロックの中の `#` は見出しではないので数えない。
 * @returns {{index: number, level: number, text: string}[]}
 */
function collectHeadings(lines) {
  const headings = [];
  let inFence = false;

  for (const [index, line] of lines.entries()) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const atx = line.match(/^\s{0,3}(#{1,6})\s+(.*)$/);
    if (atx) {
      headings.push({ index, level: atx[1].length, text: atx[2] });
      continue;
    }

    // 「**サマリ**」のように太字だけの行も見出しとして扱う。
    const bold = line.match(/^\s*\*\*(.+?)\*\*[:：]?\s*$/);
    if (bold) {
      headings.push({ index, level: BOLD_HEADING_LEVEL, text: bold[1] });
    }
  }

  return headings;
}

/**
 * サマリ見出し以降を返す。サマリ見出しの行そのものは、すぐ本文が続くので含めない。
 * 一方で「次にできること」のような後続の見出しは残す。
 * 節が切り替わったことが耳で分かるほうが聞きやすいため。
 *
 * @param {string} markdown 応答全文
 * @param {{includeFollowing?: boolean}} options
 *   includeFollowing が true(既定)なら応答の末尾まで。
 *   false なら同じ階層以下の次の見出しで切り、サマリ節だけを返す。
 * @returns {string} 切り出した本文(サマリ見出しが無ければ空文字)
 */
export function extractSummarySection(markdown, { includeFollowing = true } = {}) {
  if (typeof markdown !== 'string' || markdown.trim() === '') return '';

  const lines = markdown.split(/\r?\n/);
  const headings = collectHeadings(lines);

  // 同じ応答に複数あることがあるので、最後のサマリ見出しを使う。
  const target = [...headings].reverse().find((heading) => SUMMARY_HEADING.test(heading.text));
  if (!target) return '';

  let end = lines.length;
  if (!includeFollowing) {
    const next = headings.find(
      (heading) => heading.index > target.index && heading.level <= target.level,
    );
    if (next) end = next.index;
  }

  return lines
    .slice(target.index + 1, end)
    .join('\n')
    .trim();
}
