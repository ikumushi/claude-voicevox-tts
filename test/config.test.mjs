import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  engineExeCandidates,
  loadConfig,
  readBoolean,
  wingetEngineCandidates,
  wingetPackagesDir,
} from '../src/config.mjs';

describe('loadConfig', () => {
  it('環境変数が無ければ既定値を使う', () => {
    const config = loadConfig({});
    expect(config.enabled).toBe(true);
    expect(config.url).toBe('http://127.0.0.1:50021');
    expect(config.speaker).toBe(2);
    expect(config.speedScale).toBe(1.2);
    expect(config.maxChars).toBe(800);
  });

  it('環境変数で上書きできる', () => {
    const config = loadConfig({
      VOICEVOX_SPEAKER: '8',
      VOICEVOX_SPEED: '1.5',
      VOICEVOX_MAX_CHARS: '200',
      VOICEVOX_URL: 'http://127.0.0.1:50022/',
    });
    expect(config.speaker).toBe(8);
    expect(config.speedScale).toBe(1.5);
    expect(config.maxChars).toBe(200);
    expect(config.url).toBe('http://127.0.0.1:50022');
  });

  it('壊れた値や範囲外の値は既定値に戻す', () => {
    const config = loadConfig({ VOICEVOX_SPEED: 'fast', VOICEVOX_MAX_CHARS: '-5' });
    expect(config.speedScale).toBe(1.2);
    expect(config.maxChars).toBe(800);
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

describe('wingetPackagesDir', () => {
  it('LOCALAPPDATA配下のWinGetパッケージ置き場を返す', () => {
    expect(wingetPackagesDir({ LOCALAPPDATA: 'C:/local' })).toBe(
      path.join('C:/local', 'Microsoft', 'WinGet', 'Packages'),
    );
  });

  it('LOCALAPPDATAが無ければnull', () => {
    expect(wingetPackagesDir({})).toBe(null);
  });
});

describe('wingetEngineCandidates', () => {
  const packagesDir = 'C:/local/Microsoft/WinGet/Packages';

  it('名前にVOICEVOXを含むフォルダから候補を組み立てる', () => {
    const candidates = wingetEngineCandidates(
      ['Git.Git_abc', 'HiroshibaKazuyuki.VOICEVOX_Microsoft.Winget.Source_8wekyb3d8bbwe'],
      packagesDir,
    );
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toContain('HiroshibaKazuyuki.VOICEVOX');
    expect(candidates[0].endsWith('run.exe')).toBe(true);
  });

  it('CPU版のフォルダ名も拾う', () => {
    expect(wingetEngineCandidates(['HiroshibaKazuyuki.VOICEVOX.CPU_x'], packagesDir)).toHaveLength(
      1,
    );
  });

  it('該当が無ければ空', () => {
    expect(wingetEngineCandidates(['Git.Git_abc'], packagesDir)).toEqual([]);
  });

  it('置き場が無い・一覧が配列でない場合は空', () => {
    expect(wingetEngineCandidates(['VOICEVOX_x'], null)).toEqual([]);
    expect(wingetEngineCandidates(undefined, packagesDir)).toEqual([]);
  });
});
