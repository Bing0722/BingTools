# 应用更新与后续 GitHub 接入

## 当前状态：本地演示

当前 `release.config.json` 的 `repository` 为空。设置 → 应用更新显示「本地演示」，可以模拟检查版本和下载进度。演示版本取当前补丁版本加一，只是界面样例；没有请求 GitHub、下载文件、安装或重启。演示状态不写磁盘，重启恢复未检查。

已准备 GitHub 后端、受控 IPC、状态机及发布打包配置，但未连接真实仓库，未进行真实升级安装验收；本次不设置 Git remote、不上传、不推送、不发布 Release。

## 后续接入公开仓库

1. 创建用于存放安装包的公开 GitHub 仓库。源码仓库可以独立，客户端只需要公开的 Releases。
2. 将 `release.config.json` 改为真实地址，例如 `{"repository":"your-name/BingTools"}`。也可在构建时设置 `BINGTOOLS_UPDATE_REPOSITORY=owner/repo`；构建器和应用使用同一值。该值随构建固定，终端用户不能从界面指定任意下载地址。
3. 调整 `package.json` 的版本（例如从 0.2.0 到 0.2.1），准备目标平台的签名证书，再运行 `pnpm package:release`。
4. 将生成的安装包、对应更新元数据和 blockmap 一并添加到相同的 GitHub Release。Tag 对应版本，例如 `v0.2.1`，选择正式 Release；草稿和预发布版本不面向当前稳定通道。
5. 在已经配置同一个 GitHub 仓库的旧版安装应用中，打开设置，手动检查 → 下载 → 确认重启安装。

`pnpm package:release` 明确使用 `--publish never`，只构建本机平台／架构，不创建远端 Release，也不上传文件。默认空配置时命令拒绝生成真实发布包。现有 `pnpm package` 仍可生成本地演示应用。

首次接入需要手动分发带真实仓库配置的基础版本；现在这份本地演示包不会自行发现后续远端版本。私有仓库下载尚未实现，不要在客户端嵌入 GitHub Token。若以后需要私有发布，需要另行设计下载鉴权。

## 产物

| 平台 | 更新与安装产物 |
| --- | --- |
| macOS | ZIP（自动更新需要）、DMG、`latest-mac.yml` 及构建生成的 blockmap |
| Windows | NSIS EXE、`latest.yml` 及 blockmap |
| Linux | AppImage、`latest-linux.yml` 及 blockmap |

上传真实构建生成的文件，不要手写哈希或随意重命名资产。不同平台生成各自的 metadata；同一平台的多架构发布要正确合并对应 metadata，当前脚本只处理本机架构。

macOS 自动更新要求有效代码签名，正式分发还应完成公证；现有未签名开发包不能作为自动安装已验收的依据。签名使用当前 electron-builder v26 的环境变量与配置，不把证书或密码提交到 Git。发布配置会移除本地预览专用的 `identity: null`。参见 [electron-builder v26 自动更新文档](https://www.electron.build/v26/docs/features/auto-update/)。

## 实现约束

- 使用 `electron-updater` 6.8.9：GitHub provider、稳定版本通道、禁止降级，不自动检查、不自动下载、不在退出时自动安装。
- `UpdateController` 管理检查中、可下载、下载中、已下载、安装中和错误状态；同一时刻只运行一个动作。下载显示进度，失败展示稳定错误代码及通知。
- 未配置仓库始终为 demo；配置仓库但未打包时为 unavailable，避免开发过程意外下载或安装。
- renderer 只有 getSnapshot/check/download/install/onEvent，所有 IPC 校验来源，无任意网络请求、文件路径、命令或令牌入口。
- 安装前显式确认，然后保存已生效配置、停止 HTTP 服务、等待写入，最后交给安装器退出并安装。异步安装错误恢复正常退出处理，服务保持停止。
- 下载进度监听在结束／失败后清理；页面离开时清理 IPC 订阅。事件和快照用 revision 防止初始读取覆盖新进度。
- 更新提示继续使用简中／英文资源。演示通知明确标注模拟，不伪装成真实下载。

## 本次验证范围

状态机和演示后端单元测试、设置页桌面演示及既有 HTTP 回归、本机生产构建和 macOS 打包。真实 GitHub 检查、远端资产下载、签名验证、跨版本安装及 Windows/Linux 尚未验证，需在正式仓库和签名就绪后验收。
