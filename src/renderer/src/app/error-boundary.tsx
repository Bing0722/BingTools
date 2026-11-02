/**
 * 捕获子组件渲染异常并提供重新加载入口；异步业务错误由各 store 独立处理。
 */
import { Component, type ReactNode } from 'react'
import i18n from '@/i18n'
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    if (this.state.failed) return <div className="startup"><h1>{i18n.t('renderError')}</h1><p>{i18n.t('CONNECTION_FAILED')}</p><button className="button button-outline" onClick={() => window.location.reload()}>{i18n.t('reload')}</button></div>
    return this.props.children
  }
}
