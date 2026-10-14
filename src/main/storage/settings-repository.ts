import { defaultSettings, parseSettings, type AppSettings } from '../../shared/schemas/settings'
import { JsonRepository } from './json-repository'
export class SettingsRepository extends JsonRepository<AppSettings> {
  constructor(path: string) { super(path, defaultSettings, parseSettings) }
}
