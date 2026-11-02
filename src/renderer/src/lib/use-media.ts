/**
 * 媒体查询 Hook：订阅窗口宽度、系统主题或减少动态效果等浏览器状态，并在卸载时清理。
 */
import { useEffect, useState } from 'react'
export function useMedia(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const media = window.matchMedia(query)
    const update = () => setMatches(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [query])
  return matches
}
