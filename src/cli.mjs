#!/usr/bin/env node
/**
 * 手元で試すためのCLI。
 *
 *   node src/cli.mjs "こんにちは"      … 読み上げる
 *   node src/cli.mjs --speakers        … 話者とIDの一覧を出す
 *   node src/cli.mjs --status          … エンジンの状態を見る
 */

import { loadConfig } from './config.mjs';
import { ensureEngineRunning, fetchSpeakers, fetchVersion, synthesizeWav } from './engine.mjs';
import {
  cleanupStaleWavFiles,
  playWavFile,
  releasePlayback,
  takeOverPlayback,
  writeWavFile,
} from './play.mjs';

async function printStatus(config) {
  const version = await fetchVersion(config);
  console.log(`エンジン: ${config.url}`);
  console.log(`状態    : ${version ? `起動中 (v${version})` : '応答なし'}`);
  console.log(`話者ID  : ${config.speaker}`);
  console.log(`速度    : ${config.speedScale}`);
  console.log(`上限    : ${config.maxChars}文字`);
  console.log(`一時置き場: ${config.workDir}`);
  if (!version) {
    const candidates = config.engineExeCandidates;
    console.log(`自動起動候補: ${candidates.length > 0 ? candidates.join(', ') : 'なし'}`);
  }
}

async function printSpeakers(config) {
  if (!(await ensureEngineRunning(config))) {
    console.error('エンジンが起動していないため話者一覧を取得できませんでした。');
    process.exit(1);
  }
  for (const speaker of await fetchSpeakers(config)) {
    for (const style of speaker.styles ?? []) {
      console.log(`${String(style.id).padStart(3)}  ${speaker.name} (${style.name})`);
    }
  }
}

async function speak(config, text) {
  if (!(await ensureEngineRunning(config))) {
    console.error('エンジンを起動できませんでした。');
    process.exit(1);
  }
  await takeOverPlayback(config.workDir);
  cleanupStaleWavFiles(config.workDir);
  const wavPath = writeWavFile(config.workDir, await synthesizeWav(config, text));
  await playWavFile(wavPath);
  releasePlayback(config.workDir);
}

async function main() {
  const config = loadConfig();
  const args = process.argv.slice(2);

  if (args.includes('--status')) return printStatus(config);
  if (args.includes('--speakers')) return printSpeakers(config);

  const text = args.filter((arg) => !arg.startsWith('--')).join(' ');
  if (text.trim() === '') {
    console.error('読み上げるテキストを渡してください。例: node src/cli.mjs "こんにちは"');
    process.exit(1);
  }
  return speak(config, text);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
