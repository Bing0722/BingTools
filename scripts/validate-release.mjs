import { readFile } from 'node:fs/promises'
const { version } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Release version must be stable semver')
const tag = process.env.GITHUB_REF_TYPE === 'tag' ? process.env.GITHUB_REF_NAME : undefined
if (tag && tag !== `v${version}`) throw new Error(`Tag ${tag} does not match package version ${version}`)
const notes = await readFile(new URL(`../docs/releases/${version}.md`, import.meta.url), 'utf8')
if (!notes.includes(version) || notes.trim().length < 80) throw new Error('Release notes are missing or incomplete')
console.log(`Release ${version}: version and notes validated`)
