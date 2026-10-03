# claude-voicevox-tts 固有ルール

`Claude_Projects/CLAUDE.md` を継承し、このプロジェクトだけの事情を上書きする。

## このプロジェクトの性質

Claude Code の Hook として動く小さな常駐スクリプト群。Webアプリではないので、
ワークスペース標準の `frontend/` `backend/` は作らず `src/` と `test/` だけを置く。

## 言語は TypeScript ではなく素の ESM(.mjs)

Hook は Claude Code から `node <ファイル>` で直接呼ばれる。ビルド成果物を挟むと、
コードを直したのに古い `dist/` が動く事故が起きるため、ビルド不要の `.mjs` で書く。
同じ理由で `claude-approve-relay/hook/` も `.mjs` を使っている。
型が欲しい箇所は JSDoc コメントで補う。詳細は `docs/decisions/0001-hook-architecture.md`。

## ファイル名

`src/` は kebab-case の `.mjs`(例: `speak-hook.mjs`)。テストは `test/<対象>.test.mjs`。

## Hook として守る約束(壊すと Claude Code の動作に影響する)

- **標準出力に何も書かない。** Stop / Notification Hook の標準出力は Claude Code が解釈する。
  ログ・警告・エラーはすべて標準エラー(`process.stderr`)に書く。
- **必ず終了コード0で終わる。** 読み上げの失敗でユーザーの作業を止めない。
- **合成と再生を待たない。** Hook 本体は読み上げ文を決めてワーカーを切り離したら即終了する。
  ターンの終わりに体感の遅延を出さないため。
- **PowerShell を呼ぶときは `-NoProfile -NonInteractive` を付ける。** 再生はターンごとに
  起動するので、プロファイル読み込み(実測0.1秒程度)と対話待ちを省いて起動を最短にする。
  プロファイルの内容に再生が左右されないようにする意味もある。

## 読み上げテキストの方針

「聞いて意味が通らないものは読まない」。コードブロック・表・URL・長いパス・絵文字は落とす。
インラインコード(コマンド名など)は中身を残す。判断に迷ったら `test/normalize.test.mjs` に
期待する読み上げ結果をテストとして書き、それを仕様とする。

## 作業時の注意

- **Bash ツールの heredoc で `\\` を書くと `\` に潰れる。** 正規表現の `[\\/]` などを含む
  コードは Write / Edit ツールで書く。過去に `shortenPaths` の正規表現がこれで壊れた。
- 動作確認は実際に音が出るので、`npm run speak -- "テスト"` は音量に注意する。
- エンジンが止まっていても Hook は黙って終わる。確認するときは `npm run status` を使う。

## 読み上げる範囲(既定はサマリ節のみ)

既定では応答全体ではなく、末尾の「まとめ・サマリ・結論」節だけを読む(`VOICEVOX_READ_SCOPE=summary`)。
ユーザーの `~/.claude/CLAUDE.md` が応答末尾に必ずサマリ節を置く決まりなので、そこを狙い撃ちできる。
節が見つからない応答は黙らせず応答全体に戻す(短い返答で無音になるのを避ける)。

見出しの判定を変えるときは `test/section.test.mjs` に期待する切り出し結果を書いてから直す。
実データでは1応答が複数のテキストブロックに分割されて記録されるため、
節の切り出しは必ず `extractFinalAssistantText` で連結したあとに行う。
