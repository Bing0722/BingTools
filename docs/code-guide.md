# 代码阅读指南

源码中的中文注释按两层组织：文件顶部说明模块职责，关键步骤旁解释状态、执行顺序和边界条件。建议结合实际调用链阅读，不必从第一行逐个文件顺读。

## 推荐顺序

1. `src/main/index.ts`：应用启动、配置加载、窗口安全设置，以及关闭窗口前的停服和保存。
2. `src/shared/contracts/app-api.ts` 与 `src/preload/index.ts`：页面能调用哪些能力，这些能力如何映射到固定 IPC。
3. `src/shared/schemas/` 与 `src/main/ipc/`：运行时输入校验、可信窗口检查和稳定错误码。
4. `src/main/services/simulator-controller.ts` 与 `motion-controller.ts`：业务命令排队、保存后生效、连接生命周期。
5. `src/main/storage/json-repository.ts`：默认值、损坏备份、更高版本只读保护和临时文件替换。
6. `src/renderer/src/main.tsx` → `app/providers.tsx` → `app/router.tsx` → `shell/app-shell.tsx`：页面如何启动、订阅事件并展示路由内容。
7. `src/renderer/src/features/` 与 `stores/`：页面草稿、共享快照、局部忙碌反馈和日志显示。

## 以“保存接口”为例

`features/simulator/simulator-page.tsx` 中的局部草稿先通过共享 schema 校验，再由 `simulator-store.ts` 的 `run` 调用 `window.app.simulator.saveEndpoint`。

preload 将操作转换为 `simulator:command`。主进程 IPC 检查窗口来源与参数后，交给 `SimulatorController.execute` 串行执行。控制器检查客户和接口冲突，仓库成功写盘后才热更新活动服务并发布快照。保存失败时继续使用原配置，页面保留草稿。

页面的命令返回值和事件可能交错到达，因此 store 使用递增 `revision` 拒绝旧快照；页面里的 `draft` 是未保存输入，不能被每次快照更新直接覆盖。

## 协议与高频数据

| 想理解的内容 | 主要文件 |
| --- | --- |
| HTTP 方法和路径匹配、正文限长、延时取消 | `src/main/services/http-simulator.ts` |
| TCP 字段提取、接口名称匹配、连接清理 | `src/main/services/tcp-simulator.ts` |
| TCP 拆包、粘包、长度头与 Unicode 计数 | `src/main/services/tcp-framing.ts` |
| 串口结束符、定长、空闲分帧及超长丢弃 | `src/main/services/serial-framer.ts` |
| 串口尾部处理、匹配索引、共享发送队列 | `src/main/services/motion-controller.ts` |
| 串口日志批量接收、去重与可见行渲染 | `src/renderer/src/stores/motion-store.ts`、`features/motion/motion-logs.tsx` |
| 导入预览凭证、工作线程、整批合并 | `src/main/ipc/transfer.ts`、`services/transfer-worker.ts`、`services/transfer-data.ts` |
| 更新阶段和安装前停服 | `src/main/services/update-controller.ts`、`src/main/index.ts` |

## 常见术语

- `schema`：在运行时检查真实数据的规则；TypeScript 类型只在开发和构建时检查。
- `snapshot`：主进程当前状态的展示副本；页面不能靠修改它直接保存配置。
- `revision`：状态版本序号，用于识别过期异步结果；不是应用版本或配置文件版本。
- `queue`：将异步任务按顺序执行的 Promise 链，避免保存、启停等操作互相竞争。
- `dispose` / `unsubscribe`：清理定时器、观察器或订阅，防止卸载后重复回调。
- `FLIP`：记录布局变化前后的位置，以反向位移开始，再动画回到新位置。

本轮仅补充注释与阅读文档，不改变应用行为，应用版本保持 0.8.5；验证结果见 `verification.md`。
