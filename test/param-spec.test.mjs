import { describe, expect, it } from 'vitest';

import { loadConfig } from '../src/config.mjs';
import {
  PARAMS,
  PARAM_GROUPS,
  findParam,
  validateValue,
  validateValues,
  writableKeys,
} from '../src/param-spec.mjs';

describe('定義そのもの', () => {
  it('キーが重複していない', () => {
    const keys = PARAMS.map((param) => param.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('すべてのパラメータが存在するグループに属している', () => {
    const groups = new Set(PARAM_GROUPS.map((group) => group.id));
    for (const param of PARAMS) {
      expect(groups.has(param.group), `${param.key} の group が不正`).toBe(true);
    }
  });

  it('説明と既定値が全項目にある', () => {
    for (const param of PARAMS) {
      expect(param.label, `${param.key} に label が無い`).toBeTruthy();
      expect(param.help, `${param.key} に help が無い`).toBeTruthy();
      expect(typeof param.defaultValue, `${param.key} の defaultValue が文字列でない`).toBe(
        'string',
      );
    }
  });

  it('数値項目には範囲がある', () => {
    for (const param of PARAMS.filter((item) => item.type === 'number')) {
      expect(typeof param.min, `${param.key} に min が無い`).toBe('number');
      expect(typeof param.max, `${param.key} に max が無い`).toBe('number');
      expect(param.min).toBeLessThan(param.max);
    }
  });
});

/**
 * 定義とドキュメント・実装のずれを機械的に止める。
 * 以前 README の表から2項目が漏れたのは、定義が実装と別に手書きされていたため。
 */
describe('loadConfig の既定値と一致している', () => {
  const defaults = loadConfig({});

  for (const param of PARAMS.filter((item) => item.configKey)) {
    it(`${param.key} の既定値が実装と同じ`, () => {
      const actual = defaults[param.configKey];
      if (param.type === 'boolean') {
        expect(actual).toBe(param.defaultValue !== '0');
      } else if (param.type === 'number') {
        expect(actual).toBe(Number(param.defaultValue));
      } else {
        expect(actual).toBe(param.defaultValue);
      }
    });
  }

  it('loadConfig が返す設定項目を取りこぼしていない', () => {
    // 画面に出す必要のない内部項目(探索結果など)はここで除く。
    const internal = ['engineExeCandidates', 'wingetPackagesDir', 'workDir'];
    const covered = new Set(PARAMS.map((param) => param.configKey).filter(Boolean));
    const missing = Object.keys(defaults).filter(
      (key) => !covered.has(key) && !internal.includes(key),
    );
    expect(missing).toEqual([]);
  });
});

describe('validateValue', () => {
  const speed = findParam('VOICEVOX_SPEED');
  const maxChars = findParam('VOICEVOX_MAX_CHARS');
  const scope = findParam('VOICEVOX_READ_SCOPE');
  const enabled = findParam('VOICEVOX_ENABLED');
  const url = findParam('VOICEVOX_URL');

  it('範囲内の数値を通す', () => {
    expect(validateValue(speed, '1.5')).toEqual({ ok: true, value: '1.5' });
  });

  /** config.mjs は黙って既定値に戻すが、GUIでは「効かない」に見えるのでエラーにする。 */
  it('範囲外の数値は既定値に戻さずエラーにする', () => {
    const result = validateValue(speed, '3');
    expect(result.ok).toBe(false);
    expect(result.message).toContain('2 以下');
  });

  it('数値でない文字はエラーにする', () => {
    expect(validateValue(speed, 'はやく').ok).toBe(false);
  });

  it('整数の項目は小数を断る', () => {
    expect(validateValue(maxChars, '800.5').ok).toBe(false);
    expect(validateValue(maxChars, '800')).toEqual({ ok: true, value: '800' });
  });

  it('下限未満を断る', () => {
    expect(validateValue(maxChars, '10').ok).toBe(false);
  });

  it('選択肢は大文字小文字を問わない', () => {
    expect(validateValue(scope, 'SUMMARY')).toEqual({ ok: true, value: 'summary' });
  });

  it('選択肢にない値を断る', () => {
    const result = validateValue(scope, 'sumary');
    expect(result.ok).toBe(false);
    expect(result.message).toContain('closing');
  });

  /** 真偽値だけは `config.mjs` と同じ寛容な判定にする(打ち間違いは「オン」)。 */
  it('真偽値は 0 / false / off / no を偽として扱う', () => {
    expect(validateValue(enabled, 'off')).toEqual({ ok: true, value: '0' });
    expect(validateValue(enabled, 'no')).toEqual({ ok: true, value: '0' });
    expect(validateValue(enabled, '1')).toEqual({ ok: true, value: '1' });
    expect(validateValue(enabled, 'flase')).toEqual({ ok: true, value: '1' });
  });

  it('空欄は既定値として扱う', () => {
    expect(validateValue(speed, '')).toEqual({ ok: true, value: '1.2' });
    expect(validateValue(scope, '')).toEqual({ ok: true, value: 'closing' });
  });

  it('URLの形を見る', () => {
    expect(validateValue(url, 'http://127.0.0.1:50021').ok).toBe(true);
    expect(validateValue(url, '127.0.0.1:50021').ok).toBe(false);
    expect(validateValue(url, 'ftp://example.com').ok).toBe(false);
  });

  it('パスの項目は空欄を通す(自動探索に戻すため)', () => {
    expect(validateValue(findParam('VOICEVOX_ENGINE_EXE'), '')).toEqual({ ok: true, value: '' });
  });
});

describe('validateValues', () => {
  it('問題のあるキーだけをエラーにして残りは通す', () => {
    const result = validateValues({ VOICEVOX_SPEED: '9', VOICEVOX_SPEAKER: '8' });
    expect(Object.keys(result.errors)).toEqual(['VOICEVOX_SPEED']);
    expect(result.values).toEqual({ VOICEVOX_SPEAKER: '8' });
  });

  it('知らないキーを断る', () => {
    const result = validateValues({ SOME_API_TOKEN: 'secret' });
    expect(result.errors.SOME_API_TOKEN).toBeTruthy();
    expect(result.values).toEqual({});
  });

  it('空欄にされたパス項目は削除扱いにする', () => {
    const result = validateValues({ VOICEVOX_ENGINE_EXE: '' });
    expect(result.removals).toEqual(['VOICEVOX_ENGINE_EXE']);
    expect(result.values).toEqual({});
  });
});

describe('writableKeys', () => {
  it('定義にあるキーと一致する', () => {
    expect(writableKeys()).toEqual(PARAMS.map((param) => param.key));
  });
});
