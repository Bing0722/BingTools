/**
 * 导入导出工作线程：执行有界文件读取、JSON 校验及序列化，避免阻塞主进程。
 */
import { parentPort, workerData } from 'node:worker_threads'
import { createReadStream } from 'node:fs'
import { rename, rm, stat, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { TRANSFER_LIMIT, transferSchema } from '../../shared/schemas/transfer'

// 文件路径只来自主进程原生对话框。解析、校验与序列化放在独立线程，避免大文件卡住窗口。
async function run() {
  if (workerData.action === 'read') {
    const chunks: Buffer[] = []
    let length = 0
    try {
      const info = await stat(workerData.path)
      if (!info.isFile()) throw new Error('TRANSFER_READ_FAILED')
      if (info.size > TRANSFER_LIMIT) throw new Error('TRANSFER_FILE_SIZE')
      // stat 之后文件仍可能增长，因此流式读取时再次按实际字节数限制大小。
      for await (const chunk of createReadStream(workerData.path)) {
        const bytes = Buffer.from(chunk)
        length += bytes.length
        if (length > TRANSFER_LIMIT) throw new Error('TRANSFER_FILE_SIZE')
        chunks.push(bytes)
      }
    } catch (error) {
      if (error instanceof Error && error.message === 'TRANSFER_FILE_SIZE') throw error
      throw new Error('TRANSFER_READ_FAILED', { cause: error })
    }
    let raw: unknown
    // 兼容 UTF-8 BOM；解析结果先作为 unknown，格式版本与字段校验通过后才返回。
    try { raw = JSON.parse(Buffer.concat(chunks).toString('utf8').replace(/^\uFEFF/, '')) } catch { throw new Error('TRANSFER_INVALID') }
    if (raw && typeof raw === 'object' && 'format' in raw && raw.format === 'BingTools-transfer' && 'version' in raw && raw.version !== 1) throw new Error('TRANSFER_VERSION')
    const parsed = transferSchema.safeParse(raw)
    if (!parsed.success) throw new Error('TRANSFER_INVALID')
    return parsed.data
  }
  const data = transferSchema.parse(workerData.data)
  const text = JSON.stringify(data, null, 2) + '\n'
  if (Buffer.byteLength(text) > TRANSFER_LIMIT) throw new Error('TRANSFER_FILE_SIZE')
  // 随机临时文件配合排他创建，完整写入后替换目标，异常时尽力清理临时文件。
  const temporary = `${workerData.path}.${randomUUID()}.tmp`
  try {
    await writeFile(temporary, text, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
    await rename(temporary, workerData.path)
  } catch { throw new Error('TRANSFER_WRITE_FAILED') }
  finally { await rm(temporary, { force: true }).catch(() => {}) }
  return null
}
void run().then((data) => parentPort?.postMessage({ ok: true, data }), (error: unknown) => parentPort?.postMessage({ ok: false, error: error instanceof Error && /^TRANSFER_[A-Z_]+$/.test(error.message) ? error.message : 'TRANSFER_INVALID' }))
