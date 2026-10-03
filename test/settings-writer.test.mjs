import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  backupPath,
  planChanges,
  readSettings,
  restoreBackup,
  saveVoicevoxEnv,
} from '../src/settings-writer.mjs';

const created = [];

/** 本物に近い settings.json を一時フォルダに作る。 */
function writeSettings(contents) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'voicevox-writer-'));
  const file = path.join(dir, 'settings.json');
  fs.writeFileSync(
    file,
    typeof contents === 'string' ? contents : JSON.stringify(contents, null, 2),
  );
  created.push(dir);
  return file;
}

/** ユーザーの実際の settings.json と同じ形(Hookと他ツールの設定が同居している)。 */
function realisticSettings() {
  return {
    env: {
      APPROVE_RELAY_URL: 'https://example.invalid/relay',
      VOICEVOX_READ_SCOPE: 'closing',
      VOICEVOX_SPEAKER: '2',
      VOICEVOX_SPEED: '1.2',
    },
    hooks: {
      Stop: [{ hooks: [{ type: 'command', command: 'node speak-hook.mjs', timeout: 10 }] }],
    },
    theme: 'dark',
  };
}

afterEach(() => {
  while (created.length > 0) {
    fs.rmSync(created.pop(), { recursive: true, force: true });
  }
});

describe('readSettings', () => {
  it('ファイルが無ければ空として扱う', () => {
    expect(readSettings('C:/does/not/exist/settings.json')).toEqual({
      exists: false,
      text: '',
      data: {},
    });
  });

  /** 手で編集して壊れている最中かもしれない。こちらが上書きすると直せなくなる。 */
  it('JSONとして壊れていれば例外にする(上書きさせない)', () => {
    const file = writeSettings('{ 壊れたJSON');
    expect(() => readSettings(file)).toThrow(/壊れています/);
  });

  it('中身が配列なら例外にする', () => {
    const file = writeSettings('[]');
    expect(() => readSettings(file)).toThrow(/\{ \} の形ではありません/);
  });
});

describe('planChanges', () => {
  const data = realisticSettings();

  it('変えた値だけを差分として挙げる', () => {
    const { changes } = planChanges({ VOICEVOX_SPEED: '1.5', VOICEVOX_SPEAKER: '2' }, [], data);
    expect(changes).toEqual([{ key: 'VOICEVOX_SPEED', from: '1.2', to: '1.5' }]);
  });

  /** 設定ファイルを無駄に太らせない。 */
  it('既定値どおりのキーは新しく足さない', () => {
    const { changes, nextEnv } = planChanges({ VOICEVOX_VOLUME: '1' }, [], data);
    expect(changes).toEqual([]);
    expect('VOICEVOX_VOLUME' in nextEnv).toBe(false);
  });

  /** ユーザーが自分で置いたキーが黙って消えると驚く。 */
  it('既にあるキーは既定値どおりでも消さない', () => {
    const { changes, nextEnv } = planChanges({ VOICEVOX_READ_SCOPE: 'closing' }, [], data);
    expect(changes).toEqual([]);
    expect(nextEnv.VOICEVOX_READ_SCOPE).toBe('closing');
  });

  it('空欄にされたキーは消す', () => {
    const { changes, nextEnv } = planChanges({}, ['VOICEVOX_SPEAKER'], data);
    expect(changes).toEqual([{ key: 'VOICEVOX_SPEAKER', from: '2', to: null }]);
    expect('VOICEVOX_SPEAKER' in nextEnv).toBe(false);
  });

  it('無関係なキーは差分にも結果にも影響しない', () => {
    const { nextEnv } = planChanges({ VOICEVOX_SPEED: '1.5' }, [], data);
    expect(nextEnv.APPROVE_RELAY_URL).toBe('https://example.invalid/relay');
  });
});

