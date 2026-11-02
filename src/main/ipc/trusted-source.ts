/**
 * 校验文档完整地址，仅忽略用于前端路由的 hash，避免把其他页面当成可信来源。
 */
export function isTrustedUrl(candidate: string, expected: string): boolean {
  try {
    const actual = new URL(candidate)
    const allowed = new URL(expected)
    // HashRouter 的页面切换只改变 hash；协议、主机、路径和查询参数仍必须完全相同。
    actual.hash = ''
    allowed.hash = ''
    return actual.href === allowed.href
  } catch { return false }
}
