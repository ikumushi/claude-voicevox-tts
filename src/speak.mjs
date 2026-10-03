#!/usr/bin/env node
/**
 * 読み上げの実作業をするワーカー。Hookから切り離して起動される。
 *
 * Hook本体(speak-hook.mjs)は即座に終わる必要があるので、
 * 合成と再生(数百ミリ秒〜数秒)はこのプロセスに任せている。
 *
 * 使い方: node src/speak.mjs <読み上げるテキストを書いたファイル>
 */

import fs from 'node:fs';

import { loadConfig } from './config.mjs';
import { ensureEngineRunning, synthesizeWav } from './engine.mjs';
import {
  cleanupStaleWavFiles,
  playWavFile,
  releasePlayback,
  takeOverPlayback,
  writeWavFile,
} from './play.mjs';

function log(message) {
  process.stderr.write(`[voicevox] ${message}\n`);
}

async function main() {
  const textFile = process.argv[2];
  if (!textFile) {
    log('読み上げるテキストのファイルが指定されていません。');
    process.exit(1);
  }

  const text = fs.readFileSync(textFile, 'utf8').trim();
  try {
    fs.unlinkSync(textFile);
  } catch {
    // 消せなくても読み上げには影響しない。
  }
  if (text === '') return;

  const config = loadConfig();
  let wavPath = null;

  // 前のターンの読み上げを止めてから、自分の再生を始める。
  await takeOverPlayback(config.workDir);
  cleanupStaleWavFiles(config.workDir);

  try {
    if (!(await ensureEngineRunning(config))) return;
    const wav = await synthesizeWav(config, text);
    wavPath = writeWavFile(config.workDir, wav);
    await playWavFile(wavPath);
  } catch (error) {
    log(`読み上げに失敗しました: ${error.message}`);
  } finally {
    if (wavPath) {
      try {
        fs.unlinkSync(wavPath);
      } catch {
        // 掃除は cleanupStaleWavFiles が後で引き受ける。
      }
    }
    releasePlayback(config.workDir);
  }
}

main().catch((error) => {
  log(`想定外のエラー: ${error.message}`);
  process.exit(1);
});
