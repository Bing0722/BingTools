import { describe, expect, it } from 'vitest'
import { aiImportExample, aiImportOptionsSchema, buildAiImportPrompt } from '../src/shared/ai-import'
import { transferSchema } from '../src/shared/schemas/transfer'
describe('AI import instructions', () => {
  for (const protocol of ['http', 'tcp', 'motion'] as const) {
    for (const language of ['zh-CN', 'en'] as const) it(`produces importable ${protocol} examples in ${language}`, () => {
      const prompt = buildAiImportPrompt({ protocol, language })
      const json = prompt.split('```json')[1].split('```')[0].trim()
      const data = transferSchema.parse(JSON.parse(json))
      expect(data).toEqual(aiImportExample(protocol))
      expect(data.scope).toBe('interfaces')
      if (data.scope !== 'interfaces') throw new Error('wrong scope')
      if (data.module === 'simulator') {
        expect(data.protocol).toBe(protocol)
        expect(data.endpoints[0].enabled).toBe(false)
        expect(JSON.parse(data.endpoints[0].body)).toEqual({ ok: true })
      } else expect(data.rules[0]).toMatchObject({ enabled: false, receive: 'POS?', receiveSuffix: '', ignoreTailBytes: 0 })
    })
  }
  it('rejects arbitrary clipboard content and invalid options', () => {
    for (const options of [{ protocol: 'udp', language: 'en' }, { protocol: 'http', language: 'fr' }, { protocol: 'http', language: 'en', text: 'secret' }, { protocol: 'http' }]) expect(aiImportOptionsSchema.safeParse(options).success).toBe(false)
  })
})
