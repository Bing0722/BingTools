import { Check, Monitor, Moon, Sun, RotateCcw } from 'lucide-react'
import { useRef, useState } from 'react'
import { useSettings } from '@/stores/settings-store'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'

export function SettingsPage() {
  const { preferences, update, saving, error } = useSettings()
  const [reset, setReset] = useState(false)
  const resetButton = useRef<HTMLButtonElement>(null)
  const choices = [{ id: 'light' as const, label: '浅色', icon: Sun }, { id: 'dark' as const, label: '深色', icon: Moon }, { id: 'system' as const, label: '跟随系统', icon: Monitor }]
  function closeReset(open: boolean) { setReset(open); if (!open) requestAnimationFrame(() => resetButton.current?.focus()) }
  return <div className="page-container settings-page"><div className="page-intro"><div className="eyebrow">MAKE IT YOURS</div><h1>让工作台更合心意</h1><p>调整外观与布局，找到舒服的工作方式。</p></div>
    <section className="settings-section"><h2>外观</h2><p>选择你喜欢的主题，设置会自动保存到这台设备。</p><div className="theme-grid" role="group" aria-label="主题">{choices.map(({ id, label, icon: Icon }) => <button disabled={saving} key={id} className={`theme-choice ${preferences.theme === id ? 'chosen' : ''}`} aria-pressed={preferences.theme === id} onClick={() => void update({ theme: id })}><div className={`theme-preview preview-${id}`} aria-hidden="true"><div className="preview-sidebar"><i /><i /><i /></div><div className="preview-content"><i /><i /><b /><b /></div></div><span><Icon size={15} />{label}{preferences.theme === id && <Check size={15} className="choice-check" />}</span></button>)}</div></section>
    <section className="settings-section"><h2>布局</h2><div className="setting-row"><div><h3>折叠侧栏</h3><p>保留图标，为内容留出更多空间。</p></div><button className="switch" role="switch" aria-label="折叠侧栏" aria-checked={preferences.sidebarCollapsed} disabled={saving} onClick={() => void update({ sidebarCollapsed: !preferences.sidebarCollapsed })}><span /></button></div><div className="setting-row"><div><h3>侧栏宽度</h3><p>调整展开状态下的导航宽度。</p></div><select aria-label="侧栏宽度" disabled={saving} value={preferences.sidebarWidth} onChange={(event) => void update({ sidebarWidth: Number(event.target.value) })}><option value={200}>紧凑 · 200px</option><option value={240}>标准 · 240px</option><option value={280}>宽松 · 280px</option><option value={320}>加宽 · 320px</option></select></div></section>
    <section className="settings-section"><h2>应用信息</h2><div className="setting-row"><div><h3>BingTools <span className="badge">预览版</span></h3><p>一个清晰、有序的本地桌面工作台。</p></div><span className="muted">0.1.0</span></div><div className="setting-row"><div><h3>恢复默认外观</h3><p>重置主题、侧栏宽度和折叠偏好。</p></div><Button ref={resetButton} variant="outline" size="sm" onClick={() => setReset(true)} disabled={saving}><RotateCcw size={14} />恢复默认</Button></div></section>
    <div className="save-status" role="status">{saving ? '正在保存…' : error ? '设置未保存，请重新选择或重试。' : <><Check size={14} />当前偏好已读取，修改后自动保存</>}</div>
    <Dialog open={reset} onOpenChange={closeReset} title="恢复默认外观？" description="主题将跟随系统，侧栏恢复为展开状态和标准宽度。"><div className="dialog-actions"><Button variant="outline" onClick={() => closeReset(false)}>取消</Button><Button disabled={saving} onClick={async () => { if (await update({ theme: 'system', sidebarCollapsed: false, sidebarWidth: 240 })) closeReset(false) }}>恢复默认</Button></div></Dialog>
  </div>
}
