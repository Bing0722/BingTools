# GitHub Releases 更新与发布

## 当前配置

公开仓库：[Bing0722/BingTools](https://github.com/Bing0722/BingTools)。更新源固定为该仓库的 GitHub Releases，客户端不包含 Token。`release.config.json` 指定仓库，开发态只显示更新源；安装后的应用可手动检查稳定版本。

版本由 `package.json` 唯一管理，侧栏、设置和更新页使用构建时注入的同一版本。当前版本说明位于 `docs/releases/0.5.0.md`，会嵌入界面、更新元数据及 GitHub Release。远端更新说明始终按文本显示，不执行 HTML。

## 自动构建

`.github/workflows/release.yml`：

- 推送 main、提交 PR 或手动运行：分别在 Windows 2022 x64 和 macOS 14 ARM64 上在线安装依赖、类型检查、Lint、测试并打包，产物保存为 Actions artifacts。
- 推送 `v*` 标签：核对标签与 package.json 版本一致，核对对应更新说明存在；两个平台都成功后才创建正式 GitHub Release，附带全部安装包、blockmap 和更新元数据。
- 构建任务只有 contents:read；发布任务使用 GitHub 提供的短期 token 和 contents:write，不需要在仓库保存个人 Token。

| 平台 | 产物 |
| --- | --- |
| Windows x64 | NSIS `.exe`、`.exe.blockmap`、`latest.yml` |
| macOS Apple Silicon | `.dmg`、`.zip`、blockmap、`latest-mac.yml` |

当前没有 Windows ARM64、macOS Intel 或 Linux 发布构建。不要将本机 macOS Electron 分发目录用于 Windows 交叉打包；工作流在各自原生 runner 安装并使用对应运行时。

## 下一次发布

1. 每轮功能改动在本地提交前主动升级 package.json：小改动补丁号、大功能次版本号、不兼容重大变更主版本号，不等待发布时才补版本。例如下一次小改动为 0.5.1。
2. 新增 `docs/releases/0.5.1.md`，写明新增、修复和安装注意事项；更新 CHANGELOG.md。
3. 同步 README 当前版本和本文说明链接，执行检查、生产构建并本地提交；获得推送授权后再推送 main。
4. 获得发布授权后创建并推送 `v0.5.1` 标签。Actions 成功后自动发布正式 Release。

只想本地生成包时运行 `pnpm package:release`，此命令使用 `--publish never`，不会上传。仅工作流标签触发的发布任务会上传并发布。

## 更新行为与限制

- 不自动检查、不自动下载、不在退出时自动安装；用户在设置中检查 → 下载 → 确认重启安装。
- Windows 使用 electron-updater + NSIS 下载校验并安装。当前包未签名，系统可能提示未知发布者；发布后仍需真实 Windows 升级安装验收。
- macOS 当前没有 Developer ID 签名和公证，因此禁用自动下载／原位安装，提供固定 GitHub 下载页手动更新；可以检查新版本及查看说明。要启用 macOS 自动安装，后续须在受控 CI 配置 CSC_LINK 等签名凭据，移除禁用证书自动发现的环境约束并完成公证及双版本验收。
- 下载校验由 electron-updater 处理，不放宽签名检查。安装前停止 HTTP 服务、保存配置、等待写入；安装错误恢复正常退出处理。
- 旧本地演示包需要手动安装 0.3.0 作为 GitHub 更新基础版本。配置和客户数据保存在 userData，NSIS 卸载不主动删除这些数据。
- 私有仓库鉴权未实现。用户已明确选择公开源码及安装包，本次授权包含仓库创建、代码推送和 Release 发布。

macOS 自动更新签名要求参见 [electron-builder v26](https://www.electron.build/v26/docs/features/auto-update/)。构建与实际验证结果见 [验证记录](verification.md)。
