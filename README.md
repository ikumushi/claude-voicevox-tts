# claude-voicevox-tts

Claude Code の応答を [VOICEVOX](https://voicevox.hiroshiba.jp/) で読み上げる Hook。

ターンが終わると、その応答の「まとめ・サマリ・結論」の見出し以降を自動で読み上げる。
まとめだけでなく、その後ろの「次にできること」や提案・作業依頼まで読む。
コードブロック・表・URL・長いパスは聞いても分からないので落としてから読む。
ツールの実行許可を待って止まったときも声で知らせる。

まとめの見出しが無い応答(短い返答や質問への回答)は、黙ってしまうと不便なので応答全体を読む。

読み上げる範囲は `VOICEVOX_READ_SCOPE` で切り替える。

| 値        | 読む範囲                                       | 実測の長さ              |
| --------- | ---------------------------------------------- | ----------------------- |
| `closing` | まとめ以降すべて(次にできること・作業依頼込み) | 520〜600文字 / 77〜88秒 |
| `summary` | まとめ節だけ(次の見出しで切る)                 | 200〜260文字 / 29〜38秒 |
| `full`    | 応答全体                                       | 上限まで                |

## 前提

- Windows 11 / Node.js 24 系(`.nvmrc` 参照)
- VOICEVOX 本体(エンジン同梱)

VOICEVOX が未インストールなら、次のどちらかで入れる。

```powershell
winget install --id HiroshibaKazuyuki.VOICEVOX --accept-package-agreements --accept-source-agreements
```

GPU を使わない軽量版を使う場合は `HiroshibaKazuyuki.VOICEVOX.CPU` を指定する。

## セットアップ

```powershell
Set-Location C:\dev\Claude_Projects\claude-voicevox-tts
npm install
```

エンジンが動くか確認する。

```powershell
npm run status
```

声を出して確かめる。

```powershell
npm run speak -- "セットアップできました"
```

話者の一覧(IDと名前)を見る。

```powershell
npm run speakers
```

## Claude Code への登録

`~/.claude/settings.json` の `hooks` に Stop と Notification を登録する。
`env` に書いた値がそのまま Hook の設定になる。

```json
{
  "env": {
    "VOICEVOX_SPEAKER": "2",
    "VOICEVOX_SPEED": "1.2",
    "VOICEVOX_MAX_CHARS": "800"
  },
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"C:/dev/Claude_Projects/claude-voicevox-tts/src/speak-hook.mjs\"",
            "timeout": 10
          }
        ]
      }
    ],
    "Notification": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"C:/dev/Claude_Projects/claude-voicevox-tts/src/speak-hook.mjs\"",
            "timeout": 10
          }
        ]
      }
    ]
  }
}
```

登録したら Claude Code を再起動する(Hook の設定は起動時に読まれる)。

## 設定の変え方

設定はすべて `~/.claude/settings.json`(= `C:\Users\<ユーザー名>\.claude\settings.json`)の
`env` ブロックに書く。このプロジェクトのファイルは触らなくてよい。

`~` はホームフォルダの意味。`.claude` は先頭がドットなのでエクスプローラーでは
隠しフォルダ扱いで見えない。開くときはパスを直接指定する。

```powershell
notepad "$env:USERPROFILE\.claude\settings.json"
```

```json
{
  "env": {
    "VOICEVOX_READ_SCOPE": "closing",
    "VOICEVOX_SPEAKER": "2",
    "VOICEVOX_SPEED": "1.2",
    "VOICEVOX_MAX_CHARS": "800"
  }
}
```

**値はすべて文字列(ダブルクォート付き)で書く。** 数値をそのまま書くと読み込まれない。

**再起動は不要。** `env` の変更は保存した時点で次のターンから反映される(実測確認済み)。
ただし `hooks` ブロック自体を書き換えたときは Claude Code の再起動が確実。

### やりたいことから引く

| やりたいこと               | 変える値                                                 |
| -------------------------- | -------------------------------------------------------- |
| しばらく黙らせたい         | `VOICEVOX_ENABLED` を `"0"`(戻すときは `"1"` か行を削除) |
| 読み上げを短くしたい       | `VOICEVOX_READ_SCOPE` を `"summary"`(まとめ節だけ)       |
| もっと短くしたい           | `VOICEVOX_SPEED` を `"1.5"` まで上げる                   |
| 応答を全部読ませたい       | `VOICEVOX_READ_SCOPE` を `"full"`                        |
| 声を変えたい               | `npm run speakers` でID確認 → `VOICEVOX_SPEAKER`         |
| 声が小さい・大きい         | `VOICEVOX_VOLUME`(`"0.7"` 〜 `"1.5"` あたり)             |
| 許可待ちの通知だけ止めたい | `VOICEVOX_SPEAK_NOTIFICATIONS` を `"0"`                  |
| 棒読みに感じる             | `VOICEVOX_INTONATION` を `"1.2"` 前後に上げる            |

**`VOICEVOX_MAX_CHARS` は安易に下げない。** 打ち切りは末尾から起きるので、
下げると一番聞きたい「次にできること・作業依頼」が消える。
短くしたいときは `VOICEVOX_READ_SCOPE` か `VOICEVOX_SPEED` で調整する。

### 変更が効いたか確かめる

```powershell
Set-Location C:\dev\Claude_Projects\claude-voicevox-tts
npm run status
npm run speak -- "設定を変えました"
```

`npm run status` は `~/.claude/settings.json` を直接読んで実際に使われる値を表示する。
意図した値になっていなければ `settings.json` の書き方(クォート忘れ・カンマ)を疑う。

```
話者ID  : 2
速度    : 1.2
読む範囲: closing
上限    : 800文字
設定ファイル: C:\Users\<ユーザー名>\.claude\settings.json
```

## 設定(環境変数)

| 変数                              | 既定値                   | 意味                                             |
| --------------------------------- | ------------------------ | ------------------------------------------------ |
| `VOICEVOX_ENABLED`                | `1`                      | `0` にすると読み上げを止める(一時的に黙らせる用) |
| `VOICEVOX_READ_SCOPE`             | `closing`                | `closing`/`summary`/`full`。上の表を参照         |
| `VOICEVOX_SPEAKER`                | `2`                      | 話者ID。`npm run speakers` で一覧が出る          |
| `VOICEVOX_SPEED`                  | `1.2`                    | 読み上げ速度(0.5〜2.0)                           |
| `VOICEVOX_PITCH`                  | `0`                      | 声の高さ(-0.15〜0.15)                            |
| `VOICEVOX_INTONATION`             | `1`                      | 抑揚の強さ(0〜2)                                 |
| `VOICEVOX_VOLUME`                 | `1`                      | 音量(0〜2)                                       |
| `VOICEVOX_MAX_CHARS`              | `800`                    | 読み上げる最大文字数。超えたら文末で打ち切る     |
| `VOICEVOX_SPEAK_NOTIFICATIONS`    | `1`                      | 許可待ちなどの通知を読み上げるか                 |
| `VOICEVOX_URL`                    | `http://127.0.0.1:50021` | エンジンの待ち受け先                             |
| `VOICEVOX_AUTOSTART`              | `1`                      | エンジンが止まっていたら自動起動するか           |
| `VOICEVOX_ENGINE_EXE`             | (自動探索)               | エンジンの `run.exe` を明示指定する              |
| `VOICEVOX_ENGINE_BOOT_TIMEOUT_MS` | `90000`                  | 自動起動したエンジンの応答を待つ上限             |

### 読み上げにかかる時間の実測

ずんだもん(話者3)で100文字を合成して計測した結果。文字数の上限を決める目安に使う。

| 速度  | 100文字 | 250文字 | 600文字 | 800文字 |
| ----- | ------- | ------- | ------- | ------- |
| `1.0` | 17.6秒  | 44秒    | 106秒   | 141秒   |
| `1.2` | 14.7秒  | 37秒    | 88秒    | 118秒   |
| `1.5` | 11.7秒  | 29秒    | 70秒    | 94秒    |

上限の既定は800文字。`closing` は実測で520〜600文字あり、400文字で打ち切ると
末尾の作業依頼が切れてしまうため余裕を持たせている。

短くしたいときは `VOICEVOX_READ_SCOPE=summary` にする(29〜38秒)か、
`VOICEVOX_SPEED` を上げる(1.5なら600文字が約70秒)。

## 仕組み

```
Claude Code ──(Stop / Notification Hook)──> speak-hook.mjs
                                               │ 読み上げ文を決めて、すぐ終わる
                                               └─(切り離して起動)─> speak.mjs
                                                                      │
                                                     VOICEVOX ENGINE ─┘ ─> WAV ─> 再生
```

- `src/speak-hook.mjs` … Hook の入口。トランスクリプトから最終応答を取り出し、読める形に直して
  ワーカーへ渡す。合成も再生も待たないので、ターンの終わりが遅くならない。
- `src/speak.mjs` … 切り離されたワーカー。エンジンの起動確認・音声合成・再生を担当する。
- `src/extract.mjs` … トランスクリプト(JSONL)から最終応答を取り出す。ツール実行の合間の
  中間コメントとサブエージェントの発言は読まない。
- `src/section.mjs` … 応答から「まとめ・サマリ・結論」節だけを切り出す。
  次の見出し(「次にできること」など)が来たらそこで切る。
- `src/normalize.mjs` … Markdown を読み上げ用のテキストに直す。
- `src/engine.mjs` … VOICEVOX ENGINE の HTTP API 呼び出しとエンジンの自動起動。
- `src/play.mjs` … WAV の再生と、前のターンの読み上げを止める処理。
- `src/cli.mjs` … 手元で試すための CLI(`npm run speak` / `speakers` / `status`)。

新しいターンの読み上げが始まると、前のターンの読み上げは途中で止まる。
古い応答を聞かされ続けないようにするため。

## 困ったとき

| 症状                     | 確認すること                                                                               |
| ------------------------ | ------------------------------------------------------------------------------------------ |
| 何も聞こえない           | `npm run status` でエンジンが起動中か。`VOICEVOX_ENABLED` が `0` でないか                  |
| エンジンが自動起動しない | `npm run status` の「エンジン実体」が「見つからない」なら `VOICEVOX_ENGINE_EXE` を設定する |
| 読み上げが長すぎる       | `VOICEVOX_MAX_CHARS` を小さくする(例: `100`)。上の実測表を参照                             |
| 声を変えたい             | `npm run speakers` でIDを調べ、`VOICEVOX_SPEAKER` に設定する                               |
| Hook のエラーを見たい    | Claude Code を `--debug` で起動する。Hook のログは標準エラーに出る                         |

## 開発

```powershell
npm test          # Vitest
npm run lint      # ESLint
npm run format    # Prettier
```
