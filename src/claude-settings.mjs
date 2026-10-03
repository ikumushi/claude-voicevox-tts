/**
 * `~/.claude/settings.json` の `env` ブロックから、このツールの設定を読む。
 *
 * なぜ必要か:
 * Hook は Claude Code の子プロセスとして動くので、`settings.json` の `env` が
 * 環境変数として渡ってくる。しかしユーザーが自分のターミナルで `npm run status` を
 * 叩いたときは渡ってこないため、既定値が表示されて実際の設定と食い違う。
 * そこで settings.json を直接読み、環境変数の「下敷き」として使う。
 *
 * `VOICEVOX_` / `CLAUDE_VOICEVOX_` で始まるキーだけを拾う。settings.json には
 * API トークンなどの無関係な秘密情報も入りうるので、このツールの設定以外は読み込まない。
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * このツールが使う設定キーの接頭辞。
 * `CLAUDE_VOICEVOX_TMP` だけ接頭辞が違うため2つ並べている。
 * ここを緩めると無関係な秘密情報まで読み込んでしまうので増やさない。
 */
const KEY_PREFIXES = ['VOICEVOX_', 'CLAUDE_VOICEVOX_'];

export function claudeSettingsPath(homeDir = os.homedir()) {
  return path.join(homeDir, '.claude', 'settings.json');
}

/** このツールの設定キーかどうか。 */
function isOwnKey(key) {
  return KEY_PREFIXES.some((prefix) => key.startsWith(prefix));
}

/**
 * settings.json の env から このツールの設定キーだけを取り出す。
 * ファイルが無い・壊れている場合は空オブジェクト(読み上げを止める理由にはしない)。
 *
 * @param {string} settingsFile
 * @returns {Record<string, string>}
 */
export function readVoicevoxEnv(settingsFile = claudeSettingsPath()) {
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
  } catch {
    return {};
  }

  const env = parsed?.env;
  if (env === null || typeof env !== 'object' || Array.isArray(env)) return {};

  return Object.fromEntries(
    Object.entries(env)
      .filter(([key, value]) => isOwnKey(key) && typeof value === 'string')
      .map(([key, value]) => [key, value]),
  );
}

/**
 * 実際に使われる設定値を組み立てる。
 * 環境変数が勝ち、無いものだけ settings.json で埋める。
 *
 * @param {Record<string, string|undefined>} env
 * @param {string} settingsFile
 */
export function effectiveEnv(env = process.env, settingsFile = claudeSettingsPath()) {
  return { ...readVoicevoxEnv(settingsFile), ...env };
}
