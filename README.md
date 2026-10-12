# BingTools

基于 Electron 的桌面工作台。采用左侧导航、右侧内容的布局，面向后续逐步加入的工具与工作页面。

当前处于设计阶段：本仓库仅包含开发约定与设计文档，尚未初始化应用、安装依赖或配置运行命令。BingTools 暂用作项目名，具体业务功能待确定。

## 文档入口

| 文档 | 用途 |
| --- | --- |
| [AGENTS.md](./AGENTS.md) | AI 与开发者共同遵循的开发约定 |
| [架构设计](./docs/architecture.md) | 技术选型、目录、进程边界、路由与数据管理 |
| [视觉与交互规范](./docs/design.md) | 布局、配色、尺寸、组件状态和桌面交互 |
| [首版范围](./docs/product.md) | 框架阶段交付范围、验收条件和待定事项 |

## 已确定的方向

- Electron + React + TypeScript，使用 electron-vite 开发与构建，electron-builder 打包。
- Tailwind CSS + shadcn/ui 构建界面，Lucide React 提供图标。
- React Router 管理页面，Zustand 管理确有共享需求的界面状态。
- 采用克制、中性、紧凑但清晰的桌面工作台风格，支持浅色、深色和跟随系统。
- 第一版以单窗口和少量示例页面验证框架，业务能力按需求逐步加入。

这些是项目选型，不代表参考产品使用了相同技术。初始化时应核对依赖兼容性，锁定版本并提交锁文件。

## 下一步实施顺序

1. 初始化 Electron、React 与 TypeScript 工程，建立开发、检查和打包命令。
2. 实现 AppShell、导航、路由和统一设计变量。
3. 实现设置读取与保存，贯通 renderer → preload → main。
4. 完成主题、布局恢复、错误状态和键盘操作。
5. 验证关键流程，并在目标操作系统上检查安装包。
