/**
 * 页面入口：先载入字体、样式和语言，再挂载错误边界、全局订阅与路由。
 */
import '@fontsource-variable/noto-sans-sc/wght.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AppRouter } from './app/router'
import { Providers } from './app/providers'
import { ErrorBoundary } from './app/error-boundary'
import './styles/globals.css'
import './i18n'

createRoot(document.getElementById('root')!).render(<StrictMode><ErrorBoundary><Providers><AppRouter /></Providers></ErrorBoundary></StrictMode>)
