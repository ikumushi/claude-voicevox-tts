/**
 * 環境変数から設定を読む。
 *
 * Hookは `~/.claude/settings.json` の `env` 経由で環境変数を受け取るので、
 * 設定ファイルを別に持たずに環境変数だけで完結させている。
 */

import os from 'node:os';
import path from 'node:path';

/** VOICEVOX ENGINE の既定の待ち受け先。 */
const DEFAULT_URL = 'http://127.0.0.1:50021';

/** 既定の話者。3 = ずんだもん(ノーマル)。`npm run speakers` で一覧が出る。 */
const DEFAULT_SPEAKER = 3;

/** 読み上げ速度。1.0が標準。作業中のお供なので少し速めを既定にしている。 */
const DEFAULT_SPEED = 1.2;

/**
 * 1回に読み上げる最大文字数。これを超えたら文の区切りで打ち切る。
 *
 * 実測(速度1.2・ずんだもん)で1文字あたり約147ミリ秒なので、150文字で約22秒。
 * 400文字だと約59秒かかり、作業中に聞き続けるには長すぎた。
 */
const DEFAULT_MAX_CHARS = 150;

/** エンジンが起きるのを待つ上限(ミリ秒)。GPU版は初回のモデル読み込みが長い。 */
const DEFAULT_ENGINE_BOOT_TIMEOUT_MS = 90_000;

/** エンジンを自動起動するときに探す run.exe の候補。先に見つかったものを使う。 */
export function engineExeCandidates(env = process.env) {
  const local = env.LOCALAPPDATA ?? '';
  const programFiles = env.ProgramFiles ?? '';
  return [
    env.VOICEVOX_ENGINE_EXE,
    local && path.join(local, 'Programs', 'VOICEVOX', 'vv-engine', 'run.exe'),
    programFiles && path.join(programFiles, 'VOICEVOX', 'vv-engine', 'run.exe'),
    local && path.join(local, 'Programs', 'VOICEVOX', 'VOICEVOX.exe'),
  ].filter((candidate) => typeof candidate === 'string' && candidate.length > 0);
}

/**
 * winget でインストールした場合の置き場。
 * `winget install HiroshibaKazuyuki.VOICEVOX` はインストーラを走らせずzipを展開するだけなので、
 * `Programs\VOICEVOX` ではなく WinGet のパッケージ配下に入る。
 */
export function wingetPackagesDir(env = process.env) {
  if (!env.LOCALAPPDATA) return null;
  return path.join(env.LOCALAPPDATA, 'Microsoft', 'WinGet', 'Packages');
}

/**
 * WinGet のパッケージフォルダ名一覧から、エンジンの候補パスを組み立てる。
 * フォルダ名には識別子が付く(例: `HiroshibaKazuyuki.VOICEVOX_Microsoft.Winget.Source_8wekyb3d8bbwe`)
 * ため決め打ちできず、名前に VOICEVOX を含むものを拾う。
 */
export function wingetEngineCandidates(entryNames, packagesDir) {
  if (!packagesDir || !Array.isArray(entryNames)) return [];
  return entryNames
    .filter((name) => typeof name === 'string' && /voicevox/i.test(name))
    .map((name) => path.join(packagesDir, name, 'VOICEVOX', 'vv-engine', 'run.exe'));
}

/** 数値の環境変数を読む。壊れていたら既定値に戻す(読み上げのために止まる必要はない)。 */
function readNumber(raw, fallback, { min, max }) {
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  if (typeof min === 'number' && value < min) return fallback;
  if (typeof max === 'number' && value > max) return fallback;
  return value;
}

/** 真偽値の環境変数を読む。"0" / "false" / "off" / "no" を偽として扱う。 */
export function readBoolean(raw, fallback) {
  if (raw === undefined || raw === '') return fallback;
  return !['0', 'false', 'off', 'no'].includes(String(raw).trim().toLowerCase());
}

/** 一時ファイル置き場。合成したWAVとプロセスIDの記録をここに置く。 */
export function workDir(env = process.env) {
  return path.join(env.CLAUDE_VOICEVOX_TMP ?? os.tmpdir(), 'claude-voicevox');
}

export function loadConfig(env = process.env) {
  return {
    enabled: readBoolean(env.VOICEVOX_ENABLED, true),
    url: (env.VOICEVOX_URL ?? DEFAULT_URL).replace(/\/+$/, ''),
    speaker: readNumber(env.VOICEVOX_SPEAKER, DEFAULT_SPEAKER, { min: 0, max: 100_000 }),
    speedScale: readNumber(env.VOICEVOX_SPEED, DEFAULT_SPEED, { min: 0.5, max: 2 }),
    pitchScale: readNumber(env.VOICEVOX_PITCH, 0, { min: -0.15, max: 0.15 }),
    intonationScale: readNumber(env.VOICEVOX_INTONATION, 1, { min: 0, max: 2 }),
    volumeScale: readNumber(env.VOICEVOX_VOLUME, 1, { min: 0, max: 2 }),
    maxChars: readNumber(env.VOICEVOX_MAX_CHARS, DEFAULT_MAX_CHARS, { min: 20, max: 5000 }),
    requestTimeoutMs: readNumber(env.VOICEVOX_REQUEST_TIMEOUT_MS, 30_000, { min: 1000 }),
    engineBootTimeoutMs: readNumber(
      env.VOICEVOX_ENGINE_BOOT_TIMEOUT_MS,
      DEFAULT_ENGINE_BOOT_TIMEOUT_MS,
      { min: 0 },
    ),
    autostartEngine: readBoolean(env.VOICEVOX_AUTOSTART, true),
    speakNotifications: readBoolean(env.VOICEVOX_SPEAK_NOTIFICATIONS, true),
    engineExeCandidates: engineExeCandidates(env),
    wingetPackagesDir: wingetPackagesDir(env),
    workDir: workDir(env),
  };
}
