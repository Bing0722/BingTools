# BingTools

基于 Electron 的桌面工作台。采用左侧导航、右侧内容的布局，面向后续逐步加入的工具与工作页面。

当前已完成可运行的桌面雏形：工作台、示例列表与详情、设置页、主题切换、侧栏折叠与宽度设置，以及本地设置持久化。示例项目为静态演示；具体业务功能待确定。

## 文档入口

| 文档 | 用途 |
| --- | --- |
| [AGENTS.md](./AGENTS.md) | AI 与开发者共同遵循的开发约定 |
| [架构设计](./docs/architecture.md) | 技术选型、目录、进程边界、路由与数据管理 |
| [视觉与交互规范](./docs/design.md) | 布局、配色、尺寸、组件状态和桌面交互 |
| [首版范围](./docs/product.md) | 框架阶段交付范围、验收条件和待定事项 |
| [验证记录](./docs/verification.md) | 已执行的检查、桌面验证与平台限制 |

## 已确定的方向

- Electron + React + TypeScript，使用 electron-vite 开发与构建，electron-builder 打包。
- Tailwind CSS + shadcn/ui 构建界面，Lucide React 提供图标。
- React Router 管理页面，Zustand 管理确有共享需求的界面状态。
- 采用克制、中性、紧凑但清晰的桌面工作台风格，支持浅色、深色和跟随系统。
- 第一版以单窗口和少量示例页面验证框架，业务能力按需求逐步加入。

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
pnpm test            # 设置与 IPC 边界测试
pnpm build           # 生产构建
pnpm start           # 运行已构建版本
pnpm test:desktop    # 真实 Electron 自动验证，先执行 build
pnpm package         # 本机可运行的应用目录
pnpm package:mac     # macOS ZIP 包
```

macOS Apple Silicon 的本机产物位于 `release/mac-arm64/BingTools.app`。当前使用 Electron 默认应用图标，未签名、未公证，不作为公开发行包。其他平台尚未验证。

打包配置复用安装好的 Electron 分发目录，只打包当前平台及架构。跨平台或跨架构打包应移除或调整 `build.electronDist`，再准备对应目标的运行时；未来引入原生模块时重新启用依赖重建。

## 数据与验证

正式设置存放在 Electron `userData` 目录下的 `settings.json`；macOS 默认位于 `~/Library/Application Support/BingTools/`。包括主题、侧栏偏好和窗口位置。损坏文件会备份，未知的更高设置版本不会被覆盖。

桌面测试使用独立临时目录，不修改正式设置。测试截图输出到已忽略的 `test-results/`。

依赖版本与 `pnpm-lock.yaml` 已锁定。本次在网络包源不可达时使用本机缓存安装；`pnpm-workspace.yaml` 对三项间接依赖锁定了兼容版本。后续更新时应重新验证并评估是否移除这些锁定。shadcn 风格的基础组件采用 Radix + CVA 在本地维护，配置入口为 `components.json`。

## 本地提交约定

每完成一轮有意义的修改，检查差异、执行相关验证并进行 Git 本地提交。只提交当前任务相关文件，不自动推送远端。

## 下一步

确定第一项真实工具功能，把示例路由替换为实际业务页面。侧栏拖拽调宽、全局命令面板和辅助预览面板仍属于后续增强。
