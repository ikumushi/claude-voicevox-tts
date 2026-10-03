import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { claudeSettingsPath, effectiveEnv, readVoicevoxEnv } from '../src/claude-settings.mjs';

/** 一時的な settings.json を作る。テストごとに消す。 */
const created = [];
function writeSettings(contents) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'voicevox-test-'));
  const file = path.join(dir, 'settings.json');
  fs.writeFileSync(file, contents, 'utf8');
  created.push(dir);
  return file;
}

afterEach(() => {
  while (created.length > 0) {
    fs.rmSync(created.pop(), { recursive: true, force: true });
  }
});

describe('claudeSettingsPath', () => {
  it('ホーム配下の .claude/settings.json を指す', () => {
    expect(claudeSettingsPath('C:/Users/someone')).toBe(
      path.join('C:/Users/someone', '.claude', 'settings.json'),
    );
  });
});

describe('readVoicevoxEnv', () => {
  it('env から VOICEVOX_* のキーだけを拾う', () => {
    const file = writeSettings(
      JSON.stringify({
        env: {
          VOICEVOX_SPEAKER: '8',
          VOICEVOX_READ_SCOPE: 'summary',
          SOME_API_TOKEN: 'secret-value',
        },
        hooks: {},
      }),
    );
    expect(readVoicevoxEnv(file)).toEqual({
      VOICEVOX_SPEAKER: '8',
      VOICEVOX_READ_SCOPE: 'summary',
    });
  });

  it('無関係な秘密情報は読み込まない', () => {
    const file = writeSettings(JSON.stringify({ env: { APPROVE_RELAY_PC_TOKEN: 'secret' } }));
    expect(readVoicevoxEnv(file)).toEqual({});
  });

  /** 一時ファイル置き場だけ接頭辞が CLAUDE_VOICEVOX_ なので、こちらも拾う必要がある。 */
  it('CLAUDE_VOICEVOX_ で始まるキーも拾う', () => {
    const file = writeSettings(
      JSON.stringify({ env: { CLAUDE_VOICEVOX_TMP: 'D:/tmp', CLAUDE_CODE_OTHER: 'x' } }),
    );
    expect(readVoicevoxEnv(file)).toEqual({ CLAUDE_VOICEVOX_TMP: 'D:/tmp' });
  });

  it('文字列でない値は無視する', () => {
    const file = writeSettings(JSON.stringify({ env: { VOICEVOX_SPEED: 1.5 } }));
    expect(readVoicevoxEnv(file)).toEqual({});
  });

  it('env が無い・配列・nullでも落ちない', () => {
    expect(readVoicevoxEnv(writeSettings(JSON.stringify({})))).toEqual({});
    expect(readVoicevoxEnv(writeSettings(JSON.stringify({ env: [] })))).toEqual({});
    expect(readVoicevoxEnv(writeSettings(JSON.stringify({ env: null })))).toEqual({});
  });

  it('ファイルが無い・壊れていても空を返す', () => {
    expect(readVoicevoxEnv('C:/does/not/exist/settings.json')).toEqual({});
    expect(readVoicevoxEnv(writeSettings('{ 壊れたJSON'))).toEqual({});
  });
});

describe('effectiveEnv', () => {
  it('環境変数が無いキーを settings.json で埋める', () => {
    const file = writeSettings(
      JSON.stringify({ env: { VOICEVOX_SPEAKER: '8', VOICEVOX_SPEED: '1.5' } }),
    );
    const result = effectiveEnv({ PATH: '/usr/bin' }, file);
    expect(result.VOICEVOX_SPEAKER).toBe('8');
    expect(result.VOICEVOX_SPEED).toBe('1.5');
    expect(result.PATH).toBe('/usr/bin');
  });

  it('環境変数が settings.json より優先される', () => {
    const file = writeSettings(JSON.stringify({ env: { VOICEVOX_SPEAKER: '8' } }));
    expect(effectiveEnv({ VOICEVOX_SPEAKER: '3' }, file).VOICEVOX_SPEAKER).toBe('3');
  });
});
