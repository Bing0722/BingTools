/**
 * 页面路由入口：所有主页面共用 AppShell，hash 路由可在本地 file 页面中工作。
 */
import { MotionPage } from '@/features/motion/motion-page'
import { createHashRouter, Navigate, RouterProvider } from 'react-router-dom'
import { AppShell } from '@/shell/app-shell'
import { SimulatorPage } from '@/features/simulator/simulator-page'
import { SettingsPage } from '@/features/settings/settings-page'
// 数据路由支持 useBlocker，让侧栏、快捷键和历史导航统一经过未保存提醒。
const router = createHashRouter([{ element: <AppShell />, children: [
  { index: true, element: <Navigate to="/simulator" replace /> },
  { path: 'simulator', element: <SimulatorPage /> },
  { path: 'motion', element: <MotionPage /> },
  { path: 'settings', element: <SettingsPage /> },
  { path: '*', element: <Navigate to="/simulator" replace /> },
] }])
export function AppRouter() { return <RouterProvider router={router} /> }
