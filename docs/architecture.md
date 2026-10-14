# 架构设计

版本：0.2；当前实现为单窗口 HTTP Mock 工作台。

## 技术与进程边界

| 技术 | 职责 |
| --- | --- |
| Electron / electron-vite / electron-builder | 安全隔离窗口、三层构建、本机打包 |
| React / TypeScript / React Router | 页面和类型；Hash 数据路由及未保存导航阻塞 |
| Tailwind / 本地 shadcn 风格 Radix 组件 / Lucide | 语义主题、按钮、弹窗、Tooltip、线性图标 |
| Zustand | 设置展示副本、仿真快照、通知和共享布局状态 |
| Zod | IPC 输入、JSON 文件、编辑草稿校验 |
| Node 内置 HTTP | 主进程服务，无 Web 框架或独立后台进程 |
| i18next / react-i18next | 界面即时翻译和语言资源订阅 |
| Vitest / Playwright Electron | 真实 HTTP 及持久化测试、真实桌面流程 |

```text
外部客户端 ── HTTP ──> main/HttpSimulator
                         ↑ 成功保存后替换配置
renderer ── window.app ──> preload ── 固定 IPC ──> 来源/参数校验
   ↑                                             ↓
   └──── 状态快照 / 日志事件 ───────── SimulatorController
                                                 ↓ 串行原子保存
                                  userData/settings.json + simulator.json
```

renderer 不访问 Node、文件系统或 Electron 特权接口。窗口保持 `contextIsolation: true`、`sandbox: true`、`nodeIntegration: false`，拒绝新窗口、内容导航与权限请求；生产 CSP 禁止 renderer 发起网络连接。HTTP 监听只发生在主进程。

## 目录与职责

```text
src/main/
  index.ts                         窗口、应用退出与服务释放
  menu.ts                          根据语言生成自定义菜单
  ipc/{guard,settings,simulator}.ts 固定 channel、主窗口/frame/URL 来源检查
  services/http-simulator.ts        HTTP 匹配、大小限制、连接生命周期
  services/simulator-controller.ts  配置与启停串行队列、状态事件
  services/log-buffer.ts            会话日志、预览限长、请求头脱敏
  storage/json-repository.ts        通用版本检查、备份、串行原子写入
  storage/*-repository.ts           设置和仿真配置的校验适配
src/preload/index.ts                按用途暴露有限 API，包装订阅清理
src/shared/
  schemas/{settings,simulator}.ts   跨进程 Zod 规则和业务类型
  contracts/{app-api,simulator}.ts  Result、快照、日志与状态契约
src/renderer/src/
  app/                             providers、Hash 数据路由、错误边界
  shell/                           AppShell、导航、标题栏
  components/ui/                   通用基础组件
  features/{simulator,settings,notifications}/
  stores/                          共享展示状态和事件同步
  i18n/                            zh-CN / en 资源与初始化
  styles/globals.css               语义变量与布局
```

## API 和状态

`window.app.settings` 提供 `get/update`；`window.app.simulator` 提供快照、客户保存／删除／选择、接口保存／删除／开关、启动／停止、日志清空、事件订阅。具体参数见 `shared/contracts/app-api.ts`。不暴露任意 channel、URL 请求、文件路径或命令接口。

主进程检查调用来自预期主窗口、主 frame 和加载文档；参数再经严格 Zod 校验，未知字段被拒绝。返回稳定代码的 `Result<T>`；页面翻译代码，IPC 异常由 store 捕获。preload 每个订阅返回取消函数，provider 卸载时调用。

主进程控制器的命令队列串行处理启停及配置操作。状态分为 stopped、starting、running、stopping、failed；控制器退出时立刻拒绝新命令，等队列结束后停服。窗口关闭和应用退出复用同一释放 Promise。

快照带递增 revision，日志为增量事件。renderer 先订阅、缓冲，再获取快照，按 revision 忽略过期数据，避免初始加载漏请求。业务数据权威副本在 main；renderer store 仅持展示快照。输入草稿、筛选和滚动暂停留在组件，当前页面由路由管理。客户选择随业务配置持久化，不另建路由选中状态。

## HTTP 语义与资源限制

每次请求开始获取一份客户配置快照。通过 URL pathname 和 HTTP method 查找启用接口，查询参数不匹配；未匹配返回 404。路径必须已规范化，以 `/` 开头、不含空格、查询或片段；非 ASCII 路径需 URL 编码。

