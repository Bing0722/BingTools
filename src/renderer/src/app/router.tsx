import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from '@/shell/app-shell'
import { WorkspacePage } from '@/features/workspace/workspace-page'
import { ExamplesPage } from '@/features/examples/examples-page'
import { DetailPage, NotFoundPage } from '@/features/examples/detail-page'
import { SettingsPage } from '@/features/settings/settings-page'
export function AppRouter() {
  return <HashRouter><Routes><Route element={<AppShell />}>
    <Route index element={<Navigate to="/workspace" replace />} />
    <Route path="workspace" element={<WorkspacePage />} />
    <Route path="examples/list" element={<ExamplesPage />} />
    <Route path="examples/detail/:id" element={<DetailPage />} />
    <Route path="settings" element={<SettingsPage />} />
    <Route path="*" element={<NotFoundPage />} />
  </Route></Routes></HashRouter>
}
