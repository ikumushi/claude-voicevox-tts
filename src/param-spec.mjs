/**
 * 設定できるパラメータの定義。GUI・検証・ドキュメントの唯一の出典。
 *
 * なぜ別ファイルにするか:
 * 以前は `config.mjs` の実装と README の表が別々に書かれていたため、
 * パラメータを足したときに README への反映が漏れた(実際に2件漏れた)。
 * 画面に出す項目とその範囲をここ1か所に集め、
 * `test/param-spec.test.mjs` が `loadConfig` の既定値と一致することを機械的に見張る。
 *
 * `configKey` は `loadConfig` が返すフィールド名。既定値の突き合わせに使う。
 */

/** 画面上のまとまり。上から順に表示する。 */
export const PARAM_GROUPS = [
  {
    id: 'content',
    label: '読み上げの内容',
    description: '何をどれだけ読むか。普段いじるのはここ。',
  },
  {
    id: 'voice',
    label: '声',
    description: '誰の声で、どんな速さ・高さで読むか。',
  },
  {
    id: 'engine',
    label: 'エンジン',
    description: 'VOICEVOX本体との通信。うまく動いているなら触らなくてよい。',
  },
];

/** 読み上げ範囲の選択肢。 */
const READ_SCOPE_CHOICES = [
  {
    value: 'closing',
    label: 'まとめ以降すべて(推奨)',
    help: '「まとめ・サマリ・結論」の見出しから応答の最後まで。次にできること・作業依頼まで読む。',
  },
  {
    value: 'summary',
    label: 'まとめ節だけ',
    help: 'まとめの節で切る。短く済ませたいとき。',
  },
  {
    value: 'full',
    label: '応答全体',
    help: '応答をすべて読む。長い応答では数分かかる。',
  },
];

/**
 * パラメータ一覧。
 * type: boolean | number | enum | text
 * integer: 小数を許さない
 * defaultValue: 未設定のときに使われる値(文字列)
 */
export const PARAMS = [
  // ---- 読み上げの内容 ----
  {
    key: 'VOICEVOX_ENABLED',
    configKey: 'enabled',
    group: 'content',
    type: 'boolean',
    label: '読み上げを有効にする',
    defaultValue: '1',
    help: 'オフにすると音を出さなくなる。Hookの登録はそのまま残る。',
  },
  {
    key: 'VOICEVOX_READ_SCOPE',
    configKey: 'readScope',
    group: 'content',
    type: 'enum',
    label: '読み上げる範囲',
    defaultValue: 'closing',
    choices: READ_SCOPE_CHOICES,
    help: 'サマリの見出しが無い応答は、無音を避けるため応答全体に戻る。',
  },
  {
    key: 'VOICEVOX_MAX_CHARS',
    configKey: 'maxChars',
    group: 'content',
    type: 'number',
    integer: true,
    label: '1回の最大文字数',
    unit: '文字',
    defaultValue: '800',
    min: 20,
    max: 5000,
    step: 10,
    help: '超えたぶんは文の区切りで打ち切る。打ち切りは末尾から起きるので、下げると一番聞きたい作業依頼が消える。',
  },
  {
    key: 'VOICEVOX_SPEAK_NOTIFICATIONS',
    configKey: 'speakNotifications',
    group: 'content',
    type: 'boolean',
    label: '許可待ちを知らせる',
    defaultValue: '1',
    help: 'ツールの実行許可を待っているときに短く読み上げる。',
  },

  // ---- 声 ----
  {
    key: 'VOICEVOX_SPEAKER',
    configKey: 'speaker',
    group: 'voice',
    type: 'number',
    integer: true,
    label: '話者ID',
    defaultValue: '2',
    min: 0,
    max: 100_000,
    step: 1,
    speakerPicker: true,
    help: 'エンジンが起動していれば名前から選べる。2 = 四国めたん(ノーマル)。',
  },
  {
    key: 'VOICEVOX_SPEED',
    configKey: 'speedScale',
    group: 'voice',
    type: 'number',
    label: '速度',
    defaultValue: '1.2',
    min: 0.5,
    max: 2,
    step: 0.05,
    help: '1.0が標準。上げるほど読み終わりが早いが聞き取りにくくなる。',
  },
  {
    key: 'VOICEVOX_VOLUME',
    configKey: 'volumeScale',
    group: 'voice',
    type: 'number',
    label: '音量',
    defaultValue: '1',
    min: 0,
    max: 2,
    step: 0.05,
    help: 'Windows側の音量とは別。0にすると無音になる。',
  },
  {
    key: 'VOICEVOX_PITCH',
    configKey: 'pitchScale',
    group: 'voice',
    type: 'number',
    label: '声の高さ',
    defaultValue: '0',
    min: -0.15,
    max: 0.15,
    step: 0.01,
    help: 'エンジン側の制限で範囲が狭い。0.15を超える値は受け付けられない。',
  },
  {
    key: 'VOICEVOX_INTONATION',
    configKey: 'intonationScale',
    group: 'voice',
    type: 'number',
    label: '抑揚',
    defaultValue: '1',
    min: 0,
    max: 2,
    step: 0.05,
    help: '0にすると平坦な読み方になる。上げるとメリハリが付く。',
  },

  // ---- エンジン ----
  {
    key: 'VOICEVOX_URL',
    configKey: 'url',
    group: 'engine',
    type: 'text',
    label: 'エンジンの待ち受け先',
    defaultValue: 'http://127.0.0.1:50021',
    placeholder: 'http://127.0.0.1:50021',
    help: 'ポートを変えて起動している場合だけ直す。',
  },
  {
    key: 'VOICEVOX_AUTOSTART',
    configKey: 'autostartEngine',
    group: 'engine',
    type: 'boolean',
    label: 'エンジンを自動起動する',
    defaultValue: '1',
    help: 'オフにすると、自分でVOICEVOXを起動していないときは黙る。',
  },
  {
    key: 'VOICEVOX_ENGINE_EXE',
    group: 'engine',
    type: 'text',
    label: 'エンジンの実行ファイル',
    defaultValue: '',
    placeholder: '(空欄なら自動で探す)',
    help: '自動で見つからないときだけ run.exe のパスを入れる。空欄に戻すと自動探索。',
  },
  {
    key: 'VOICEVOX_ENGINE_BOOT_TIMEOUT_MS',
    configKey: 'engineBootTimeoutMs',
    group: 'engine',
    type: 'number',
    integer: true,
    label: '起動を待つ上限',
    unit: 'ミリ秒',
    defaultValue: '90000',
    min: 0,
    max: 600_000,
    step: 1000,
    help: 'GPU版は初回のモデル読み込みが長い。90000 = 90秒。',
  },
  {
    key: 'VOICEVOX_REQUEST_TIMEOUT_MS',
    configKey: 'requestTimeoutMs',
    group: 'engine',
    type: 'number',
    integer: true,
    label: '音声合成を待つ上限',
    unit: 'ミリ秒',
    defaultValue: '30000',
    min: 1000,
    max: 600_000,
    step: 1000,
    help: '長文で合成が間に合わないときだけ増やす。',
  },
  {
    key: 'CLAUDE_VOICEVOX_TMP',
    group: 'engine',
    type: 'text',
    label: '一時ファイルの置き場',
    defaultValue: '',
    placeholder: '(空欄ならOSの一時フォルダ)',
    help: '合成したWAVの置き場の親フォルダ。配下に claude-voicevox フォルダを作る。',
  },
];

