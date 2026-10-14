import { z } from 'zod'

export const BODY_LIMIT = 1024 * 1024
export const PREVIEW_LIMIT = 8 * 1024
export const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const
export const endpointSchema = z.object({
  id: z.string().uuid(), name: z.string().trim().min(1).max(100),
  path: z.string().max(2048).regex(/^\/(?!\/)[^\s?#]*$/), method: z.enum(methods),
  format: z.enum(['json', 'text']), status: z.number().int().min(200).max(599),
  body: z.string().refine((value) => new TextEncoder().encode(value).length <= BODY_LIMIT, 'BODY_TOO_LARGE'),
  enabled: z.boolean(),
}).strict().superRefine((value, context) => {
  if (value.format === 'json') {
    try { JSON.parse(value.body) }
    catch { context.addIssue({ code: 'custom', path: ['body'], message: 'INVALID_JSON' }) }
  }
  // 避免填写的路径被 URL 隐式规范化，导致实际请求永远无法匹配。
  try {
    if (new URL(value.path, 'http://localhost').pathname !== value.path) context.addIssue({ code: 'custom', path: ['path'], message: 'INVALID_PATH' })
  } catch { context.addIssue({ code: 'custom', path: ['path'], message: 'INVALID_PATH' }) }
})
export const customerInputSchema = z.object({
  id: z.string().uuid(), name: z.string().trim().min(1).max(100),
  host: z.union([z.ipv4(), z.ipv6()]), port: z.number().int().min(1).max(65535), protocol: z.literal('http'),
}).strict()
export const customerSchema = customerInputSchema.extend({ endpoints: z.array(endpointSchema).max(500) }).superRefine((customer, context) => {
  const routes = new Set<string>()
  const ids = new Set<string>()
  for (const endpoint of customer.endpoints) {
    const key = `${endpoint.method} ${endpoint.path}`
    if (routes.has(key) || ids.has(endpoint.id)) context.addIssue({ code: 'custom', message: 'DUPLICATE_ROUTE' })
    routes.add(key); ids.add(endpoint.id)
  }
})
export const simulatorConfigSchema = z.object({
  schemaVersion: z.literal(1), selectedCustomerId: z.string().uuid().nullable(), customers: z.array(customerSchema).max(100),
}).strict().superRefine((config, context) => {
  const ids = config.customers.map((customer) => customer.id)
  if (new Set(ids).size !== ids.length || (config.selectedCustomerId && !ids.includes(config.selectedCustomerId))) context.addIssue({ code: 'custom', message: 'INVALID_INPUT' })
})
export type Endpoint = z.infer<typeof endpointSchema>
export type CustomerInput = z.infer<typeof customerInputSchema>
export type Customer = z.infer<typeof customerSchema>
export type SimulatorConfig = z.infer<typeof simulatorConfigSchema>
export const defaultSimulatorConfig: SimulatorConfig = { schemaVersion: 1, selectedCustomerId: null, customers: [] }

// 只接受明确业务命令，不开放通用 IPC、任意网络或文件访问能力。
export const simulatorCommandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('saveCustomer'), customer: customerInputSchema }).strict(),
  z.object({ type: z.literal('deleteCustomer'), customerId: z.string().uuid() }).strict(),
  z.object({ type: z.literal('selectCustomer'), customerId: z.string().uuid() }).strict(),
  z.object({ type: z.literal('saveEndpoint'), customerId: z.string().uuid(), endpoint: endpointSchema }).strict(),
  z.object({ type: z.literal('deleteEndpoint'), customerId: z.string().uuid(), endpointId: z.string().uuid() }).strict(),
  z.object({ type: z.literal('setEndpointEnabled'), customerId: z.string().uuid(), endpointId: z.string().uuid(), enabled: z.boolean() }).strict(),
  z.object({ type: z.literal('start'), customerId: z.string().uuid() }).strict(),
  z.object({ type: z.literal('stop') }).strict(),
  z.object({ type: z.literal('clearLogs'), customerId: z.string().uuid().nullable() }).strict(),
])
export type SimulatorCommand = z.infer<typeof simulatorCommandSchema>
