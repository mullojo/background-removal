const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const root = path.resolve(__dirname, '..')
const release = import('../scripts/release.mjs')
const publisher = import('../scripts/publish-release.mjs')

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cutout-release-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  fs.mkdirSync(path.join(dir, 'main'))
  fs.writeFileSync(path.join(dir, 'VERSION'), '1.2.3\n')
  fs.writeFileSync(path.join(dir, 'main/version.js'), "// Generated from VERSION by scripts/release.mjs. Commit both files together.\nexport const APP_VERSION = '1.2.3'\n")
  fs.writeFileSync(path.join(dir, 'main/service-worker.js'), "const RELEASE = '1.2.3'\n")
  fs.writeFileSync(path.join(dir, 'main/app.js'), '// app\n')
  fs.writeFileSync(path.join(dir, 'CHANGELOG.md'), '# Changelog\n\n## 1.2.3 — 2026-10-13\n\n- Existing release.\n')
  return dir
}

test('release metadata in the real repository matches VERSION', async () => {
  assert.equal((await release).checkRelease(root).version, fs.readFileSync(path.join(root, 'VERSION'), 'utf8').trim())
})

test('semantic bumps synchronize app/cache versions and require completed release notes', async t => {
  const { bumpRelease, checkRelease, compareVersions, parseVersion } = await release
  const dir = fixture(t)
  assert.equal(bumpRelease(dir, 'patch'), '1.2.4')
  assert.match(fs.readFileSync(path.join(dir, 'main/version.js'), 'utf8'), /'1.2.4'/)
  assert.match(fs.readFileSync(path.join(dir, 'main/service-worker.js'), 'utf8'), /'1.2.4'/)
  assert.throws(() => checkRelease(dir), /Complete the release notes/)
  const changelog = path.join(dir, 'CHANGELOG.md')
  fs.writeFileSync(changelog, fs.readFileSync(changelog, 'utf8').replace('TODO: Describe this release.', 'A completed release note.'))
  assert.equal(checkRelease(dir).version, '1.2.4')
  assert.equal(bumpRelease(dir, 'minor'), '1.3.0')
  assert.equal(bumpRelease(dir, 'major'), '2.0.0')
  assert.throws(() => bumpRelease(dir, '1.9.0'), /increase/)
  assert.throws(() => parseVersion('01.2.3'), /MAJOR/)
  assert.throws(() => parseVersion('v1.2.3'), /MAJOR/)
  assert.equal(compareVersions('1.10.0', '1.9.9'), 1)
})

test('CI rejects app changes without a version bump but permits documentation changes', async t => {
  const { checkRelease, bumpRelease } = await release
  const dir = fixture(t)
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  git('init', '-q')
  git('config', 'user.name', 'Release test')
  git('config', 'user.email', 'release-test@example.invalid')
  const commit = () => { git('add', '.'); git('commit', '-qm', 'Fixture change') }
  commit()
  const base = git('rev-parse', 'HEAD')
  fs.writeFileSync(path.join(dir, 'README.md'), 'Documentation only\n')
  commit()
  assert.equal(checkRelease(dir, base).changed, false)
  fs.appendFileSync(path.join(dir, 'main/app.js'), '// changed\n')
  commit()
  assert.throws(() => checkRelease(dir, base), /without a version bump/)
  bumpRelease(dir, 'patch')
  const changelog = path.join(dir, 'CHANGELOG.md')
  fs.writeFileSync(changelog, fs.readFileSync(changelog, 'utf8').replace('TODO: Describe this release.', 'Updated app.'))
  commit()
  assert.equal(checkRelease(dir, base).changed, true)
})

test('GitHub publishing creates the version tag at the tested commit and uses changelog notes', async () => {
  const { publishRelease } = await publisher
  const sha = 'a'.repeat(40), calls = []
  const result = await publishRelease({ repository: 'example/cutout', sha, token: 'fixture-token', version: '1.2.3', notes: '- Photo reset fixes.', fetchImpl: async (url, options) => {
    calls.push({ url, options })
    if (options.method === 'GET') return { status: 404, ok: false }
    return { status: 201, ok: true, json: async () => ({ html_url: 'https://github.com/example/cutout/releases/tag/v1.2.3' }) }
  } })
  assert.equal(result.created, true)
  const body = JSON.parse(calls.at(-1).options.body)
  assert.equal(body.tag_name, 'v1.2.3')
  assert.equal(body.target_commitish, sha)
  assert.equal(body.body, '- Photo reset fixes.')
  assert.equal(body.draft, false)
})

test('publishing is idempotent and rejects a conflicting existing tag', async () => {
  const { publishRelease } = await publisher
  const input = { repository: 'example/cutout', sha: 'a'.repeat(40), token: 'fixture-token', version: '1.2.3', notes: 'Notes' }
  let calls = 0
  const existing = await publishRelease({ ...input, fetchImpl: async () => { calls++; return { ok: true, status: 200, json: async () => ({ html_url: 'existing' }) } } })
  assert.equal(existing.created, false)
  assert.equal(calls, 1)
  await assert.rejects(publishRelease({ ...input, fetchImpl: async url => {
    if (url.includes('/releases/tags/')) return { ok: false, status: 404 }
    return { ok: true, status: 200, json: async () => ({ object: { type: 'commit', sha: 'b'.repeat(40) } }) }
  } }), /points elsewhere/)
  await assert.rejects(publishRelease({ ...input, fetchImpl: async () => ({ ok: false, status: 403 }) }), /HTTP 403/)
})
