import type { AppApi } from '../../shared/contracts/app-api'
declare global { interface Window { app: AppApi } }
