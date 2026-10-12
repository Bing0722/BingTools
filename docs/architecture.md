# 架构设计

状态：桌面雏形已实现，本文记录当前结构与扩展约束。版本：0.1。

## 1. 目标与边界

建立单窗口桌面工作台：左侧导航固定存在，右侧切换页面，支持统一主题、设置保存与布局恢复。让新增页面遵循一致结构，同时保持系统权限集中、界面与数据访问解耦。

第一版不实现账号、联网业务、插件加载、多窗口同步或 AI 模型接入。将来出现明确需求后再补充对应设计。

## 2. 技术选型

| 选型 | 职责与约束 |
| --- | --- |
| Electron | 桌面窗口与系统接口，采用安全隔离配置 |
| React + TypeScript | 组件、页面与类型契约，启用严格类型检查 |
| electron-vite | main、preload、renderer 的开发及构建 |
| Tailwind CSS | 布局和样式，通过语义变量统一主题 |
| shadcn/ui | 将基础组件代码纳入项目维护，初始化时统一选择一种底层组件方案 |
| Lucide React | 统一线性图标，按需导入 |
| React Router | 页面导航，使用基础客户端路由即可 |
| Zustand | 少量共享 UI 状态；局部状态仍使用 React |
| Zod | IPC 参数、设置文件等边界的运行时校验 |
| electron-builder | 安装包生成；签名与发布在目标平台明确后配置 |
| Vitest | 纯逻辑与边界校验测试；版本在初始化时确定 |

shadcn/ui 的 Sidebar、Dialog、DropdownMenu、Tooltip 等按实际需要引入。可调分栏仅在实施对应需求时加入 Resizable，普通布局使用 CSS。第一版不需要 SSR 框架或独立 HTTP 后端。

## 3. 进程与调用关系

```text
renderer：页面 / 组件 / 路由 / UI 状态
    │ window.app.settings.get() 等明确接口
    ▼
preload：contextBridge / 参数转发 / 事件清理
    │ 允许的 IPC channel
    ▼
main：来源校验 → 参数校验 → 服务 → 持久化或系统能力
```

main 不直接驱动 React 组件，renderer 不决定可访问的系统资源范围。敏感操作的最终授权与校验在主进程完成。

窗口配置使用 contextIsolation: true、sandbox: true、nodeIntegration: false。限制内容导航与新窗口打开；外部链接先校验协议与用途，再由系统浏览器打开。配置 CSP，开发与生产策略分开，生产不沿用开发服务器的宽松策略。

## 4. 当前目录

核心代码结构如下。当前窗口生命周期集中在 main/index.ts；出现多窗口或更复杂业务后再拆分窗口与服务模块。

```text
src/
├── main/
│   ├── index.ts
│   ├── ipc/                 # 设置接口与来源检查
│   └── storage/settings-repository.ts
├── preload/
│   └── index.ts
├── shared/
│   ├── contracts/app-api.ts
│   ├── schemas/settings.ts
└── renderer/src/
    ├── app/                 # 入口、路由、providers、错误边界
    ├── shell/               # AppShell、AppSidebar、PageHeader
    ├── components/ui/       # 通用基础组件
    ├── features/            # workspace、examples、settings
    ├── stores/              # 跨组件 UI 状态
    ├── lib/                 # 界面侧工具与 API 适配
    └── styles/              # 全局样式与设计变量
tests/
```

组件仅在实际存在复用需求时抽取。不要把所有逻辑集中到 App.tsx，也不要预先建立与现有需求无关的抽象层。

## 5. 布局与路由

AppShell 包含侧栏和主内容区，主内容区包含 PageHeader 与路由出口。框架在路由切换时保持挂载。页面自行决定正文布局，但遵循统一滚动、边距与状态规范。

首版路由建议：

| 路由 | 页面 |
| --- | --- |
| /workspace | 默认工作台，展示引导与示例入口 |
| /examples/list | 列表布局示例，使用明确标注的演示数据 |
| /examples/detail/:id | 详情布局示例 |
| /settings | 外观和布局设置 |
| 其他路径 | 应用内未找到页面，提供返回入口 |

默认采用 HashRouter，使通过本地文件加载的安装包不依赖服务器路由回退。开发和生产保持同一种路由方式。如后续采用自定义协议并改用其他路由方案，应补充迁移决策。

