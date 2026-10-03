/**
 * `~/.claude/settings.json` の `env` ブロックを書き換える。
 *
 * このファイルには Hook の登録や他のツールの設定も入っている。
 * 壊すと Claude Code 自体の動作に影響するため、次の約束を守る。
 *
 *   1. 触るのは `env` の下の、`param-spec.mjs` が許したキーだけ。
 *   2. 読めない(JSONとして壊れている)ファイルは絶対に上書きしない。
 *      手で編集して壊れている最中かもしれないので、こちらが上書きすると直せなくなる。
 *   3. 書く前に元の中身を `settings.json.voicevox-backup` に取る。
 *   4. 一時ファイルに書いてから置き換える。書き込み中に電源が落ちても元が残る。
 *   5. 書いた後に読み直して検証する。意図しない差分があればバックアップから戻す。
 *
 * 5 があるので、このモジュールが settings.json を壊したまま終わることはない。
 */

import fs from 'node:fs';
import path from 'node:path';

import { claudeSettingsPath } from './claude-settings.mjs';
import { findParam, validateValues, writableKeys } from './param-spec.mjs';

/** バックアップの置き場。元ファイルの隣に1つだけ持つ(世代は残さない)。 */
export function backupPath(settingsFile) {
  return `${settingsFile}.voicevox-backup`;
}

/** 書き込み中の一時ファイル。 */
function tempPath(settingsFile) {
  return `${settingsFile}.voicevox-tmp`;
}

/**
 * 現在の settings.json を読む。
 * @returns {{exists: boolean, text: string, data: object}}
 * @throws 壊れている場合(上書きさせないため、ここで止める)
 */
export function readSettings(settingsFile = claudeSettingsPath()) {
  let text;
  try {
    text = fs.readFileSync(settingsFile, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return { exists: false, text: '', data: {} };
    throw new Error(`設定ファイルを読めませんでした: ${error.message}`);
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    throw new Error(
      `設定ファイルがJSONとして壊れています。手で直すまで保存できません(${settingsFile}): ${error.message}`,
    );
  }
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('設定ファイルの中身が { } の形ではありません。保存を中止しました。');
  }
  return { exists: true, text, data };
}

/** `env` ブロックを取り出す。無い・形が違う場合は空として扱う。 */
function currentEnv(data) {
  const env = data.env;
  if (env === null || typeof env !== 'object' || Array.isArray(env)) return {};
  return env;
}

/**
 * これから何が変わるかを組み立てる。保存前に画面へ見せるためにも使う。
 *
 * 既定値と同じ値の扱い:
 *   - 既にキーがある  → そのまま書き続ける(ユーザーが置いたものを黙って消さない)
 *   - キーが無い      → 足さない(設定ファイルを無駄に増やさない)
 *
 * @param {Record<string,string>} values 検証済みの値
 * @param {string[]} removals 空欄にされたキー
 * @param {object} data 現在の settings.json の中身
 * @returns {{changes: Array<{key:string, from:string|null, to:string|null}>, nextEnv: Record<string,unknown>}}
 */
export function planChanges(values, removals, data) {
  const env = currentEnv(data);
  const nextEnv = { ...env };
  const changes = [];

  for (const key of removals) {
    if (key in nextEnv) {
      changes.push({ key, from: String(nextEnv[key]), to: null });
      delete nextEnv[key];
    }
  }

  for (const [key, value] of Object.entries(values)) {
    const param = findParam(key);
    const existing = key in env ? String(env[key]) : null;

    if (existing === null && value === param.defaultValue) continue;
    if (existing === value) continue;

    changes.push({ key, from: existing, to: value });
    nextEnv[key] = value;
  }

  return { changes, nextEnv };
}

/** 許したキー以外が `env` 内で変わっていないか確かめる。 */
function assertOnlyAllowedKeysChanged(before, after) {
  const allowed = new Set(writableKeys());
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of keys) {
    if (allowed.has(key)) continue;
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      throw new Error(`このツールが触ってはいけないキーが変わりました: ${key}`);
    }
  }
}

/**
 * 設定を保存する。
 *
 * @param {Record<string, unknown>} rawValues 画面から来た値
 * @param {string} settingsFile
 * @returns {{changes: Array<{key:string,from:string|null,to:string|null}>, backup: string|null, settingsFile: string}}
 */
export function saveVoicevoxEnv(rawValues, settingsFile = claudeSettingsPath()) {
  const { errors, values, removals } = validateValues(rawValues);
  if (Object.keys(errors).length > 0) {
    const error = new Error('値に問題があるため保存しませんでした。');
    error.fieldErrors = errors;
    throw error;
  }

  const { exists, text, data } = readSettings(settingsFile);
  const { changes, nextEnv } = planChanges(values, removals, data);
  if (changes.length === 0) {
    return { changes: [], backup: null, settingsFile };
  }

  assertOnlyAllowedKeysChanged(currentEnv(data), nextEnv);

  // `env` を元の位置に保ったまま差し替える(キーの並び順を保つ)。
  const next = { ...data };
  if ('env' in next || Object.keys(nextEnv).length > 0) next.env = nextEnv;

  const backup = exists ? backupPath(settingsFile) : null;
  if (backup) fs.writeFileSync(backup, text, 'utf8');

  const serialized = `${JSON.stringify(next, null, 2)}\n`;
  const temp = tempPath(settingsFile);
  fs.mkdirSync(path.dirname(settingsFile), { recursive: true });
  fs.writeFileSync(temp, serialized, 'utf8');
  fs.renameSync(temp, settingsFile);

  // 書けたつもりで壊していないか、読み直して確かめる。
  try {
    const verified = readSettings(settingsFile);
    if (JSON.stringify(verified.data) !== JSON.stringify(next)) {
      throw new Error('書き込んだ内容と読み直した内容が一致しません。');
    }
  } catch (error) {
    if (backup) fs.writeFileSync(settingsFile, text, 'utf8');
    throw new Error(
      `保存を取り消して元に戻しました(${error.message})。設定ファイルは変わっていません。`,
    );
  }

  return { changes, backup, settingsFile };
}

/** バックアップから戻す。GUIの「元に戻す」で使う。 */
export function restoreBackup(settingsFile = claudeSettingsPath()) {
  const backup = backupPath(settingsFile);
  const text = fs.readFileSync(backup, 'utf8');
  JSON.parse(text); // 戻す中身が壊れていないことを確かめてから書く
  fs.writeFileSync(settingsFile, text, 'utf8');
  return { settingsFile, backup };
}
