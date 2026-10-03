#!/usr/bin/env node
/**
 * 設定を画面から変えるためのローカルサーバ。
 *
 *   npm run gui            … サーバを起動してブラウザを開く
 *   npm run gui -- --no-open … 開かずにURLだけ出す
 *
 * なぜブラウザか:
 * Windowsに最初から入っているもので完結させたい(追加インストールを増やさない)。
 * Node と既定のブラウザだけで動く。
 *
 * このサーバは settings.json を書き換えられるので、守りを3つ入れている。
 *   1. 127.0.0.1 にだけ待ち受ける(同じLANの別の機械からは届かない)
 *   2. 起動時に作った使い捨てトークンが無いAPIは断る
 *      (悪意のあるWebページが裏でこのサーバを叩くのを防ぐ。トークンは画面にしか渡らない)
 *   3. Host ヘッダが localhost 以外なら断る(DNSの付け替えで外から狙われるのを防ぐ)
 */

import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { claudeSettingsPath } from './claude-settings.mjs';
import { loadConfig } from './config.mjs';
import {
  ensureEngineRunning,
  fetchSpeakers,
  fetchVersion,
  findEngineExe,
  synthesizeWav,
} from './engine.mjs';
import { PARAMS, PARAM_GROUPS, validateValues, writableKeys } from './param-spec.mjs';
import {
  cleanupStaleWavFiles,
  playWavFile,
  releasePlayback,
  takeOverPlayback,
  writeWavFile,
} from './play.mjs';
import { backupPath, readSettings, restoreBackup, saveVoicevoxEnv } from './settings-writer.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PAGE_FILE = path.join(HERE, 'gui', 'index.html');

/** 既定のポート。VOICEVOX ENGINE(50021)とぶつからない番号。 */
const DEFAULT_PORT = 50080;

/** 受け取るリクエスト本文の上限。設定値しか来ないので小さくしてよい。 */
const MAX_BODY_BYTES = 64 * 1024;

const TOKEN = crypto.randomBytes(16).toString('hex');

function log(message) {
  process.stdout.write(`${message}\n`);
}

/** ローカルからのアクセスか確かめる。 */
function isLocalHost(req) {
  const host = req.headers.host ?? '';
  return /^(127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(host);
}

function sendJson(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(text);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('リクエストが大きすぎます'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      if (text.trim() === '') return resolve({});
      try {
        resolve(JSON.parse(text));
      } catch {
        reject(new Error('リクエストの形が正しくありません'));
      }
    });
    req.on('error', reject);
  });
}

/** settings.json に実際に書かれている値(このツールのキーだけ)。 */
function storedValues(settingsFile) {
  const { data } = readSettings(settingsFile);
  const env = data.env;
  if (env === null || typeof env !== 'object' || Array.isArray(env)) return {};
  const allowed = new Set(writableKeys());
  return Object.fromEntries(
    Object.entries(env)
      .filter(([key]) => allowed.has(key))
      .map(([key, value]) => [key, String(value)]),
  );
}

/** 画面を描くのに必要な情報をまとめて返す。 */
async function buildState(settingsFile) {
  const config = loadConfig();
  const version = await fetchVersion(config);
  return {
    groups: PARAM_GROUPS,
    params: PARAMS,
    stored: storedValues(settingsFile),
    effective: {
      speaker: config.speaker,
      speedScale: config.speedScale,
      readScope: config.readScope,
      maxChars: config.maxChars,
      enabled: config.enabled,
      workDir: config.workDir,
    },
    engine: {
      url: config.url,
      version,
      running: Boolean(version),
      exe: findEngineExe(config),
    },
    settingsFile,
    hasBackup: fs.existsSync(backupPath(settingsFile)),
  };
}

/** 画面から来た値で、保存せずに1回だけ読み上げる。 */
async function preview(rawValues, text) {
  const { errors, values, removals } = validateValues(rawValues ?? {});
  if (Object.keys(errors).length > 0) {
    const error = new Error('値に問題があるため試聴できません。');
    error.fieldErrors = errors;
    throw error;
  }

  // 保存前の値で鳴らすため、環境変数を上書きした一時的な設定を組み立てる。
  const env = { ...process.env, ...values };
  for (const key of removals) delete env[key];
  const config = loadConfig(env);

  if (!config.enabled) throw new Error('読み上げが無効になっています。');
  if (!(await ensureEngineRunning(config))) {
    throw new Error('VOICEVOX ENGINE を起動できませんでした。');
  }

  await takeOverPlayback(config.workDir);
  cleanupStaleWavFiles(config.workDir);
  const wavPath = writeWavFile(config.workDir, await synthesizeWav(config, text));
  try {
    await playWavFile(wavPath);
  } finally {
    try {
      fs.unlinkSync(wavPath);
    } catch {
      // 掃除は cleanupStaleWavFiles が後で引き受ける。
    }
    releasePlayback(config.workDir);
  }
}

