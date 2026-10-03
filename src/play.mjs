/**
 * 合成したWAVを鳴らす部分と、「前の読み上げを止める」仕組み。
 *
 * 再生は PowerShell の System.Media.SoundPlayer に任せている(追加インストール不要)。
 * -NoProfile を付けているので、ユーザーのプロファイル読み込みで待たされない。
 */

import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/** プロセスIDの記録が古すぎたら、別のプロセスに割り当て直されている恐れがあるので無視する。 */
const PID_FILE_MAX_AGE_MS = 5 * 60 * 1000;

/** 再生し終わらずに残ったWAVを掃除するまでの時間。 */
const STALE_WAV_MAX_AGE_MS = 10 * 60 * 1000;

function log(message) {
  process.stderr.write(`[voicevox] ${message}\n`);
}

export function ensureWorkDir(workDir) {
  fs.mkdirSync(workDir, { recursive: true });
  return workDir;
}

function pidFilePath(workDir) {
  return path.join(workDir, 'worker.pid');
}

/** プロセスツリーごと落とす。Windowsでは親を殺しても子(PowerShell)が残るため /T を使う。 */
function killProcessTree(pid) {
  return new Promise((resolve) => {
    execFile('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true }, () => resolve());
  });
}

/**
 * 前のターンの読み上げが残っていたら止める。
 * そのうえで自分のプロセスIDを記録し、次のターンから止められるようにする。
 */
export async function takeOverPlayback(workDir) {
  ensureWorkDir(workDir);
  const file = pidFilePath(workDir);

  try {
    const stat = fs.statSync(file);
    const fresh = Date.now() - stat.mtimeMs < PID_FILE_MAX_AGE_MS;
    const previousPid = Number(fs.readFileSync(file, 'utf8').trim());
    if (fresh && Number.isInteger(previousPid) && previousPid > 0 && previousPid !== process.pid) {
      await killProcessTree(previousPid);
    }
  } catch {
    // 記録が無い(初回)か読めないだけ。そのまま進める。
  }

  fs.writeFileSync(file, String(process.pid), 'utf8');
}

/** 自分の記録を片付ける。別プロセスが上書きしていたら触らない。 */
export function releasePlayback(workDir) {
  const file = pidFilePath(workDir);
  try {
    if (fs.readFileSync(file, 'utf8').trim() === String(process.pid)) fs.unlinkSync(file);
  } catch {
    // 消えていれば何もしなくてよい。
  }
}

/** 中断されて残ったWAVを掃除する。 */
export function cleanupStaleWavFiles(workDir) {
  let entries = [];
  try {
    entries = fs.readdirSync(workDir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!entry.endsWith('.wav')) continue;
    const target = path.join(workDir, entry);
    try {
      if (Date.now() - fs.statSync(target).mtimeMs > STALE_WAV_MAX_AGE_MS) fs.unlinkSync(target);
    } catch {
      // 再生中で消せないこともある。次回に任せる。
    }
  }
}

export function writeWavFile(workDir, wav) {
  ensureWorkDir(workDir);
  const target = path.join(workDir, `speech-${process.pid}-${Date.now()}.wav`);
  fs.writeFileSync(target, wav);
  return target;
}

/** WAVを鳴らし終わるまで待つ。 */
export function playWavFile(wavPath) {
  return new Promise((resolve) => {
    const script = `$player = New-Object System.Media.SoundPlayer -ArgumentList '${wavPath.replace(
      /'/g,
      "''",
    )}'; $player.PlaySync()`;

    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { stdio: 'ignore', windowsHide: true },
    );

    child.on('error', (error) => {
      log(`再生に失敗しました: ${error.message}`);
      resolve();
    });
    child.on('exit', () => resolve());
  });
}
