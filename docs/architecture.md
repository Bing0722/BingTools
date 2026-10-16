# 架构设计

当前实现为单窗口 HTTP Mock 与运控串口仿真工作台。

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

`settings.json` schemaVersion 3 保存 theme、language、notificationPosition、sidebarCollapsed、sidebarWidth、windowBounds。v1/v2 显式迁移，补右下角通知位置；v1 额外补 `language: system`，其他字段保留。renderer 只允许修改偏好，窗口坐标仍由 main 管理。

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

JSON 编辑采用本地 ResponseBodyEditor 和纯函数校验/美化，无新增依赖。使用 JSON.parse 校验语法，但美化仅重排 token 间空白，保留大整数、重复键、数字写法与转义。输入和美化输出均限制 1 MiB；深层缩进最多 80 空格，避免空白膨胀。主进程 schema 继续独立校验，界面校验不能替代 IPC 边界。


## 局部操作与动效生命周期

仿真 store 的 pendingToggle 标记正在保存的接口，busy 继续串行保护命令；页面由 pendingToggle 区分整页操作和局部开关。接口开关完成时仅合并 enabled，保留等待期间的其他草稿输入。快照先到达时忽略该开关字段的短暂差异，避免“尚未保存”闪动。错误统一通知，配置警告仅在发生变化时通知。

AppShell 的路由内容按 pathname 重挂载以触发 CSS 入场，标题栏和侧栏保持稳定；阻塞导航继续由 useBlocker 处理。Radix 利用 data-state 的 CSS 动画延迟卸载弹窗；日志面板不卸载列表，收起用 inert/aria-hidden 隔离键盘与辅助技术。减少动态效果时不依赖 animationend 才能完成业务操作。


## 客户复制与名称唯一性

有限 API saveCustomer 增加可选 sourceCustomerId，IPC schema 对来源 UUID 校验。主进程在同一串行命令内校验唯一名称与来源存在性、生成独立接口 UUID，再一次原子写入新客户及所有接口；复制仅允许新建，不能覆盖已有客户。监听值由新增表单预填并允许编辑；来源的接口内容、方法、状态码及启用状态完整复制，日志和运行状态不复制。

名称比较统一 trim + toLowerCase，renderer 提前反馈，main 再次校验防止并发重名。旧文件的重复名称不触发损坏恢复或丢失配置，用户可逐个改名解决；所有新建/改名保存均检查与其他客户是否冲突。改名按原 ID 更新，仅改变客户配置，保留接口。运行中继续禁止客户编辑和复制。


## 接口卡片排序与弹窗编辑

EndpointCards 负责原生 HTML 拖放、键盘顺序调整与本地排序预览，不增加依赖。使用 Web Animations FLIP 在新旧卡片坐标间过渡，动画清理在布局 effect 返回函数内；prefers-reduced-motion 时禁用并清理动画。排序仅发送完整 ID 数组，不传任意坐标；卡片网格按数组顺序排布。

新增受控 reorderEndpoints API/命令，主进程校验传入 ID 必须是目标客户当前接口集合的完整排列，拒绝重复、缺失、外来或过期 ID，沿用串行写入和保存后更新运行配置。顺序直接保存在已有 endpoints 数组，无持久化版本变更；复制客户保留该顺序。保存失败 UI 回滚，不改变现有 HTTP 响应。

SimulatorPage 的接口 draft 只在编辑弹窗打开时存在；新增、编辑、关闭及未保存确认沿用现有 schema/guard，保存成功关闭，删除仍需确认。Dialog 支持可选 className，以复用原有 Radix 焦点与动效而不引入第二套弹窗。

通知 store 默认忽略非重要 info 事件，错误始终提示；服务生命周期与可用更新显式标记为重要事件。设置成功静默，失败仍通知。ToastHost 从设置展示副本读取四角位置，IPC 严格枚举校验，沿用原子持久化；通知内容本身不持久化。

## 运控串口模块

`shared/schemas/motion.ts` 定义严格命令、客户/规则/串口参数与事件；`motion:*` IPC 复用窗口来源校验。preload 仅暴露快照、枚举、有限业务命令和返回取消函数的事件订阅。主进程只允许打开系统枚举到的端口，拒绝任意文件路径。

`MotionController` 使用 serialport 13.0.0，驱动可注入用于 Mock 测试。客户与规则存入版本 2 的 motion.json（v1 自动补齐空尾符与 0 忽略字节，保持行为），复用 JsonRepository 的串行原子写入和损坏备份；持久化成功才更新活动客户与接收字节索引。HTTP/串口彼此独立，共用窗口关闭与退出清理。

SerialFramer 处理结束符、定长和空闲间隔，缓存上限 64 KiB；超长帧丢弃到下一边界，避免尾片误匹配。匹配索引只在配置变化时构建，接收时不复制全部配置。串口写入串行，最多排队 100 项，写入/打开/关闭有 3 秒超时保护，旧连接数据不会进入新连接。退出清除分包与日志定时器。

日志与配置状态事件分离，100ms 批量推送；主进程、待推送批次和 renderer 历史都有 2000 条上限，每条文本/HEX预览只保留前 2 KiB。递增日志 ID 用于初始化订阅去重与清空边界；配置 revision 避免旧快照覆盖新状态。MotionLogs 使用独立 Zustand 选择器、32px 固定行高虚拟列表，日志更新不重绘配置表单。

串口包保留为 Vite 主进程外部依赖，pnpm 仅允许所需 bindings-cpp 安装脚本。该模块使用 Node-API 预构建原生文件，当前保持 npmRebuild:false；electron-builder 收集依赖并解包原生文件。平台验收以实际打包和启动结果为准。参考：[SerialPort 核心包说明](https://serialport.io/docs/next/api-core-overview/)。

接收匹配按 receiveSuffix/ignoreTailBytes 参数组合分组建立字节索引；每帧对各组先剥除一次实际存在的尾符，再截掉固定尾部字节。过度截断不匹配，多组同时命中不回复并记录 MOTION_AMBIGUOUS。预处理不修改原始日志帧或发送数据。
