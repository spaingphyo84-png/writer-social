import { before, after, test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

process.env.WRITERS_REALM_DB = ':memory:'

const { default: app } = await import('../src/app.js')
const { uploadsDir } = await import('../src/upload.js')

let server
let base

before(async () => {
  server = await new Promise((resolve) => {
    const instance = app.listen(0, () => resolve(instance))
  })
  base = `http://127.0.0.1:${server.address().port}`
})

after(() => {
  server.close()
})

async function api(pathname, options = {}) {
  const response = await fetch(`${base}${pathname}`, options)
  const data = await response.json()
  return { status: response.status, data }
}

function auth(token, extra = {}) {
  return { ...extra, headers: { Authorization: `Bearer ${token}`, ...(extra.headers || {}) } }
}

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
  'base64',
)

test('health check responds', async () => {
  const { status, data } = await api('/api/health')
  assert.equal(status, 200)
  assert.equal(data.status, 'ok')
})

test('CORS allows Capacitor, local web and OnRender origins', async () => {
  const allowed = [
    'capacitor://localhost',
    'http://localhost',
    'https://localhost',
    'http://localhost:5173',
    'https://writer-social.onrender.com',
  ]
  for (const origin of allowed) {
    const response = await fetch(`${base}/api/health`, { headers: { Origin: origin } })
    assert.equal(response.headers.get('access-control-allow-origin'), origin)
  }
  const blocked = await fetch(`${base}/api/health`, { headers: { Origin: 'https://evil.example.com' } })
  assert.equal(blocked.headers.get('access-control-allow-origin'), null)
})

test('seed data includes writers, poems and short stories', async () => {
  const { data } = await api('/api/posts?limit=100')
  assert.ok(data.posts.length >= 7)
  assert.ok(data.posts.some((post) => post.category === 'poem'))
  assert.ok(data.posts.some((post) => post.category === 'story'))
  assert.ok(data.posts.every((post) => post.author.penName))
  const writers = await api('/api/users/featured')
  assert.ok(writers.data.writers.length >= 2)
})

test('registration, login and profile update work', async () => {
  const form = new FormData()
  form.set('authorName', 'Test Author')
  form.set('penName', 'Test Pen')
  form.set('email', 'test@example.com')
  form.set('password', 'secret123')
  form.set('bio', 'Hello')
  const registered = await api('/api/auth/register', { method: 'POST', body: form })
  assert.equal(registered.status, 201)
  assert.equal(registered.data.user.penName, 'Test Pen')
  const token = registered.data.token

  const loggedIn = await api('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'test@example.com', password: 'secret123' }),
  })
  assert.equal(loggedIn.status, 200)
  assert.equal(loggedIn.data.user.id, registered.data.user.id)

  const updated = await api('/api/users/me', auth(token, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ authorName: 'Renamed', penName: 'New Pen', bio: 'Updated' }),
  }))
  assert.equal(updated.status, 200)
  assert.equal(updated.data.user.penName, 'New Pen')
})

test('video uploads are blocked in English and Myanmar', async () => {
  const token = (await api('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'kabya-moe@writersrealm.local', password: 'writer123' }),
  })).data.token

  const video = new FormData()
  video.set('category', 'poem')
  video.set('title', 'Nope')
  video.set('body', 'No videos allowed')
  video.set('image', new Blob([Buffer.from('fake video')], { type: 'video/mp4' }), 'clip.mp4')
  const en = await api('/api/posts', auth(token, { method: 'POST', body: video }))
  assert.equal(en.status, 400)
  assert.match(en.data.error, /Videos are not allowed/)

  const my = await api('/api/posts', {
    method: 'POST',
    headers: { 'Accept-Language': 'my', Authorization: `Bearer ${token}` },
    body: video,
  })
  assert.equal(my.status, 400)
  assert.match(my.data.error, /ဗီဒီယို/)
})

