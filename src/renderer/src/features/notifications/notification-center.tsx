import { useEffect, useRef, useState } from 'react'
import { Bell, CheckCheck, Info, TriangleAlert, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useNotifications } from '@/stores/notification-store'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
export function NotificationCenter() {
  const { t, i18n } = useTranslation()
  const { items, markRead, clear } = useNotifications()
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const unread = items.filter((item) => !item.read).length
  return <><Button ref={trigger} variant="ghost" size="icon" className="notification-trigger" aria-label={t('notifications')} onClick={() => setOpen(true)}><Bell size={17} />{unread > 0 && <span className="notification-count">{unread > 99 ? '99+' : unread}</span>}</Button>
    <Dialog open={open} onOpenChange={(value) => { setOpen(value); if (!value) requestAnimationFrame(() => trigger.current?.focus()) }} title={t('notifications')} description={t('notificationHelp')}>
      <div className="notification-actions"><Button size="sm" variant="ghost" onClick={markRead}><CheckCheck size={14} />{t('markRead')}</Button><Button size="sm" variant="ghost" onClick={clear}>{t('clearNotifications')}</Button></div>
      <div className="notification-list">{!items.length && <p className="muted empty-mini">{t('noNotifications')}</p>}{items.map((item) => <article key={item.id} className={`notification-item ${item.read ? '' : 'unread'}`}>
        {item.level === 'error' ? <TriangleAlert size={16} /> : <Info size={16} />}<div><p>{t(item.key)}</p><small>{new Intl.DateTimeFormat(i18n.language, { timeStyle: 'medium' }).format(item.time)}{item.count > 1 && ` · ${t('repeatCount', { count: item.count })}`}</small></div>
      </article>)}</div>
    </Dialog></>
}
export function ToastHost() {
  const { t } = useTranslation()
  const { toasts, dismiss } = useNotifications()
  useEffect(() => {
    if (!toasts.length) return
    const timer = setInterval(() => { for (const item of useNotifications.getState().toasts) if (item.expires <= Date.now()) dismiss(item.id) }, 500)
    return () => clearInterval(timer)
  }, [toasts.length, dismiss])
  return <div className="toast-host" aria-live="polite" aria-relevant="additions text">{toasts.map((item) => <div className={`toast ${item.level}`} key={item.id}><span>{t(item.key)}{item.count > 1 && ` (${item.count})`}</span><Button variant="ghost" size="icon" onClick={() => dismiss(item.id)} aria-label={t('dismiss')}><X size={14} /></Button></div>)}</div>
}
