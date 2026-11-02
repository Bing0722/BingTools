/**
 * 服务器配置仓库适配器：只保存客户和接口；运行状态及日志不进入文件。
 */
import { defaultSimulatorConfig, parseSimulatorConfig, type SimulatorConfig } from '../../shared/schemas/simulator'
import { JsonRepository } from './json-repository'
export class SimulatorRepository extends JsonRepository<SimulatorConfig> {
  constructor(path: string) { super(path, defaultSimulatorConfig, parseSimulatorConfig) }
}
