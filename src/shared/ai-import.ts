/** AI 辅助只提供导入格式说明，不读取客户内容，不访问外部模型。 */
import { z } from 'zod'
import { transferSchema, type TransferData } from './schemas/transfer'
export const aiImportOptionsSchema = z.object({ protocol: z.enum(['http', 'tcp', 'motion']), language: z.enum(['zh-CN', 'en']) }).strict()
export type AiImportOptions = z.infer<typeof aiImportOptionsSchema>
export function aiImportExample(protocol: AiImportOptions['protocol']): TransferData {
  const header = { format: 'BingTools-transfer', version: 1, scope: 'interfaces' }
  const id = 'c04195ab-416d-4869-9cd2-47c2af857777'
  // 示例本身经过正式导入 schema 校验，避免字段变更后继续复制过期格式。
  return transferSchema.parse(protocol === 'motion'
    ? { ...header, module: 'motion', rules: [{ id, name: 'Get position', enabled: false, format: 'text', receive: 'POS?', response: 'POS:0', appendDelimiter: true, receiveSuffix: '', ignoreTailBytes: 0 }] }
    : { ...header, module: 'simulator', protocol, endpoints: [{ id, name: protocol === 'tcp' ? 'getStatus' : 'Get status', path: protocol === 'tcp' ? '/' : '/status', method: 'GET', format: 'json', status: 200, body: '{"ok":true}', enabled: false, responseDelay: { enabled: false, ms: 0 } }] })
}
export function buildAiImportPrompt(options: AiImportOptions): string {
  const { protocol, language } = aiImportOptionsSchema.parse(options)
  const zh = language === 'zh-CN'
  const common = zh ? [
    `你是 BingTools 接口配置助手。根据我随后提供的业务规则，生成可导入的 ${protocol === 'motion' ? '运控串口' : protocol.toUpperCase()} 接口 JSON 文件。`,
    '只输出一个标准 JSON 对象，不要 Markdown 围栏、注释、解释、尾逗号或省略号。业务规则不足或矛盾时先提问，不要猜测关键协议内容。',
    '严格使用下面示例的顶层格式：format="BingTools-transfer"、version=1、scope="interfaces"。不要输出本地配置的 schemaVersion、customers、监听地址、串口设置、日志或运行状态，不增加未定义字段。',
    '这是追加接口文件：先在应用创建/选择对应协议客户，停止服务，再选择文件、预览并确认导入。文件不会修改客户的连接或分帧规则，也不会自动启动服务。',
    '每份文件 1–500 个接口，总大小最多 32 MiB；目标客户导入后最多 500 个接口。每项 id 为独立、有效的 UUID；导入时会重生成 ID。name 去除首尾空格后为 1–100 字符。enabled 默认为 false，只有我明确要求时才设 true。',
    '保留我给出的大小写、空白、数值精度及协议字节；所有字符串按 JSON 正确转义，换行用 \\n，双引号用 \\"，不要把 JSON 对象误当成字符串字段。'
  ] : [
    `You are a BingTools interface configuration assistant. Convert the business rules I provide next into an importable ${protocol === 'motion' ? 'serial motion' : protocol.toUpperCase()} interface JSON file.`,
    'Return one strict JSON object only: no Markdown fences, comments, explanations, trailing commas or ellipses. Ask questions first if essential protocol information is missing or contradictory.',
    'Use exactly the top-level format shown below: format="BingTools-transfer", version=1, scope="interfaces". Do not emit schemaVersion, customers, listener or serial settings, logs, runtime state or undefined fields.',
    'This file appends interfaces: create/select a customer of the matching protocol, stop its service, choose the file, preview and confirm import. It does not change transport/framing settings or start services.',
    'Each file contains 1–500 interfaces and is at most 32 MiB; the destination customer may have at most 500 interfaces after import. Each id is a distinct valid UUID (IDs are regenerated during import). Each trimmed name is 1–100 characters. Default enabled to false unless explicitly requested otherwise.',
    'Preserve specified case, whitespace, numeric precision and protocol bytes. Escape JSON strings correctly: newline as \\n and quotes as \\". Do not substitute objects for string fields.'
  ]
  const endpoint = zh ? [
    'module="simulator"，protocol 必须与目标客户一致（http 或 tcp），接口放入 endpoints 数组。',
    '每项必填：id、name、path、method、format、status、body、enabled。format 只可为 json 或 text；body 必须是字符串，UTF-8 最多 1 MiB。format=json 时 body 字符串自身必须可被 JSON.parse 解析，例如 "body":"{\\"ok\\":true}"。',
    'method 只可为 GET/POST/PUT/PATCH/DELETE/HEAD/OPTIONS；status 为 200–599 整数。path 最多 2048 字符，以单个 / 开头，不能包含空白、?、#，不能包含会被 URL 规范化的 . 或 .. 路径段。',
    'responseDelay 可选，形如 {"enabled":false,"ms":0}，ms 为 0–60000 整数，仅 HTTP 使用。没有需求时保持关闭。'
  ] : [
    'Set module="simulator" and protocol to the destination protocol (http or tcp); put interfaces in endpoints.',
    'Required per item: id, name, path, method, format, status, body, enabled. format is json or text. body must be a string of at most 1 MiB in UTF-8. For format=json the body string itself must parse as JSON, e.g. "body":"{\\"ok\\":true}".',
    'method is GET/POST/PUT/PATCH/DELETE/HEAD/OPTIONS; status is an integer from 200 to 599. path is at most 2048 characters, starts with a single /, contains no whitespace, ? or #, and no . or .. segments normalized by URL parsing.',
    'Optional responseDelay is {"enabled":false,"ms":0}, with integer ms from 0 to 60000. It applies only to HTTP; keep disabled unless requested.'
  ]
  const specific = protocol === 'motion' ? (zh ? [
    'module="motion"，不要 protocol 或 endpoints 字段；接口放入 rules 数组。每项必填 id、name、enabled、format、receive、response、appendDelimiter；建议显式写 receiveSuffix、ignoreTailBytes。',
    'format 为 text 或 hex，同时作用于 receive 和 response。receive 非空，response 可为空；每项收发解码后分别最多 65536 字节。text 按 UTF-8；hex 必须是完整两位十六进制字节，可有空白，不写 0x 前缀。',
    'appendDelimiter 为布尔值，控制回复是否追加客户结束符。receiveSuffix 为 HEX 字符串，0–16 字节（无空格），默认空；ignoreTailBytes 为 0–256 整数，默认 0。',
    '接收流先按客户规则分帧，然后移除一次匹配的 receiveSuffix，再忽略末尾 ignoreTailBytes 字节，最后与 receive 按字节精确匹配。receive 应填写处理后的目标内容，不重复包含已剥离的分帧结束符。不自动计算 CRC。',
    '同一客户不能有解码后 receive 字节相同的规则（即使 text/hex 格式不同）；也不要生成会同时匹配同一输入的歧义规则。'
  ] : [
    'Set module="motion"; omit protocol and endpoints. Use a rules array. Required fields: id, name, enabled, format, receive, response, appendDelimiter. Also explicitly include receiveSuffix and ignoreTailBytes.',
    'format is text or hex and applies to both receive and response. receive is nonempty; response may be empty. Each decoded payload is at most 65536 bytes. text is UTF-8; hex uses complete two-digit bytes, optional whitespace, no 0x prefixes.',
    'appendDelimiter is a boolean controlling whether to append the customer delimiter to replies. receiveSuffix is 0–16 HEX bytes without whitespace (default ""); ignoreTailBytes is an integer from 0 to 256 (default 0).',
    'Input is framed using customer settings, then one matching receiveSuffix is removed, then ignoreTailBytes trailing bytes are removed, then receive is matched exactly by bytes. Set receive to this processed target; do not repeat a framing delimiter already stripped. CRC is not calculated.',
    'Do not duplicate decoded receive bytes within a customer, even across text/hex formats; avoid rules that ambiguously match the same input.'
  ]) : protocol === 'http' ? (zh ? [
    'HTTP 按 method + path 精确匹配，忽略查询参数。文件内及目标客户已有接口之间不能重复 method + path。不要生成请求体匹配、正则、脚本、认证头或自定义响应头字段，当前格式不支持这些能力。HEAD、204、304 不发送正文。'
  ] : ['HTTP matches method + path exactly, ignoring query parameters. Do not duplicate method + path in the file or against existing interfaces. Request-body matching, regex, scripts, auth headers and custom response-header fields are unsupported. HEAD, 204 and 304 do not send a response body.']) : (zh ? [
    'TCP 根据客户配置提取消息字段，然后与 name 精确匹配，区分大小写；name 不得与文件内或目标客户已有接口重复。name 应填写实际提取结果，而不是整个 JSON 请求。',
    'TCP 仍必须包含 path、method、status 等共用字段，使用 /、GET、200 占位；它们不参与 TCP 匹配。responseDelay 保持关闭。先确认客户的自动包装／追加结束符设置：已由客户自动添加的长度头、尾标或结束符不要重复写入 body，关闭自动包装时按我明确的规则填写。缺少当前客户提取规则时先向我确认。'
  ] : [
    'TCP extracts a field according to customer settings and matches name exactly (case-sensitive). Names must be unique in the file and destination customer. Set name to the extracted value, not the full JSON request.',
    'TCP still requires shared fields path, method and status: use /, GET and 200 as placeholders; these do not affect TCP matching. Keep responseDelay disabled. Confirm customer wrapping/delimiter settings first: do not duplicate length headers, tails or delimiters automatically applied by the customer; when wrapping is off, follow my explicit payload rules. Ask me for the extraction rules if unknown.'
  ])
  return [...common, ...(protocol === 'motion' ? [] : endpoint), ...specific,
    zh ? '\n以下仅为格式示例，按我的规则替换内容，不要把示例接口额外保留：' : '\nFormat example only. Replace its content with my rules; do not retain an extra example interface:',
    '```json', JSON.stringify(aiImportExample(protocol), null, 2), '```',
    zh ? '\n我的业务规则（在这里粘贴）：' : '\nMy business rules (paste here):'
  ].join('\n\n')
}
