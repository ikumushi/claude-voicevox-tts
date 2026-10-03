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
- **PowerShell を呼ぶときは必ず `-NoProfile` を付ける。** ユーザーのプロファイル読み込みが重く、
  付けないと再生開始が数十秒遅れることがある。

## 読み上げテキストの方針

「聞いて意味が通らないものは読まない」。コードブロック・表・URL・長いパス・絵文字は落とす。
インラインコード(コマンド名など)は中身を残す。判断に迷ったら `test/normalize.test.mjs` に
期待する読み上げ結果をテストとして書き、それを仕様とする。

## 作業時の注意

- **Bash ツールの heredoc で `\\` を書くと `\` に潰れる。** 正規表現の `[\\/]` などを含む
  コードは Write / Edit ツールで書く。過去に `shortenPaths` の正規表現がこれで壊れた。
- 動作確認は実際に音が出るので、`npm run speak -- "テスト"` は音量に注意する。
- エンジンが止まっていても Hook は黙って終わる。確認するときは `npm run status` を使う。