describe('saveVoicevoxEnv', () => {
  it('Hookと他ツールの設定を残したまま値を書き換える', () => {
    const file = writeSettings(realisticSettings());
    const result = saveVoicevoxEnv({ VOICEVOX_SPEED: '1.5' }, file);

    expect(result.changes).toEqual([{ key: 'VOICEVOX_SPEED', from: '1.2', to: '1.5' }]);
    const after = JSON.parse(fs.readFileSync(file, 'utf8'));
    expect(after.env.VOICEVOX_SPEED).toBe('1.5');
    expect(after.env.APPROVE_RELAY_URL).toBe('https://example.invalid/relay');
    expect(after.hooks).toEqual(realisticSettings().hooks);
    expect(after.theme).toBe('dark');
  });

  it('キーの並び順を保つ', () => {
    const file = writeSettings(realisticSettings());
    saveVoicevoxEnv({ VOICEVOX_SPEED: '1.5' }, file);
    const after = JSON.parse(fs.readFileSync(file, 'utf8'));
    expect(Object.keys(after)).toEqual(['env', 'hooks', 'theme']);
    expect(Object.keys(after.env)).toEqual([
      'APPROVE_RELAY_URL',
      'VOICEVOX_READ_SCOPE',
      'VOICEVOX_SPEAKER',
      'VOICEVOX_SPEED',
    ]);
  });

  it('範囲外の値は保存せず、どの項目が悪いか返す', () => {
    const file = writeSettings(realisticSettings());
    const before = fs.readFileSync(file, 'utf8');

    let caught;
    try {
      saveVoicevoxEnv({ VOICEVOX_SPEED: '3' }, file);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeDefined();
    expect(caught.fieldErrors.VOICEVOX_SPEED).toContain('2 以下');
    expect(fs.readFileSync(file, 'utf8')).toBe(before);
  });

  it('知らないキーは保存しない', () => {
    const file = writeSettings(realisticSettings());
    expect(() => saveVoicevoxEnv({ APPROVE_RELAY_URL: 'https://evil.invalid' }, file)).toThrow();
    const after = JSON.parse(fs.readFileSync(file, 'utf8'));
    expect(after.env.APPROVE_RELAY_URL).toBe('https://example.invalid/relay');
  });

  it('壊れた設定ファイルは上書きしない', () => {
    const file = writeSettings('{ 壊れたJSON');
    expect(() => saveVoicevoxEnv({ VOICEVOX_SPEED: '1.5' }, file)).toThrow(/壊れています/);
    expect(fs.readFileSync(file, 'utf8')).toBe('{ 壊れたJSON');
  });

  it('変更が無ければ書き込まずバックアップも作らない', () => {
    const file = writeSettings(realisticSettings());
    const result = saveVoicevoxEnv({ VOICEVOX_SPEED: '1.2' }, file);
    expect(result.changes).toEqual([]);
    expect(fs.existsSync(backupPath(file))).toBe(false);
  });

  it('書く前の中身をバックアップに取る', () => {
    const file = writeSettings(realisticSettings());
    const before = fs.readFileSync(file, 'utf8');
    saveVoicevoxEnv({ VOICEVOX_SPEED: '1.5' }, file);
    expect(fs.readFileSync(backupPath(file), 'utf8')).toBe(before);
  });

  it('一時ファイルを残さない', () => {
    const file = writeSettings(realisticSettings());
    saveVoicevoxEnv({ VOICEVOX_SPEED: '1.5' }, file);
    expect(fs.readdirSync(path.dirname(file))).toEqual([
      'settings.json',
      'settings.json.voicevox-backup',
    ]);
  });

  it('env が無い設定ファイルにも書ける', () => {
    const file = writeSettings({ theme: 'dark' });
    saveVoicevoxEnv({ VOICEVOX_SPEED: '1.5' }, file);
    const after = JSON.parse(fs.readFileSync(file, 'utf8'));
    expect(after.env).toEqual({ VOICEVOX_SPEED: '1.5' });
    expect(after.theme).toBe('dark');
  });

  it('設定ファイルが無ければ作る', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'voicevox-writer-'));
    created.push(dir);
    const file = path.join(dir, '.claude', 'settings.json');
    saveVoicevoxEnv({ VOICEVOX_SPEED: '1.5' }, file);
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual({ env: { VOICEVOX_SPEED: '1.5' } });
  });
});

describe('restoreBackup', () => {
  it('直前の内容に戻す', () => {
    const file = writeSettings(realisticSettings());
    const before = fs.readFileSync(file, 'utf8');
    saveVoicevoxEnv({ VOICEVOX_SPEED: '1.5' }, file);
    restoreBackup(file);
    expect(fs.readFileSync(file, 'utf8')).toBe(before);
  });

  it('バックアップが無ければ例外にする', () => {
    const file = writeSettings(realisticSettings());
    expect(() => restoreBackup(file)).toThrow();
  });
});