响应固定 JSON 或文本，Content-Type 自动设置。HEAD、204、304 去掉正文。请求超 1 MiB 返回 413 并关闭连接，响应通过 schema 限制 1 MiB。请求头上限 16 KiB，接收请求超时 15 秒；预览只缓存约 8 KiB。停止先关闭监听和空闲连接，3 秒后强制断开残余 HTTP 连接。升级协议不受支持，连接直接结束。

运行时只能编辑当前服务的接口；客户切换、监听地址变更和删除客户必须先停止。保存先落盘，再更新服务配置；磁盘失败不会改变正在生效的响应。运行状态不持久化，重新打开只能手动启动。

## 持久化

`settings.json` schemaVersion 2 保存 theme、language、sidebarCollapsed、sidebarWidth、windowBounds。v1 显式迁移，补 `language: system`，其他字段保留。renderer 只允许修改偏好，窗口坐标仍由 main 管理。

`simulator.json` schemaVersion 1 保存 selectedCustomerId、customers；每个客户保存 id/name/host/port/protocol/endpoints。两份文件各自独立排队，采用同目录 `.tmp` 写入后 rename。内存仅在成功替换后更新。缺失文件默认值；损坏文件先更名 `.corrupt-时间戳`；新版本、读失败或备份失败均只读，避免覆盖原始数据。

日志与通知从不持久化。完整设置和客户数据会留在本机 userData，不进入 Git。

## 语言、日志与通知

i18next 内嵌简中／英文资源，系统 locale 来自主进程；中文映射 zh-CN，其余 en。偏好保存后 renderer 即时切换，main 重建自定义菜单。原生系统菜单项目仍由操作系统决定语言。

事件和错误使用稳定代码，用户数据以单独字段传递；通知保存 key 而非翻译字符串，因此旧通知随语言切换。日志时间由 `Intl.DateTimeFormat` 格式化。

LogBuffer 最多 1000 条，预览分别最多 8 KiB、UTF-8 边界安全、敏感头部脱敏。通知中心最多 100 条重要事件；同代码 5 秒内合并，轻提示最多同时 3 条，约 5 秒消失。普通 HTTP 记录不触发通知。

## 构建与验证

使用单一 pnpm 锁文件，在线安装，连接失败先排障。`build` 包含类型检查；`package` 复用已安装的当前平台 Electron 运行时。本机 macOS ARM64 验证，签名、公证、跨平台发布另行处理。测试运行需要允许本机回环监听，桌面测试使用独立临时目录。

官方参考：[Node HTTP](https://nodejs.org/api/http.html)、[Electron 安全](https://www.electronjs.org/docs/latest/tutorial/security/)、[i18next API](https://www.i18next.com/overview/api)、[React 翻译集成](https://react.i18next.com/latest/usetranslation-hook)。

## 更新模块

`services/update-controller.ts` 是可注入后端的更新状态机，`demoBackend` 为默认无网络演示；`github-updater.ts` 包装 electron-updater，仅配置仓库且打包后启用。仓库取构建时 `release.config.json` 或 `BINGTOOLS_UPDATE_REPOSITORY`，不保存用户级更新源或 Token。

固定 `updater:*` IPC 复用来源检查，订阅返回清理函数，快照包含 revision。设置页 UpdateSection 保留展示副本；更新状态在主进程，切换页面不会取消后台动作。真实安装前调用已有 shutdown，安装失败恢复应用生命周期。远端已接入公开 Bing0722/BingTools，版本由构建统一注入，GitHub 更新说明以文本显示；未签名 macOS 限制为手动下载。详细边界与未验证事项见 [应用更新](updates.md)。

## 窗口标题栏与侧栏动效

AppShell 使用两行 Grid：顶部 PageHeader 跨两列，下面为侧栏和内容。侧栏宽度使用 CSS Grid 过渡，文字保持挂载并淡出，不增加动画依赖。主进程配置 macOS 原生按钮位置和 Windows titleBarOverlay；nativeTheme 的应用级监听同步 Windows 按钮颜色，窗口销毁后不再操作窗口。Windows 默认自动隐藏原生菜单，保留 Alt 访问与快捷键；不新增窗口控制 IPC。
