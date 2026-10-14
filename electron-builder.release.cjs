/* eslint @typescript-eslint/no-require-imports: "off" -- electron-builder 的 CommonJS 配置入口 */
const { build, version } = require('./package.json')
const release = require('./release.config.json')
const repository = process.env.BINGTOOLS_UPDATE_REPOSITORY ?? release.repository
if (!/^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9_.-]+$/.test(repository)) {
  throw new Error('Set release.config.json repository to owner/repo before building GitHub release assets.')
}
const [owner, repo] = repository.split('/')
const mac = { ...build.mac, target: ['zip', 'dmg'] }
// 发布构建允许 electron-builder 使用环境中的证书；本机预览打包仍保持未签名。
delete mac.identity
module.exports = {
  ...build,
  mac,
  nsis: { oneClick: false, allowToChangeInstallationDirectory: true, deleteAppDataOnUninstall: false },
  releaseInfo: { releaseName: `BingTools ${version}`, releaseNotesFile: `docs/releases/${version}.md` },
  artifactName: '${productName}-${version}-${os}-${arch}.${ext}',
  publish: [{ provider: 'github', owner, repo, releaseType: 'draft' }],
}
