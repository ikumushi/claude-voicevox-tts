#!/usr/bin/env node
/**
 * Claude Code の Stop / Notification Hook 本体。
 *
 * 標準入力でHookのJSONを受け取り、読み上げるテキストを決めて、
 * 別プロセス(speak.mjs)に投げてすぐ終わる。
 *
 * 大事な約束:
 * - 標準出力には何も書かない(Claude Codeの動作に口を出さない)。
 * - 何が起きても終了コード0で終わる。読み上げの失敗で作業を止めない。
 * - 合成・再生を待たない。ターンの終わりを遅くしないため。
 */

import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadConfig } from './config.mjs';
import { extractFinalAssistantText, toNotificationSpeech } from './extract.mjs';
import { toSpeakableText } from './normalize.mjs';
import { ensureWorkDir } from './play.mjs';
import { extractSummarySection } from './section.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** 同じ文面が立て続けに来たら読み上げない。この時間内なら重複とみなす。 */
const DEDUPE_WINDOW_MS = 30_000;

/** 標準入力をこの時間内に読み切れなければ諦める。 */
const STDIN_TIMEOUT_MS = 3000;

function log(message) {
  process.stderr.write(`[voicevox-hook] ${message}\n`);
}

async function readStdin() {
  process.stdin.setEncoding('utf8');
  const timeout = new Promise((resolve) => setTimeout(() => resolve(null), STDIN_TIMEOUT_MS));
  const read = (async () => {
    let data = '';
    for await (const chunk of process.stdin) data += chunk;
    return data;
  })();
  return Promise.race([read, timeout]);
}

/** Stop Hook: トランスクリプトから最終応答を取り出して、読める形に直す。 */
function buildStopSpeech(payload, config) {
  const transcriptPath = payload.transcript_path;
  if (typeof transcriptPath !== 'string' || !fs.existsSync(transcriptPath)) {
    log('トランスクリプトが見つかりませんでした。');
    return '';
  }
  const lines = fs.readFileSync(transcriptPath, 'utf8').split('\n');
  const response = extractFinalAssistantText(lines);

  // サマリ節だけを読む設定でも、節が無い応答(短い返答や質問への回答)は
  // 黙ってしまうと不便なので応答全体に戻す。
  const body =
    config.readScope === 'summary' ? extractSummarySection(response) || response : response;

  return toSpeakableText(body, { maxChars: config.maxChars });
}

/**
 * 直前に同じ文面を読んでいないか確認し、読んでよければ記録する。
 * Hookが二重に走ったときに同じ応答を2回聞かされるのを防ぐ。
 */
function shouldSpeak(config, text) {
  const file = path.join(config.workDir, 'last-spoken.txt');
  const hash = crypto.createHash('sha256').update(text).digest('hex');
  try {
    const stat = fs.statSync(file);
    const recent = Date.now() - stat.mtimeMs < DEDUPE_WINDOW_MS;
    if (recent && fs.readFileSync(file, 'utf8').trim() === hash) return false;
  } catch {
    // 記録が無ければ初回。読み上げてよい。
  }
  try {
    fs.writeFileSync(file, hash, 'utf8');
  } catch {
    // 記録できなくても読み上げは続ける。
  }
  return true;
}

/** テキストをファイルに書き、ワーカーを切り離して起動する。 */
function dispatchToWorker(config, text) {
  const textFile = path.join(config.workDir, `speech-${process.pid}-${Date.now()}.txt`);
  fs.writeFileSync(textFile, text, 'utf8');

  const worker = spawn(process.execPath, [path.join(HERE, 'speak.mjs'), textFile], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    env: process.env,
  });
  worker.unref();
}

async function main() {
  const config = loadConfig();
  if (!config.enabled) return;

  const raw = await readStdin();
  if (!raw) return;

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    log('Hookの入力をJSONとして読めませんでした。');
    return;
  }

  const event = payload.hook_event_name ?? 'Stop';
  let text = '';

  if (event === 'Notification') {
    if (!config.speakNotifications) return;
    text = toNotificationSpeech(payload.message);
  } else {
    text = buildStopSpeech(payload, config);
  }

  if (text.trim() === '') return;

  ensureWorkDir(config.workDir);
  if (!shouldSpeak(config, text)) return;

  dispatchToWorker(config, text);
}

main()
  .catch((error) => log(`想定外のエラー: ${error.message}`))
  .finally(() => process.exit(0));
