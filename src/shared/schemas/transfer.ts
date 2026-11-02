import { z } from 'zod'
import { customerSchema, endpointSchema } from './simulator'
import { motionCustomerSchema, motionRuleSchema } from './motion'

export const TRANSFER_LIMIT = 32 * 1024 * 1024
export const transferModuleSchema = z.enum(['simulator', 'motion'])
const header = { format: z.literal('BingTools-transfer'), version: z.literal(1) }
export const transferSchema = z.union([
  z.object({ ...header, module: z.literal('simulator'), scope: z.literal('customers'), customers: z.array(customerSchema).min(1).max(100) }).strict(),
  z.object({ ...header, module: z.literal('simulator'), scope: z.literal('interfaces'), protocol: z.enum(['http', 'tcp']), endpoints: z.array(endpointSchema).min(1).max(500) }).strict(),
  z.object({ ...header, module: z.literal('motion'), scope: z.literal('customers'), customers: z.array(motionCustomerSchema).min(1).max(100) }).strict(),
  z.object({ ...header, module: z.literal('motion'), scope: z.literal('interfaces'), rules: z.array(motionRuleSchema).min(1).max(500) }).strict(),
])
export const transferExportSchema = z.object({
  module: transferModuleSchema, scope: z.enum(['customers', 'interfaces']),
  customerId: z.string().uuid().optional(), interfaceId: z.string().uuid().optional(),
}).strict().refine((v) => v.scope === 'interfaces' ? !!v.customerId : !v.interfaceId)
export const transferApplySchema = z.object({ token: z.string().uuid(), customerId: z.string().uuid().optional() }).strict()
export type TransferModule = z.infer<typeof transferModuleSchema>
export type TransferData = z.infer<typeof transferSchema>
export type TransferExport = z.infer<typeof transferExportSchema>
export interface TransferPreview { token: string; module: TransferModule; scope: 'customers' | 'interfaces'; customers: number; interfaces: number; names: string[]; protocol?: 'http' | 'tcp' }
