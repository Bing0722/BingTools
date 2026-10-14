import { describe, expect, it } from 'vitest'
import { beautifyJson, checkJson } from '../src/renderer/src/features/simulator/json-body'
import { BODY_LIMIT } from '../src/shared/schemas/simulator'

describe('JSON response editing', () => {
  it('formats nested values and preserves string contents', () => {
    const source = '{"a":[1,{},{"b":"x, : [ ] \\""}],"empty":[]}'
    const formatted = beautifyJson(source)
    expect(JSON.parse(formatted)).toEqual(JSON.parse(source))
    expect(formatted).toContain('\n  "a": [\n    1,')
    expect(beautifyJson(formatted)).toBe(formatted)
  })
  it('preserves large integers, duplicate keys and numeric spelling', () => {
    expect(beautifyJson('{"id":9007199254740993,"id":1e+30,"zero":-0}')).toBe('{\n  "id": 9007199254740993,\n  "id": 1e+30,\n  "zero": -0\n}')
  })
  it('accepts all valid JSON roots and rejects malformed input', () => {
    for (const value of ['null', 'true', '1', '"中文"', '[]', '{}']) expect(checkJson(value).valid).toBe(true)
    for (const value of ['', '{broken', '{"a":1,}', '{"a":undefined}', '// comment']) {
      expect(checkJson(value).valid).toBe(false)
      expect(() => beautifyJson(value)).toThrow('INVALID_JSON')
    }
    // 不同 V8 版本的异常可能不包含位置，不能编造行列。
    expect(checkJson('{\n"a": }')).toMatchObject({ valid:false, code:'INVALID_JSON' })
  })
  it('rejects oversized input and formatting expansion', () => {
    expect(checkJson(' '.repeat(BODY_LIMIT + 1))).toMatchObject({ code:'BODY_TOO_LARGE' })
    expect(() => beautifyJson('[' + '0,'.repeat(220000) + '0]')).toThrow('BODY_TOO_LARGE')
  })
})