test('image post, reactions, comments and share flows work', async () => {
  const login = await api('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'kabya-moe@writersrealm.local', password: 'writer123' }),
  })
  const token = login.data.token

  const form = new FormData()
  form.set('category', 'poem')
  form.set('title', 'ပုံနဲ့ ကဗျာ')
  form.set('body', 'ပုံလေးနဲ့ စာကြောင်းလေး')
  form.set('image', new Blob([PNG], { type: 'image/png' }), 'test.png')
  const created = await api('/api/posts', auth(token, { method: 'POST', body: form }))
  assert.equal(created.status, 201)
  const post = created.data.post
  assert.equal(post.category, 'poem')
  assert.ok(post.imageUrl?.startsWith('/uploads/'))

  const loved = await api(`/api/posts/${post.id}/react`, auth(token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'love' }),
  }))
  assert.equal(loved.data.counts.love, 1)
  assert.equal(loved.data.counts.viewerReaction, 'love')

  const switched = await api(`/api/posts/${post.id}/react`, auth(token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'haha' }),
  }))
  assert.equal(switched.data.counts.love, 0)
  assert.equal(switched.data.counts.haha, 1)

  const toggled = await api(`/api/posts/${post.id}/react`, auth(token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'haha' }),
  }))
  assert.equal(toggled.data.counts.haha, 0)

  const commented = await api(`/api/posts/${post.id}/comments`, auth(token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ body: 'ကဗျာလေး ကြိုက်တယ်' }),
  }))
  assert.equal(commented.status, 201)
  const comments = await api(`/api/posts/${post.id}/comments`)
  assert.equal(comments.data.comments.length, 1)

  const linkShare = await api(`/api/posts/${post.id}/share`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind: 'link' }),
  })
  assert.equal(linkShare.data.shareCount, 1)

  const repost = await api(`/api/posts/${post.id}/share`, auth(token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind: 'repost' }),
  }))
  assert.equal(repost.status, 201)
  assert.equal(repost.data.repost.repostOf, post.id)

  const filtered = await api('/api/posts?category=general')
  assert.ok(filtered.data.posts.every((item) => item.category === 'general'))

  fs.rmSync(path.join(uploadsDir, path.basename(post.imageUrl)), { force: true })
})

test('authors can edit their own posts and remove images', async () => {
  const loginAs = async (email) => (await api('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'writer123' }),
  })).data.token

  const ownerToken = await loginAs('kabya-moe@writersrealm.local')
  const otherToken = await loginAs('kalone-ni@writersrealm.local')

  const form = new FormData()
  form.set('category', 'poem')
  form.set('title', 'Before editing')
  form.set('body', 'Original lines')
  form.set('image', new Blob([PNG], { type: 'image/png' }), 'edit-before.png')
  const created = await api('/api/posts', auth(ownerToken, { method: 'POST', body: form }))
  assert.equal(created.status, 201)
  const post = created.data.post
  const originalImage = post.imageUrl

  const forbidden = await api(`/api/posts/${post.id}`, auth(otherToken, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Stolen' }),
  }))
  assert.equal(forbidden.status, 403)

  const updated = await api(`/api/posts/${post.id}`, auth(ownerToken, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'After editing', content: 'Revised lines', category: 'short_story' }),
  }))
  assert.equal(updated.status, 200)
  assert.equal(updated.data.post.title, 'After editing')
  assert.equal(updated.data.post.body, 'Revised lines')
  assert.equal(updated.data.post.category, 'story')
  assert.equal(updated.data.post.imageUrl, originalImage)

  const invalid = await api(`/api/posts/${post.id}`, auth(ownerToken, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: '   ' }),
  }))
  assert.equal(invalid.status, 400)

  const removal = new FormData()
  removal.set('removeImage', 'true')
  const removed = await api(`/api/posts/${post.id}`, auth(ownerToken, {
    method: 'PATCH',
    body: removal,
  }))
  assert.equal(removed.status, 200)
  assert.equal(removed.data.post.imageUrl, null)
  assert.equal(removed.data.post.title, 'After editing')

  const fetched = await api(`/api/posts/${post.id}`)
  assert.equal(fetched.data.post.category, 'story')
  assert.equal(fetched.data.post.body, 'Revised lines')

  fs.rmSync(path.join(uploadsDir, path.basename(originalImage)), { force: true })
})