async function handleApi(req, res, url, settingsFile) {
  if (req.headers['x-voicevox-token'] !== TOKEN) {
    return sendJson(res, 403, { message: 'トークンが違います。GUIを開き直してください。' });
  }

  if (url.pathname === '/api/state' && req.method === 'GET') {
    return sendJson(res, 200, await buildState(settingsFile));
  }

  if (url.pathname === '/api/speakers' && req.method === 'GET') {
    const config = loadConfig();
    if (!(await ensureEngineRunning(config))) {
      return sendJson(res, 503, { message: 'エンジンが起動していないため一覧を取れません。' });
    }
    const speakers = (await fetchSpeakers(config)).flatMap((speaker) =>
      (speaker.styles ?? []).map((style) => ({
        id: style.id,
        label: `${speaker.name}(${style.name})`,
      })),
    );
    return sendJson(res, 200, { speakers });
  }

  if (url.pathname === '/api/save' && req.method === 'POST') {
    const body = await readBody(req);
    const result = saveVoicevoxEnv(body.values ?? {}, settingsFile);
    log(
      result.changes.length === 0
        ? '保存: 変更なし'
        : `保存: ${result.changes.map((change) => change.key).join(', ')}`,
    );
    return sendJson(res, 200, { ...result, state: await buildState(settingsFile) });
  }

  if (url.pathname === '/api/restore' && req.method === 'POST') {
    const result = restoreBackup(settingsFile);
    log('バックアップから復元しました。');
    return sendJson(res, 200, { ...result, state: await buildState(settingsFile) });
  }

  if (url.pathname === '/api/preview' && req.method === 'POST') {
    const body = await readBody(req);
    const text = String(body.text ?? '').trim();
    if (text === '') return sendJson(res, 400, { message: '試聴する文を入れてください。' });
    await preview(body.values, text.slice(0, 300));
    return sendJson(res, 200, { ok: true });
  }

  return sendJson(res, 404, { message: '不明なAPIです。' });
}

function handleRequest(settingsFile) {
  return async (req, res) => {
    if (!isLocalHost(req)) {
      res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('このサーバはこのパソコンからのみ使えます。\n');
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host}`);

    try {
      if (url.pathname.startsWith('/api/')) {
        await handleApi(req, res, url, settingsFile);
        return;
      }

      if (url.pathname === '/' && req.method === 'GET') {
        if (url.searchParams.get('token') !== TOKEN) {
          res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
          res.end('URLのトークンが違います。ターミナルに出たURLを開いてください。\n');
          return;
        }
        // 毎回読み直すので、HTMLを直したらリロードだけで反映される。
        const page = fs.readFileSync(PAGE_FILE, 'utf8').replace('__TOKEN__', TOKEN);
        res.writeHead(200, {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'no-store',
        });
        res.end(page);
        return;
      }

      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('見つかりません\n');
    } catch (error) {
      const body = { message: error.message };
      if (error.fieldErrors) body.fieldErrors = error.fieldErrors;
      sendJson(res, 400, body);
    }
  };
}

function openInBrowser(target) {
  // cmd の start はURLを既定のブラウザで開く。追加インストールが要らない。
  const child = spawn('cmd', ['/c', 'start', '""', target], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  child.unref();
}

/**
 * 保存先の settings.json。
 * `--settings <パス>` は動作確認用。本物を書き換えずに試せるようにしている。
 */
function settingsFileFrom(args) {
  const index = args.indexOf('--settings');
  if (index !== -1 && args[index + 1]) return path.resolve(args[index + 1]);
  return claudeSettingsPath();
}

function main() {
  const args = process.argv.slice(2);
  const settingsFile = settingsFileFrom(args);
  const port = Number(process.env.VOICEVOX_GUI_PORT ?? DEFAULT_PORT);

  // 起動前に設定ファイルが読めるか確かめる。壊れていればここで止めて理由を出す。
  try {
    readSettings(settingsFile);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  }

  const server = http.createServer(handleRequest(settingsFile));
  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      process.stderr.write(
        `ポート ${port} は使用中です。VOICEVOX_GUI_PORT で別の番号を指定してください。\n`,
      );
    } else {
      process.stderr.write(`${error.message}\n`);
    }
    process.exit(1);
  });

  server.listen(port, '127.0.0.1', () => {
    const target = `http://127.0.0.1:${port}/?token=${TOKEN}`;
    log('VOICEVOX 設定画面を開きました。閉じるときはこのウィンドウで Ctrl+C を押してください。');
    log(`  設定ファイル: ${settingsFile}`);
    log(`  URL         : ${target}`);
    if (!args.includes('--no-open')) openInBrowser(target);
  });
}

main();
