/**
 * VOICEVOX ENGINE の HTTP API を叩く部分。
 *
 * エンジンは http://127.0.0.1:50021 で待ち受けるローカルサーバ。
 * 合成は2段階:
 *   1. /audio_query  … 読み(アクセント)の下書きを作る
 *   2. /synthesis    … 下書きに速度などを反映してWAVを得る
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';

function log(message) {
  process.stderr.write(`[voicevox] ${message}\n`);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** エンジンが応答するか見る。起動していなければ null を返す。 */
export async function fetchVersion(config) {
  try {
    const response = await fetch(`${config.url}/version`, {
      signal: AbortSignal.timeout(2000),
    });
    if (!response.ok) return null;
    return (await response.text()).trim();
  } catch {
    return null;
  }
}

/** 話者の一覧。どのIDが誰なのかを調べるために使う。 */
export async function fetchSpeakers(config) {
  const response = await fetch(`${config.url}/speakers`, {
    signal: AbortSignal.timeout(config.requestTimeoutMs),
  });
  if (!response.ok) throw new Error(`/speakers が ${response.status} を返しました`);
  return response.json();
}

/**
 * エンジンが起きていなければ起動して、応答するまで待つ。
 * 既に起きていれば何もしない。
 */
export async function ensureEngineRunning(config) {
  if (await fetchVersion(config)) return true;
  if (!config.autostartEngine) {
    log('エンジンが起動しておらず、自動起動は無効です。');
    return false;
  }

  const exe = config.engineExeCandidates.find((candidate) => fs.existsSync(candidate));
  if (!exe) {
    log('エンジンの実行ファイルが見つかりません。VOICEVOX_ENGINE_EXE を設定してください。');
    return false;
  }

  log(`エンジンを起動します: ${exe}`);
  const child = spawn(exe, [], { detached: true, stdio: 'ignore', windowsHide: true });
  child.unref();

  const deadline = Date.now() + config.engineBootTimeoutMs;
  while (Date.now() < deadline) {
    await sleep(700);
    if (await fetchVersion(config)) return true;
  }

  log('エンジンの起動を待ちましたが応答がありませんでした。');
  return false;
}

/**
 * テキストをWAV(Buffer)に合成する。
 * @returns {Promise<Buffer>}
 */
export async function synthesizeWav(config, text) {
  const queryUrl = `${config.url}/audio_query?speaker=${encodeURIComponent(
    config.speaker,
  )}&text=${encodeURIComponent(text)}`;

  const queryResponse = await fetch(queryUrl, {
    method: 'POST',
    signal: AbortSignal.timeout(config.requestTimeoutMs),
  });
  if (!queryResponse.ok) {
    throw new Error(`/audio_query が ${queryResponse.status} を返しました`);
  }
  const query = await queryResponse.json();

  query.speedScale = config.speedScale;
  query.pitchScale = config.pitchScale;
  query.intonationScale = config.intonationScale;
  query.volumeScale = config.volumeScale;
  // 前後の無音を詰めて、応答が終わってからの待ち時間を短くする。
  query.prePhonemeLength = 0.05;
  query.postPhonemeLength = 0.1;

  const synthesisResponse = await fetch(
    `${config.url}/synthesis?speaker=${encodeURIComponent(config.speaker)}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'audio/wav' },
      body: JSON.stringify(query),
      signal: AbortSignal.timeout(config.requestTimeoutMs),
    },
  );
  if (!synthesisResponse.ok) {
    throw new Error(`/synthesis が ${synthesisResponse.status} を返しました`);
  }

  return Buffer.from(await synthesisResponse.arrayBuffer());
}
