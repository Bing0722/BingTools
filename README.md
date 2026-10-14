# BingTools

基于 Electron 的本地 HTTP Mock 桌面工具。左侧导航，右侧配置客户和接口，下方实时查看请求日志。

当前版本 0.2：客户管理、HTTP 监听、接口独立开关与运行中更新、JSON／文本响应、日志筛选与脱敏、应用内通知、简中／英文／跟随系统。保留主题、侧栏和本地设置；旧演示页面已移除。

## 文档入口

| 文档 | 用途 |
| --- | --- |
| [AGENTS.md](./AGENTS.md) | AI 与开发者共同遵循的开发约定 |
| [架构设计](./docs/architecture.md) | 技术选型、目录、进程边界、路由与数据管理 |
| [视觉与交互规范](./docs/design.md) | 布局、配色、尺寸、组件状态和桌面交互 |
| [首版范围](./docs/product.md) | 服务器仿真交付范围与验收条件 |
| [验证记录](./docs/verification.md) | 已执行的检查、桌面验证与平台限制 |

## 已确定的方向

- Electron + React + TypeScript，使用 electron-vite 开发与构建，electron-builder 打包。
- Tailwind CSS + shadcn/ui 构建界面，Lucide React 提供图标。
- React Router 管理页面，Zustand 管理确有共享需求的界面状态。
- 采用克制、中性、紧凑但清晰的桌面工作台风格，支持浅色、深色和跟随系统。
- Node 内置 HTTP 在主进程运行服务，受控 IPC 隔离系统能力；i18next + react-i18next 提供即时语言切换。

这些是项目选型，不代表参考产品使用了相同技术。初始化时应核对依赖兼容性，锁定版本并提交锁文件。

## 本地运行

需要 Node.js 22.13+（建议 Node 22 LTS 的最新补丁）及 pnpm 11.5.2。

```sh
pnpm install
pnpm dev
```

安装脚本会准备 Electron 运行时。开发环境提供界面热更新。关闭窗口后，macOS 上应用仍可驻留；使用应用菜单“退出”或 Cmd+Q 完全退出。

```sh
pnpm typecheck       # TypeScript 检查
pnpm lint            # ESLint 检查
pnpm test            # 真实 HTTP、持久化与边界测试
pnpm build           # 生产构建
pnpm start           # 运行已构建版本
pnpm test:desktop    # 真实 Electron 自动验证，先执行 build
pnpm package         # 本机可运行的应用目录
pnpm package:mac     # macOS ZIP 包
```

macOS Apple Silicon 的本机产物位于 `release/mac-arm64/BingTools.app`。当前使用 Electron 默认应用图标，未签名、未公证，不作为公开发行包。其他平台尚未验证。

打包配置复用安装好的 Electron 分发目录，只打包当前平台及架构。跨平台或跨架构打包应移除或调整 `build.electronDist`，再准备对应目标的运行时；未来引入原生模块时重新启用依赖重建。

## 数据与验证

正式设置存放在 Electron `userData` 目录下的 `settings.json`；macOS 默认位于 `~/Library/Application Support/BingTools/`。包括主题、语言、侧栏偏好和窗口位置；v1 设置会迁移到 v2。客户及接口独立存入 `simulator.json`。损坏文件会备份，未知的更高版本不会被覆盖。日志和通知只存在当前会话。

桌面测试使用独立临时目录，不修改正式设置。测试截图输出到已忽略的 `test-results/`。

依赖版本与 `pnpm-lock.yaml` 已锁定。使用 npm 官方源及 `pnpm install` 默认在线模式；在线连接失败时先修复，不退回离线安装。之前为了离线缓存添加的间接依赖覆盖已移除。shadcn 风格的基础组件采用 Radix + CVA 在本地维护，配置入口为 `components.json`。

## 本地提交约定

每完成一轮有意义的修改，检查差异、执行相关验证并进行 Git 本地提交。只提交当前任务相关文件，不自动推送远端。

## 使用流程

1. 在服务器仿真页新增客户，设置本机监听 IP 和端口，默认 `127.0.0.1:8080`。
2. 新增接口，填写方法、路径和响应，打开启用开关并保存。
3. 点击启动服务，使用外部客户端访问，例如 `curl http://127.0.0.1:8080/api/example`。
4. 日志面板查看请求结果，点击记录查看脱敏请求头和截断后的正文预览。
5. 接口开关和保存立即作用于后续请求；切换客户或修改监听地址前先停止。

只支持固定 JSON／文本 HTTP 响应；不执行脚本，不支持 HTTPS 或自动启动。请求和响应上限各 1 MiB；日志预览各 8 KiB。关闭窗口停止服务，重新打开不会自动监听。