/** キーから定義を引く。 */
export function findParam(key) {
  return PARAMS.find((param) => param.key === key) ?? null;
}

/** 書き込みを許すキーの一覧。これ以外のキーは settings.json に触らせない。 */
export function writableKeys() {
  return PARAMS.map((param) => param.key);
}

/** 真偽値の表示用。`readBoolean` と同じ判定にそろえる。 */
const FALSE_WORDS = ['0', 'false', 'off', 'no'];

export function isFalsy(raw) {
  return FALSE_WORDS.includes(String(raw).trim().toLowerCase());
}

/**
 * 1つの値を検証して、保存する形の文字列にそろえる。
 *
 * `config.mjs` は壊れた値を黙って既定値に戻す(読み上げのために止まらない方針)。
 * だがGUIで黙って戻すと「設定したのに効かない」に見えるので、
 * ここでは戻さずエラーとして突き返す。これがGUIの安全性の中心。
 *
 * @returns {{ok: true, value: string} | {ok: false, message: string}}
 */
export function validateValue(param, raw) {
  const text = String(raw ?? '').trim();

  if (param.type === 'boolean') {
    if (text === '') return { ok: true, value: param.defaultValue };
    return { ok: true, value: isFalsy(text) ? '0' : '1' };
  }

  if (param.type === 'enum') {
    if (text === '') return { ok: true, value: param.defaultValue };
    const match = param.choices.find((choice) => choice.value === text.toLowerCase());
    if (!match) {
      const allowed = param.choices.map((choice) => choice.value).join(' / ');
      return { ok: false, message: `${allowed} のいずれかを選んでください(入力: ${text})` };
    }
    return { ok: true, value: match.value };
  }

  if (param.type === 'number') {
    if (text === '') return { ok: true, value: param.defaultValue };
    const value = Number(text);
    if (!Number.isFinite(value)) {
      return { ok: false, message: `数値を入れてください(入力: ${text})` };
    }
    if (param.integer && !Number.isInteger(value)) {
      return { ok: false, message: `整数を入れてください(入力: ${text})` };
    }
    if (typeof param.min === 'number' && value < param.min) {
      return { ok: false, message: `${param.min} 以上にしてください(入力: ${text})` };
    }
    if (typeof param.max === 'number' && value > param.max) {
      return { ok: false, message: `${param.max} 以下にしてください(入力: ${text})` };
    }
    return { ok: true, value: String(value) };
  }

  // text: 空欄は「設定しない」。URLだけは形を見る。
  if (param.key === 'VOICEVOX_URL' && text !== '') {
    let parsed;
    try {
      parsed = new URL(text);
    } catch {
      return { ok: false, message: `http://ホスト:ポート の形で入れてください(入力: ${text})` };
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { ok: false, message: `http か https にしてください(入力: ${text})` };
    }
  }
  return { ok: true, value: text };
}

/**
 * 画面から来たまとまりを検証する。
 *
 * 空欄にされた項目は `removals` に入れて「キーごと消す」扱いにする。
 * 既定値と同じ値をどうするか(書くか書かないか)はここでは決めない。
 * 既にユーザーが置いたキーを勝手に消すと驚くので、現在のファイルを見て
 * `settings-writer.mjs` 側が判断する。
 *
 * @param {Record<string, unknown>} values
 * @returns {{errors: Record<string,string>, values: Record<string,string>, removals: string[]}}
 */
export function validateValues(values) {
  const errors = {};
  const accepted = {};
  const removals = [];

  for (const [key, raw] of Object.entries(values ?? {})) {
    const param = findParam(key);
    if (!param) {
      errors[key] = '知らない設定キーです';
      continue;
    }
    const result = validateValue(param, raw);
    if (!result.ok) {
      errors[key] = result.message;
      continue;
    }
    if (result.value === '') {
      removals.push(key);
    } else {
      accepted[key] = result.value;
    }
  }

  return { errors, values: accepted, removals };
}