导航项以配置描述 id、label、icon、path；活动状态交给路由匹配，详情路由匹配所属分组。示例项以后可替换为业务功能。

## 6. 状态划分

| 状态 | 所属层 |
| --- | --- |
| 当前页面、详情 ID | 路由 |
| 输入框、临时筛选、菜单是否打开 | 组件或页面局部状态 |
| 用户主动折叠侧栏、共享面板状态 | layout store |
| 主题偏好、侧栏宽度 | 主进程设置，界面持有同步后的展示状态 |
| 项目、历史记录等业务实体 | 将来由业务服务管理，不预先塞进 layout store |

布局状态区分“用户偏好”与“窗口变窄时的临时折叠”。临时折叠不覆盖用户保存的偏好，窗口恢复宽度后恢复原布局。

## 7. IPC 契约

首版只暴露需要的接口：

```ts
interface AppApi {
  settings: {
    get(): Promise<Result<SettingsSnapshot>>
    update(patch: SettingsPatch): Promise<Result<SettingsSnapshot>>
  }
}

// Snapshot 仅包含界面需要的偏好与恢复提示，不暴露 windowBounds。
interface SettingsSnapshot {
  preferences: { theme: 'system' | 'light' | 'dark'; sidebarCollapsed: boolean; sidebarWidth: number }
  warning?: string
}

type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } }
```

具体类型在 shared/contracts/app-api.ts 中定义；只读 platform 字段用于平台布局适配。update 仅接受允许修改的字段，不允许任意键覆盖设置。main 校验调用来自受信任的主窗口主 frame，并按当前环境验证加载来源，再校验 payload。

业务失败转换为稳定的错误码和可展示信息，完整内部错误仅进入经过脱敏的日志。IPC 传输本身的异常仍可能使 Promise reject，界面适配层必须捕获并显示可恢复状态。

以后增加事件时，preload 的订阅接口返回清理函数，不把原始 Electron event 对象传给页面。

## 8. 设置与持久化

第一版只保存少量设置，使用主进程管理的 JSON 文件，位置为 app.getPath('userData') 下的应用设置文件。暂不引入数据库。

初始字段：schemaVersion、theme（system/light/dark）、sidebarCollapsed、sidebarWidth、windowBounds。平台窗口细节由主进程管理，不允许页面任意修改原始窗口配置。

保存遵循以下流程：校验 patch → 合并当前值 → 校验完整结果 → 串行写入同目录临时文件 → 替换正式文件 → 返回已保存结果。窗口移动与尺寸变化使用防抖，关闭或退出时保存最新位置并等待写入完成。当前侧栏宽度通过设置页的四档选项调整，拖拽调宽尚未实现。

缺失文件使用默认值；损坏文件保留备份并回退默认值，同时给予非阻塞提示。版本变更使用显式迁移；遇到更高且不支持的版本，不静默覆盖原文件。窗口位置恢复前检查是否仍位于可用显示器范围，避免窗口出现在屏幕外。

主题启动时先解析已保存偏好与系统主题，尽早设置页面主题，降低首屏闪烁。设置保存失败时告知用户，并恢复已保存状态或提供明确重试。

## 9. 验证与构建

已建立 dev、typecheck、lint、test、build、package 和 test:desktop 脚本，使用 pnpm 并提交单一锁文件。另有 start 运行生产构建，package:mac 生成 macOS ZIP。

单元测试优先覆盖设置校验、迁移、损坏恢复和不合法 IPC 输入。实际 Electron 验证覆盖启动、导航、主题、保存后重启、窗口缩放、键盘焦点与打包后资源加载。

当前优先验证本机 macOS Apple Silicon。具体结果见 verification.md；Windows/Linux、签名、公证和自动更新未验证，不得将本机成功视为跨平台交付成功。

## 10. 官方参考

- [Electron 进程模型](https://www.electronjs.org/docs/latest/tutorial/process-model)
- [Electron 安全建议](https://www.electronjs.org/docs/latest/tutorial/security/)
- [electron-vite](https://electron-vite.org/guide/)
- [shadcn/ui](https://ui.shadcn.com/docs)
- [React Router](https://reactrouter.com/start/modes)
- [electron-builder](https://www.electron.build/)
