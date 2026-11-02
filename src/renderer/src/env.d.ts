/**
 * 渲染进程全局类型声明：window.app 来自 preload，版本和说明常量由构建注入。
 */
import type { AppApi } from '../../shared/contracts/app-api'
declare global {
  interface Window { app: AppApi }
  const __APP_VERSION__: string
  const __RELEASE_NOTES__: string
}
