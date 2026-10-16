import { z } from 'zod'

export const SERIAL_FRAME_LIMIT = 65536
export const SERIAL_LOG_LIMIT = 2000
export const serialSettingsSchema = z.object({
  path: z.string().trim().max(256), baudRate: z.number().int().min(50).max(4000000),
  dataBits: z.union([z.literal(5), z.literal(6), z.literal(7), z.literal(8)]),
  stopBits: z.union([z.literal(1), z.literal(1.5), z.literal(2)]),
  parity: z.enum(['none', 'even', 'odd', 'mark', 'space']), rtscts: z.boolean(),
  framing: z.enum(['delimiter', 'length', 'idle']),
  delimiter: z.string().regex(/^(?:[0-9a-fA-F]{2}){1,16}$/),
  frameLength: z.number().int().min(1).max(SERIAL_FRAME_LIMIT), idleMs: z.number().int().min(10).max(5000),
}).strict()
export const defaultSerial = { path: '', baudRate: 9600, dataBits: 8, stopBits: 1, parity: 'none', rtscts: false, framing: 'delimiter', delimiter: '0A', frameLength: 8, idleMs: 50 } as const
export function validSerialPayload(value: string, format: 'text' | 'hex'): boolean {
  if (format === 'text') return new TextEncoder().encode(value).length <= SERIAL_FRAME_LIMIT
  const hex = value.replace(/\s/g, '')
  return hex.length <= SERIAL_FRAME_LIMIT * 2 && /^(?:[\da-fA-F]{2})*$/.test(hex)
}
export const motionRuleSchema = z.object({
  id: z.string().uuid(), name: z.string().trim().min(1).max(100), enabled: z.boolean(),
  format: z.enum(['text', 'hex']), receive: z.string().min(1).max(SERIAL_FRAME_LIMIT * 3),
  response: z.string().max(SERIAL_FRAME_LIMIT * 3), appendDelimiter: z.boolean(),
  receiveSuffix: z.string().regex(/^(?:[0-9a-fA-F]{2}){0,16}$/).default(''),
  ignoreTailBytes: z.number().int().min(0).max(256).default(0),
}).strict().refine((v) => validSerialPayload(v.receive, v.format) && validSerialPayload(v.response, v.format) && (v.format !== 'hex' || v.receive.replace(/\s/g, '').length > 0), { message: 'MOTION_INVALID_PAYLOAD' })
export const motionCustomerInputSchema = z.object({ id: z.string().uuid(), name: z.string().trim().min(1).max(100), serial: serialSettingsSchema }).strict()
export const motionCustomerSchema = motionCustomerInputSchema.extend({ rules: z.array(motionRuleSchema).max(500) }).strict()
export const motionConfigSchema = z.object({ schemaVersion: z.literal(2), selectedCustomerId: z.string().uuid().nullable(), customers: z.array(motionCustomerSchema).max(100) }).strict()
export const defaultMotionConfig: MotionConfig = { schemaVersion: 2, selectedCustomerId: null, customers: [] }
export const motionCommandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('saveCustomer'), customer: motionCustomerInputSchema, sourceId: z.string().uuid().optional() }).strict(),
  z.object({ type: z.literal('selectCustomer'), customerId: z.string().uuid() }).strict(),
  z.object({ type: z.literal('deleteCustomer'), customerId: z.string().uuid() }).strict(),
  z.object({ type: z.literal('saveRule'), customerId: z.string().uuid(), rule: motionRuleSchema }).strict(),
  z.object({ type: z.literal('deleteRule'), customerId: z.string().uuid(), ruleId: z.string().uuid() }).strict(),
  z.object({ type: z.literal('toggleRule'), customerId: z.string().uuid(), ruleId: z.string().uuid(), enabled: z.boolean() }).strict(),
  z.object({ type: z.literal('reorderRules'), customerId: z.string().uuid(), ids: z.array(z.string().uuid()).max(500) }).strict(),
  z.object({ type: z.literal('sendRule'), customerId: z.string().uuid(), ruleId: z.string().uuid() }).strict(),
  z.object({ type: z.literal('start'), customerId: z.string().uuid() }).strict(),
  z.object({ type: z.literal('stop') }).strict(),
  z.object({ type: z.literal('clearLogs'), customerId: z.string().uuid().nullable() }).strict(),
])
export type SerialSettings = z.infer<typeof serialSettingsSchema>
export type MotionRule = z.infer<typeof motionRuleSchema>
export type MotionCustomer = z.infer<typeof motionCustomerSchema>
export type MotionConfig = z.infer<typeof motionConfigSchema>
export type MotionCommand = z.infer<typeof motionCommandSchema>
export interface SerialPortInfo { path: string; manufacturer?: string }
export interface MotionLog { id: number; time: number; customerId: string | null; direction: 'rx' | 'tx' | 'event'; code: string; level: 'info' | 'error'; text: string; hex: string; bytes: number; truncated: boolean; ruleName?: string }
export interface MotionState { revision: number; config: MotionConfig; phase: 'stopped' | 'starting' | 'running' | 'stopping' | 'failed'; customerId: string | null; error?: string; warning?: string }
export interface MotionSnapshot extends MotionState { logs: MotionLog[] }
export type MotionEvent = { type: 'state'; state: MotionState } | { type: 'logs'; entries: MotionLog[] } | { type: 'clear'; customerId: string | null; throughId: number }

/** 旧规则不做接收预处理，显式迁移后保持原有匹配行为。 */
export function parseMotionConfig(value: unknown): MotionConfig {
  if (typeof value === 'object' && value && 'schemaVersion' in value && value.schemaVersion === 1) {
    const old = motionConfigSchema.extend({ schemaVersion: z.literal(1) }).parse(value)
    return motionConfigSchema.parse({ ...old, schemaVersion: 2 })
  }
  return motionConfigSchema.parse(value)
}
