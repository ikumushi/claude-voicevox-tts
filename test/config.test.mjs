import { describe, expect, it } from 'vitest';

import { engineExeCandidates, loadConfig, readBoolean } from '../src/config.mjs';

describe('loadConfig', () => {
  it('環境変数が無ければ既定値を使う', () => {
    const config = loadConfig({});
    expect(config.enabled).toBe(true);
    expect(config.url).toBe('http://127.0.0.1:50021');
    expect(config.speaker).toBe(3);
    expect(config.speedScale).toBe(1.2);
    expect(config.maxChars).toBe(400);
  });

  it('環境変数で上書きできる', () => {
    const config = loadConfig({
      VOICEVOX_SPEAKER: '2',
      VOICEVOX_SPEED: '1.5',
      VOICEVOX_MAX_CHARS: '200',
      VOICEVOX_URL: 'http://127.0.0.1:50022/',
    });
    expect(config.speaker).toBe(2);
    expect(config.speedScale).toBe(1.5);
    expect(config.maxChars).toBe(200);
    expect(config.url).toBe('http://127.0.0.1:50022');
  });

  it('壊れた値や範囲外の値は既定値に戻す', () => {
    const config = loadConfig({ VOICEVOX_SPEED: 'fast', VOICEVOX_MAX_CHARS: '-5' });
    expect(config.speedScale).toBe(1.2);
    expect(config.maxChars).toBe(400);
  });

  it('VOICEVOX_ENABLED=0 で無効にできる', () => {
    expect(loadConfig({ VOICEVOX_ENABLED: '0' }).enabled).toBe(false);
    expect(loadConfig({ VOICEVOX_ENABLED: 'false' }).enabled).toBe(false);
    expect(loadConfig({ VOICEVOX_ENABLED: '1' }).enabled).toBe(true);
  });
});

describe('readBoolean', () => {
  it('未設定なら既定値', () => {
    expect(readBoolean(undefined, true)).toBe(true);
    expect(readBoolean('', false)).toBe(false);
  });

  it('偽として扱う文字列', () => {
    for (const value of ['0', 'false', 'off', 'no', 'FALSE']) {
      expect(readBoolean(value, true)).toBe(false);
    }
  });
});

describe('engineExeCandidates', () => {
  it('明示指定を最優先にする', () => {
    const candidates = engineExeCandidates({
      VOICEVOX_ENGINE_EXE: 'D:/voicevox/run.exe',
      LOCALAPPDATA: 'C:/local',
    });
    expect(candidates[0]).toBe('D:/voicevox/run.exe');
    expect(candidates.length).toBeGreaterThan(1);
  });

  it('環境変数が無くても落ちない', () => {
    expect(engineExeCandidates({})).toEqual([]);
  });
});
