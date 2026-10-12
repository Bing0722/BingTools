import { Component, type ReactNode } from 'react'
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    if (this.state.failed) return <div className="startup"><h1>页面暂时无法显示</h1><p>重新加载后再试一次，已保存的设置不会丢失。</p><button className="button button-outline" onClick={() => window.location.reload()}>重新加载</button></div>
    return this.props.children
  }
}
