import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const semver = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/
export function parseVersion(value) {
  if (!semver.test(value)) throw new Error('Version must be MAJOR.MINOR.PATCH, without a v prefix.')
  const numbers = value.split('.').map(Number)
  if (!numbers.every(Number.isSafeInteger)) throw new Error('Version component is too large.')
  return numbers
}
export function compareVersions(a, b) {
  const left = parseVersion(a), right = parseVersion(b)
  for (let i = 0; i < 3; i++) if (left[i] !== right[i]) return Math.sign(left[i] - right[i])
  return 0
}
const versionSource = version => `// Generated from VERSION by scripts/release.mjs. Commit both files together.\nexport const APP_VERSION = '${version}'\n`
export function notesFor(project, version) {
  const changelog = fs.readFileSync(path.join(project, 'CHANGELOG.md'), 'utf8')
  const sections = changelog.split(/^## /m).slice(1)
  const section = sections.find(text => text.split('\n')[0].split(/\s/)[0] === version)
  if (!section) throw new Error(`CHANGELOG.md needs a section for ${version}.`)
  const notes = section.slice(section.indexOf('\n') + 1).trim()
  if (!notes || notes.includes('TODO:')) throw new Error(`Complete the release notes for ${version} in CHANGELOG.md.`)
  return notes
}
export function bumpRelease(project, increment) {
  const version = fs.readFileSync(path.join(project, 'VERSION'), 'utf8').trim()
  const parts = parseVersion(version)
  let next
  if (['major', 'minor', 'patch'].includes(increment)) {
    const index = ['major', 'minor', 'patch'].indexOf(increment)
    parts[index]++
    for (let i = index + 1; i < 3; i++) parts[i] = 0
    next = parts.join('.')
  } else { parseVersion(increment); next = increment }
  if (compareVersions(next, version) <= 0) throw new Error('A release version must increase.')
  const workerPath = path.join(project, 'main/service-worker.js')
  const worker = fs.readFileSync(workerPath, 'utf8')
  if (!/^const RELEASE = '[^']+'$/m.test(worker)) throw new Error('Missing service worker RELEASE constant.')
  const changelogPath = path.join(project, 'CHANGELOG.md')
  const changelog = fs.readFileSync(changelogPath, 'utf8')
  const date = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  const heading = `## ${next} — ${date}\n\n- TODO: Describe this release.\n\n`
  const firstSection = changelog.search(/^## /m)
  if (firstSection < 0) throw new Error('CHANGELOG.md needs an existing release section.')
  fs.writeFileSync(path.join(project, 'VERSION'), `${next}\n`)
  fs.writeFileSync(path.join(project, 'main/version.js'), versionSource(next))
  fs.writeFileSync(workerPath, worker.replace(/^const RELEASE = '[^']+'$/m, `const RELEASE = '${next}'`))
  fs.writeFileSync(changelogPath, changelog.slice(0, firstSection) + heading + changelog.slice(firstSection))
  return next
}
export function checkRelease(project, base) {
  const version = fs.readFileSync(path.join(project, 'VERSION'), 'utf8').trim()
  parseVersion(version)
  if (fs.readFileSync(path.join(project, 'main/version.js'), 'utf8') !== versionSource(version)) throw new Error('main/version.js does not match VERSION. Use the release script.')
  const worker = fs.readFileSync(path.join(project, 'main/service-worker.js'), 'utf8')
  if (!worker.includes(`const RELEASE = '${version}'`)) throw new Error('Service worker release does not match VERSION.')
  notesFor(project, version)
  let changed = false
  if (base && !/^0+$/.test(base)) {
    if (!/^[a-f\d]{40}$/.test(base)) throw new Error('Release check base must be a full commit SHA.')
    let previous
    try { previous = execFileSync('git', ['show', `${base}:VERSION`], { cwd: project, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim() }
    catch {
      // Confirm the base exists; only the first migration may lack VERSION.
      execFileSync('git', ['cat-file', '-e', `${base}^{commit}`], { cwd: project, stdio: 'ignore' })
    }
    changed = !previous || version !== previous
    if (previous && compareVersions(version, previous) < 0) throw new Error('VERSION must not decrease.')
    const files = execFileSync('git', ['diff', '--name-only', base, 'HEAD', '--', 'main/'], { cwd: project, encoding: 'utf8' }).trim().split('\n')
    const appChanged = files.some(file => file && !file.endsWith('.md') && !file.endsWith('-LICENSE.txt'))
    if (previous && appChanged && !changed) throw new Error('App files changed without a version bump. Run node scripts/release.mjs patch (or minor/major).')
  } else changed = true
  return { version, changed }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const command = process.argv[2]
    if (command === '--check') {
      const result = checkRelease(root, process.argv[3])
      if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `version=${result.version}\nrelease_needed=${result.changed}\n`)
      console.log(`Release v${result.version} is consistent.`)
    } else if (command) console.log(`Prepared v${bumpRelease(root, command)}. Complete its CHANGELOG.md notes, then commit and push.`)
    else throw new Error('Usage: node scripts/release.mjs patch|minor|major|X.Y.Z|--check [BASE_SHA]')
  } catch (error) { console.error(error.message); process.exitCode = 1 }
}
