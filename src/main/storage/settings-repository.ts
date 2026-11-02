/**
 * 设置仓库适配器：复用通用存储，将偏好默认值、校验和历史迁移绑定在一起。
 */
import { defaultSettings, parseSettings, type AppSettings } from '../../shared/schemas/settings'
import { JsonRepository } from './json-repository'
export class SettingsRepository extends JsonRepository<AppSettings> {
  constructor(path: string) { super(path, defaultSettings, parseSettings) }
}
