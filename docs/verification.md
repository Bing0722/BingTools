# 雏形验证记录

日期：2026-10-12。环境：macOS Apple Silicon，Node.js 22.22.3，pnpm 11.5.2，Electron 44.5.1。

## 已执行

| 检查 | 结果 |
| --- | --- |
| 依赖安装 | 从本机缓存完成，Electron 二进制安装成功，提交 pnpm 锁文件 |
| TypeScript | `pnpm typecheck` 通过；`pnpm build` 与 `pnpm package` 亦包含此检查 |
| ESLint | `pnpm lint` 通过 |
| 单元测试 | `pnpm test`：7 项通过 |
| 生产构建 | `pnpm build` 通过，main/preload/renderer 均生成产物 |
| 本机打包 | `pnpm package` 通过，生成 `release/mac-arm64/BingTools.app` |
| 桌面自动化 | 开发目录的生产构建和最终 `.app` 均运行过真实 Electron 流程；最终打包版本全部通过 |
| 截图检查 | 查看工作台、深色设置与窄窗口，修复导航样式和折叠导航可访问名称 |

## 逻辑覆盖

- 拒绝未知字段、特权字段、非法主题和超范围宽度。
- 来源检查允许应用内部 hash 路由，拒绝其他文档和来源。
- 保存后重新加载恢复偏好。
- 并发设置更新不丢失字段。
- 损坏文件保留备份并回退默认值。
- 更高版本设置不被覆盖。
- 无效更新失败后写入队列仍可使用。

## 真实桌面流程

自动验证脚本为 `scripts/smoke.mjs`，使用独立临时数据目录：

1. 打开工作台，检查导航布局。
2. 修改深色主题及侧栏宽度，读取磁盘文件确认保存。
3. 通过 IPC 提交非法设置，确认拒绝。
4. 打开、关闭恢复默认弹窗。
5. 搜索示例、进入详情、操作菜单与说明弹窗、返回后恢复筛选。
6. 检查失败重试、空状态与返回列表。
7. 缩小窗口，验证折叠导航、导航弹窗和无页面横向溢出。
8. 关闭并重新启动，确认主题和宽度偏好恢复。
9. 切换浅色，验证用户折叠与展开侧栏。
10. 确认测试期间没有 renderer 的未捕获异常。

测试截图位于 `test-results/`，不纳入 Git。本次验证发现并修复了退出等待、Tooltip 包装导航样式以及折叠时的可访问名称问题。

## 当前限制

- 这是带真实设置保存的界面雏形，示例内容不创建业务文件。
- 未验证 Windows/Linux、跨架构构建、安装器、自动更新、签名或公证。
- 当前包使用 Electron 默认图标；macOS `.app` 是本机未签名开发产物。
- 打包复用本机 Electron 分发目录，暂不支持直接跨平台打包。
- 系统主题响应、多显示器位置恢复、全部键盘路径和对比度尚未做完整专项验收。
- 构建存在 Zod 上游注释标记的 Rollup 提示；构建成功，未修改或屏蔽上游代码。
- 尚未实现全局命令面板、拖拽侧栏调宽、业务模块和正式品牌图标。

## 复现命令

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:desktop
pnpm package
BINGTOOLS_EXECUTABLE="$PWD/release/mac-arm64/BingTools.app/Contents/MacOS/BingTools" node scripts/smoke.mjs
```
