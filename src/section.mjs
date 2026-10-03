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
 * サマリ節の本文を返す。見出し行そのものは読み上げても意味がないので含めない。
 * 同じ階層以下の次の見出し(「次にできること」など)が来たら、そこで切る。
 *
 * @param {string} markdown 応答全文
 * @returns {string} サマリ節の本文(見つからなければ空文字)
 */
export function extractSummarySection(markdown) {
  if (typeof markdown !== 'string' || markdown.trim() === '') return '';

  const lines = markdown.split(/\r?\n/);
  const headings = collectHeadings(lines);

  // 同じ応答に複数あることがあるので、最後のサマリ見出しを使う。
  const target = [...headings].reverse().find((heading) => SUMMARY_HEADING.test(heading.text));
  if (!target) return '';

  const next = headings.find(
    (heading) => heading.index > target.index && heading.level <= target.level,
  );
  const end = next ? next.index : lines.length;

  return lines
    .slice(target.index + 1, end)
    .join('\n')
    .trim();
}
