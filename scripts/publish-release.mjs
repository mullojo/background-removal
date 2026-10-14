import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { notesFor, parseVersion } from './release.mjs'

export async function publishRelease({ repository, sha, token, version, notes, fetchImpl = fetch, api = 'https://api.github.com' }) {
  parseVersion(version)
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository || '') || !/^[a-f\d]{40}$/.test(sha || '')) throw new Error('A GitHub repository and full commit SHA are required.')
  if (!token) throw new Error('GITHUB_TOKEN is required to publish a release.')
  const tag = `v${version}`
  const endpoint = `${api}/repos/${repository}`
  async function request(route, body) {
    const response = await fetchImpl(`${endpoint}${route}`, {
      method: body ? 'POST' : 'GET',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2026-03-10', 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    if (response.status === 404 && !body) return null
    if (!response.ok) throw new Error(`GitHub release request failed: HTTP ${response.status}.`)
    return response.json()
  }
  const existing = await request(`/releases/tags/${tag}`)
  if (existing) return { created: false, url: existing.html_url }
  const ref = await request(`/git/ref/tags/${tag}`)
  if (ref) {
    let object = ref.object
    for (let i = 0; object.type === 'tag' && i < 8; i++) {
      const annotation = await request(`/git/tags/${object.sha}`)
      if (!annotation) throw new Error('Cannot resolve the existing release tag.')
      object = annotation.object
    }
    if (object.type !== 'commit' || object.sha !== sha) throw new Error(`Existing ${tag} points elsewhere; refusing to move or reuse it.`)
  }
  const release = await request('/releases', { tag_name: tag, target_commitish: sha, name: `Cutout ${tag}`, body: notes, draft: false, prerelease: false, make_latest: 'true' })
  return { created: true, url: release.html_url }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const root = fileURLToPath(new URL('../', import.meta.url))
    const version = fs.readFileSync(path.join(root, 'VERSION'), 'utf8').trim()
    const result = await publishRelease({ repository: process.env.GITHUB_REPOSITORY, sha: process.env.GITHUB_SHA, token: process.env.GITHUB_TOKEN, version, notes: notesFor(root, version), api: process.env.GITHUB_API_URL || 'https://api.github.com' })
    console.log(`${result.created ? 'Published' : 'Already published'}: ${result.url}`)
  } catch (error) { console.error(error.message); process.exitCode = 1 }
}
