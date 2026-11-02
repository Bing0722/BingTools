/**
 * JSON 编辑辅助逻辑：语法检查借助解析器，美化直接处理原始 token 以保留数字和字符串。
 */
import { BODY_LIMIT } from '../../../../shared/schemas/simulator'

export type JsonCheck = { valid: true } | { valid: false; code: 'INVALID_JSON' | 'BODY_TOO_LARGE'; line?: number; column?: number }

/** 只返回稳定错误码和位置；不把运行时的英文异常或用户正文放进通知。 */
export function checkJson(source: string): JsonCheck {
  if (new TextEncoder().encode(source).length > BODY_LIMIT) return { valid: false, code: 'BODY_TOO_LARGE' }
  try {
    JSON.parse(source)
    return { valid: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    // 仅在解析器提供偏移或明确指向结尾时计算行列，不凭错误文案猜测其他位置。
    const position = /position (\d+)/.exec(message)
    const offset = position ? Number(position[1]) : /end of JSON/i.test(message) ? source.length : undefined
    if (offset === undefined) return { valid: false, code: 'INVALID_JSON' }
    const before = source.slice(0, offset)
    return { valid: false, code: 'INVALID_JSON', line: before.split('\n').length, column: offset - before.lastIndexOf('\n') }
  }
}

/** 仅重排字符串之外的空白，保留大整数、重复键、转义及数字写法。 */
export function beautifyJson(source: string): string {
  const check = checkJson(source)
  if (!check.valid) throw new Error(check.code)
  // 字符串整体作为一个 token，包括内部转义；标点和字符串外空白才能参与缩进重排。
  const tokens = source.match(/"(?:\\.|[^"\\])*"|[{}[\],:]|[^\s{}[\],:]+/g) ?? []
  let depth = 0
  let output = ''
  // 深层嵌套最多缩进 80 个空格，防止格式化把小输入膨胀成过大的输出。
  const newline = () => '\n' + '  '.repeat(Math.min(depth, 40))
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    if (token === '{' || token === '[') {
      output += token
      depth++
      if (tokens[i + 1] !== (token === '{' ? '}' : ']')) output += newline()
    } else if (token === '}' || token === ']') {
      depth--
      if (tokens[i - 1] !== (token === '}' ? '{' : '[')) output += newline()
      output += token
    } else if (token === ',') output += ',' + newline()
    else if (token === ':') output += ': '
    else output += token
    // 限制美化产生的额外空白，失败时调用方保留原稿。
    if (output.length > BODY_LIMIT) throw new Error('BODY_TOO_LARGE')
  }
  if (new TextEncoder().encode(output).length > BODY_LIMIT) throw new Error('BODY_TOO_LARGE')
  return output
}
