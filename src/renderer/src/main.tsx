import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AppRouter } from './app/router'
import { Providers } from './app/providers'
import { ErrorBoundary } from './app/error-boundary'
import './styles/globals.css'
import './i18n'

createRoot(document.getElementById('root')!).render(<StrictMode><ErrorBoundary><Providers><AppRouter /></Providers></ErrorBoundary></StrictMode>)
