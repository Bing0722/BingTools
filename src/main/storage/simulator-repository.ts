import { defaultSimulatorConfig, parseSimulatorConfig, type SimulatorConfig } from '../../shared/schemas/simulator'
import { JsonRepository } from './json-repository'
export class SimulatorRepository extends JsonRepository<SimulatorConfig> {
  constructor(path: string) { super(path, defaultSimulatorConfig, parseSimulatorConfig) }
}
