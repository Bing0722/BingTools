import type { AppApi } from '../../shared/contracts/app-api'
declare global {
  interface Window { app: AppApi }
  const __APP_VERSION__: string
  const __RELEASE_NOTES__: string
}
