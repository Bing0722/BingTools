import { defaultSimulatorConfig, simulatorConfigSchema, type SimulatorConfig } from '../../shared/schemas/simulator'
import { JsonRepository } from './json-repository'
export class SimulatorRepository extends JsonRepository<SimulatorConfig> {
  constructor(path: string) { super(path, defaultSimulatorConfig, (value) => simulatorConfigSchema.parse(value)) }
}
