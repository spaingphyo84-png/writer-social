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

async function withCaptcha(form) {
  const challenge = await api('/api/auth/captcha')
  const match = challenge.data.question.match(/(\d+)\s*\+\s*(\d+)/)
  assert.ok(match)
  form.set('captchaId', challenge.data.captchaId)
  form.set('captchaAnswer', String(Number(match[1]) + Number(match[2])))
  form.set('website', '')
  return form
}

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
  const headers = { 'X-Forwarded-For': '203.0.113.10' }
  const form = new FormData()
  form.set('authorName', 'Test Author')
  form.set('penName', 'Test Pen')
  form.set('email', 'test@example.com')
  form.set('password', 'secret123')
  form.set('bio', 'Hello')
  await withCaptcha(form)
  const registered = await api('/api/auth/register', { method: 'POST', headers, body: form })
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
  const headers = { 'X-Forwarded-For': '203.0.113.11' }
  const token = (await api('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ email: 'kabya-moe@writersrealm.local', password: 'writer123' }),
  })).data.token

  const video = new FormData()
  video.set('category', 'poem')
  video.set('title', 'Nope')
  video.set('body', 'No videos allowed')
  video.set('image', new Blob([Buffer.from('fake video')], { type: 'video/mp4' }), 'clip.mp4')
  await withCaptcha(video)
  const en = await api('/api/posts', auth(token, { method: 'POST', headers, body: video }))
  assert.equal(en.status, 400)
  assert.match(en.data.error, /Videos are not allowed/)

  await withCaptcha(video)
  const my = await api('/api/posts', {
    method: 'POST',
    headers: { ...headers, 'Accept-Language': 'my', Authorization: `Bearer ${token}` },
    body: video,
  })
  assert.equal(my.status, 400)
  assert.match(my.data.error, /ဗီဒီယို/)
})

test('image post, reactions, comments and share flows work', async () => {
  const headers = { 'X-Forwarded-For': '203.0.113.12' }
  const login = await api('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ email: 'kabya-moe@writersrealm.local', password: 'writer123' }),
  })
  const token = login.data.token

  const form = new FormData()
  form.set('category', 'poem')
  form.set('title', 'ပုံနဲ့ ကဗျာ')
  form.set('body', 'ပုံလေးနဲ့ စာကြောင်းလေး')
  form.set('image', new Blob([PNG], { type: 'image/png' }), 'test.png')
  await withCaptcha(form)
  const created = await api('/api/posts', auth(token, { method: 'POST', headers, body: form }))
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
  const headers = { 'X-Forwarded-For': '203.0.113.13' }
  const loginAs = async (email) => (await api('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ email, password: 'writer123' }),
  })).data.token

  const ownerToken = await loginAs('kabya-moe@writersrealm.local')
  const otherToken = await loginAs('kalone-ni@writersrealm.local')

  const form = new FormData()
  form.set('category', 'poem')
  form.set('title', 'Before editing')
  form.set('body', 'Original lines')
  form.set('image', new Blob([PNG], { type: 'image/png' }), 'edit-before.png')
  await withCaptcha(form)
  const created = await api('/api/posts', auth(ownerToken, { method: 'POST', headers, body: form }))
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

function registrationForm(email) {
  const form = new FormData()
  form.set('authorName', 'Rate Limit')
  form.set('penName', `Writer ${email}`)
  form.set('email', email)
  form.set('password', 'secret123')
  return form
}

function postForm(title) {
  const form = new FormData()
  form.set('category', 'general')
  form.set('title', title)
  form.set('body', 'A short test post.')
  return form
}

async function loginAs(email, password = 'writer123', headers = {}) {
  const result = await api('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ email, password }),
  })
  assert.equal(result.status, 200)
  return result.data
}

test('registration is limited to two accounts per hour per IP', async () => {
  const headers = { 'X-Forwarded-For': '203.0.113.50' }
  for (let index = 1; index <= 2; index += 1) {
    const response = await api('/api/auth/register', {
      method: 'POST', headers, body: await withCaptcha(registrationForm(`limited-${index}@example.com`)),
    })
    assert.equal(response.status, 201)
  }

  const blocked = await api('/api/auth/register', {
    method: 'POST', headers, body: await withCaptcha(registrationForm('limited-3@example.com')),
  })
  assert.equal(blocked.status, 429)
  assert.match(blocked.data.error, /Too many requests/)

  const otherHeaders = { 'X-Forwarded-For': '203.0.113.51' }
  const anotherIp = await api('/api/auth/register', {
    method: 'POST',
    headers: otherHeaders,
    body: await withCaptcha(registrationForm('limited-other@example.com')),
  })
  assert.equal(anotherIp.status, 201)
})

test('post creation is limited to three posts per fifteen minutes per user/IP', async () => {
  const headers = { 'X-Forwarded-For': '203.0.113.60' }
  const { token } = await loginAs('kalone-ni@writersrealm.local', 'writer123', headers)
  for (let index = 1; index <= 3; index += 1) {
    const response = await api('/api/posts', auth(token, {
      method: 'POST', headers, body: await withCaptcha(postForm(`Rate limited post ${index}`)),
    }))
    assert.equal(response.status, 201)
  }

  const blocked = await api('/api/posts', auth(token, {
    method: 'POST', headers, body: await withCaptcha(postForm('Rate limited post 4')),
  }))
  assert.equal(blocked.status, 429)
  assert.match(blocked.data.error, /Too many requests/)
})

test('admins can delete any post and remove spam users', async () => {
  const headers = { 'X-Forwarded-For': '203.0.113.70' }
  const admin = await loginAs('kabya-moe@writersrealm.local', 'writer123', headers)
  const member = await loginAs('kalone-ni@writersrealm.local', 'writer123', headers)
  assert.equal(admin.user.isAdmin, true)
  assert.equal(member.user.isAdmin, false)

  const memberPost = await api('/api/posts', auth(member.token, {
    method: 'POST', headers, body: await withCaptcha(postForm('Spam post from member')),
  }))
  assert.equal(memberPost.status, 201)
  const adminPost = await api('/api/posts', auth(admin.token, {
    method: 'POST', headers, body: await withCaptcha(postForm('Post from admin')),
  }))
  assert.equal(adminPost.status, 201)

  const denied = await api(`/api/posts/${adminPost.data.post.id}`, auth(member.token, {
    method: 'DELETE', headers,
  }))
  assert.equal(denied.status, 403)

  const removedPost = await api(`/api/posts/${memberPost.data.post.id}`, auth(admin.token, {
    method: 'DELETE', headers,
  }))
  assert.equal(removedPost.status, 200)
  assert.equal((await api(`/api/posts/${memberPost.data.post.id}`)).status, 404)

  const spam = await api('/api/auth/register', {
    method: 'POST', headers, body: await withCaptcha(registrationForm('spam-bot@example.com')),
  })
  assert.equal(spam.status, 201)
  assert.equal(spam.data.user.isAdmin, false)

  const deniedUserDelete = await api(`/api/users/${spam.data.user.id}`, auth(member.token, {
    method: 'DELETE', headers,
  }))
  assert.equal(deniedUserDelete.status, 403)

  const removedUser = await api(`/api/users/${spam.data.user.id}`, auth(admin.token, {
    method: 'DELETE', headers,
  }))
  assert.equal(removedUser.status, 200)
  assert.equal((await api('/api/auth/me', auth(spam.data.token, { headers }))).status, 401)
})

test('API responses never expose sensitive user fields', async () => {
  const login = await loginAs('kabya-moe@writersrealm.local')
  for (const field of ['email', 'password', 'password_hash', 'refresh_token']) {
    assert.equal(login.user[field], undefined)
  }

  const payload = JSON.parse(Buffer.from(login.token.split('.')[1], 'base64url').toString())
  assert.equal(payload.email, undefined)
  assert.equal(payload.exp - payload.iat, 7 * 24 * 60 * 60)

  const endpoints = [
    ['/api/auth/me', auth(login.token)],
    ['/api/posts?limit=5'],
    ['/api/posts/1'],
    ['/api/users/featured'],
    [`/api/users/${login.user.id}`],
  ]
  for (const [path, options] of endpoints) {
    const response = await api(path, options)
    assert.equal(response.status, 200)
    const json = JSON.stringify(response.data)
    for (const field of ['email', 'password', 'password_hash', 'refresh_token']) {
      assert.equal(json.includes(`"${field}"`), false, `${path} leaked ${field}`)
    }
  }
})

test('post and comment content is sanitized on the server', async () => {
  const headers = { 'X-Forwarded-For': '203.0.113.80' }
  const { token } = await loginAs('kabya-moe@writersrealm.local', 'writer123', headers)
  const form = new FormData()
  form.set('category', 'general')
  form.set('title', '<script>alert(1)</script>Safe title')
  form.set('body', '<img src=x onerror="stealToken()">Hello &lt;b&gt;world&lt;/b&gt;')
  await withCaptcha(form)
  const created = await api('/api/posts', auth(token, { method: 'POST', headers, body: form }))
  assert.equal(created.status, 201)
  assert.equal(created.data.post.title, 'alert(1)Safe title')
  assert.equal(created.data.post.body, 'Hello world')
  assert.doesNotMatch(JSON.stringify(created.data.post), /<script|onerror|<img/)

  const comment = await api(`/api/posts/${created.data.post.id}/comments`, auth(token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ body: '<iframe src=evil></iframe>Nice writing' }),
  }))
  assert.equal(comment.status, 201)
  assert.equal(comment.data.comment.body, 'Nice writing')
})

test('captcha, honeypot and spam patterns reject bot submissions', async () => {
  const headers = { 'X-Forwarded-For': '203.0.113.90' }
  const { token } = await loginAs('kabya-moe@writersrealm.local', 'writer123', headers)

  const missing = await api('/api/posts', auth(token, {
    method: 'POST', headers, body: postForm('No captcha'),
  }))
  assert.equal(missing.status, 400)
  assert.match(missing.data.error, /verification answer/i)

  const trappedForm = await withCaptcha(postForm('Honeypot'))
  trappedForm.set('website', 'https://spam.example')
  const trapped = await api('/api/posts', auth(token, {
    method: 'POST', headers, body: trappedForm,
  }))
  assert.equal(trapped.status, 400)
  assert.match(trapped.data.error, /spam/i)

  const spamForm = await withCaptcha(postForm('Just testing the API'))
  const spam = await api('/api/posts', auth(token, {
    method: 'POST', headers, body: spamForm,
  }))
  assert.equal(spam.status, 400)
  assert.match(spam.data.error, /spam/i)

  const botForm = registrationForm('gibberish-bot@example.com')
  botForm.set('authorName', 'xkjqzwv')
  const rejected = await api('/api/auth/register', {
    method: 'POST', headers, body: await withCaptcha(botForm),
  })
  assert.equal(rejected.status, 400)
  assert.match(rejected.data.error, /spam/i)
})

test('admin can clean legacy spam posts and accounts', async () => {
  const { db } = await import('../src/db.js')
  const headers = { 'X-Forwarded-For': '203.0.113.91' }
  const admin = await loginAs('kabya-moe@writersrealm.local', 'writer123', headers)
  const memberHeaders = { 'X-Forwarded-For': '203.0.113.92' }
  const member = await loginAs('kalone-ni@writersrealm.local', 'writer123', memberHeaders)

  const spamUser = await db.prepare(`
    INSERT INTO users (email, password_hash, author_name, pen_name, bio)
    VALUES (?, ?, ?, ?, ?)
  `).run('legacy-spam@example.com', 'hash', 'xkjqzwv', 'qwertyuiop', '')
  const spamPost = await db.prepare(`
    INSERT INTO posts (user_id, category, title, body) VALUES (?, ?, ?, ?)
  `).run(spamUser.lastInsertRowid, 'general', 'Lorem ipsum', 'Lorem ipsum dolor sit amet')
  const cleanPost = await db.prepare(`
    INSERT INTO posts (user_id, category, title, body) VALUES (?, ?, ?, ?)
  `).run(admin.user.id, 'general', 'Keep me', 'A real post')

  const denied = await api('/api/admin/spam', auth(member.token, {
    method: 'DELETE', headers: memberHeaders,
  }))
  assert.equal(denied.status, 403)

  const cleaned = await api('/api/admin/spam', auth(admin.token, {
    method: 'DELETE', headers,
  }))
  assert.equal(cleaned.status, 200)
  assert.equal(cleaned.data.deletedPosts, 1)
  assert.ok(cleaned.data.deletedUsers >= 1)
  assert.equal((await api(`/api/posts/${spamPost.lastInsertRowid}`)).status, 404)
  assert.equal((await api(`/api/posts/${cleanPost.lastInsertRowid}`)).status, 200)
})

test('helmet security headers are present without breaking CORS', async () => {
  const response = await fetch(`${base}/api/health`)
  assert.match(response.headers.get('content-security-policy') || '', /default-src 'self'/)
  assert.equal(response.headers.get('x-frame-options'), 'SAMEORIGIN')
  assert.equal(response.headers.get('cross-origin-resource-policy'), 'cross-origin')

  const corsResponse = await fetch(`${base}/api/health`, { headers: { Origin: 'http://localhost:5173' } })
  assert.equal(corsResponse.headers.get('access-control-allow-origin'), 'http://localhost:5173')
})

test('captcha tokens are signed and survive a server restart', async () => {
  const { issueCaptcha } = await import('../src/captcha.js')
  const challenge = issueCaptcha()
  const match = challenge.question.match(/(\d+)\s*\+\s*(\d+)/)
  assert.ok(match)
  const answer = String(Number(match[1]) + Number(match[2]))

  const { verifyCaptcha } = await import('../src/captcha.js?simulated-restart')
  assert.equal(verifyCaptcha(challenge.captchaId, answer), true)
  assert.equal(verifyCaptcha(challenge.captchaId, '999'), false)
  assert.equal(verifyCaptcha(`${challenge.captchaId}tampered`, answer), false)
  assert.equal(verifyCaptcha(challenge.captchaId.split('.')[0], answer), false)

  const headers = { 'X-Forwarded-For': '203.0.113.95' }
  const { token } = await loginAs('kabya-moe@writersrealm.local', 'writer123', headers)
  const form = postForm('Tampered captcha')
  form.set('captchaId', `${challenge.captchaId}tampered`)
  form.set('captchaAnswer', answer)
  const result = await api('/api/posts', auth(token, { method: 'POST', headers, body: form }))
  assert.equal(result.status, 400)
  assert.match(result.data.error, /verification answer/i)
})

test('login is limited to ten attempts per fifteen minutes per IP', async () => {
  const headers = { 'Content-Type': 'application/json', 'X-Forwarded-For': '203.0.113.100' }
  const body = JSON.stringify({ email: 'nobody@example.com', password: 'wrong-password' })
  for (let index = 0; index < 10; index += 1) {
    const response = await api('/api/auth/login', { method: 'POST', headers, body })
    assert.equal(response.status, 401)
  }
  const blocked = await api('/api/auth/login', { method: 'POST', headers, body })
  assert.equal(blocked.status, 429)
  assert.match(blocked.data.error, /Too many requests/)
})

test('oversized JSON bodies are rejected', async () => {
  const headers = { 'Content-Type': 'application/json', 'X-Forwarded-For': '203.0.113.101' }
  const body = JSON.stringify({ email: 'x'.repeat(60 * 1024), password: 'secret123' })
  const response = await api('/api/auth/login', { method: 'POST', headers, body })
  assert.equal(response.status, 413)
})

test('all common spam text patterns are rejected', async () => {
  const samples = [
    'Lorem ipsum dolor sit amet',
    'This is randomly generated content',
    'Just testing the API again',
  ]
  for (const [index, sample] of samples.entries()) {
    const headers = { 'X-Forwarded-For': `203.0.113.${102 + index}` }
    const { token } = await loginAs('kabya-moe@writersrealm.local', 'writer123', headers)
    const response = await api('/api/posts', auth(token, {
      method: 'POST', headers, body: await withCaptcha(postForm(sample)),
    }))
    assert.equal(response.status, 400)
    assert.match(response.data.error, /spam/i)
  }
})

test('uploads reject oversized and fake images', async () => {
  const headers = { 'X-Forwarded-For': '203.0.113.106' }
  const { token } = await loginAs('kabya-moe@writersrealm.local', 'writer123', headers)

  const oversized = await withCaptcha(postForm('Oversized image'))
  oversized.set('image', new Blob([Buffer.alloc(2 * 1024 * 1024 + 1)], { type: 'image/png' }), 'big.png')
  const tooLarge = await api('/api/posts', auth(token, { method: 'POST', headers, body: oversized }))
  assert.equal(tooLarge.status, 400)
  assert.match(tooLarge.data.error, /too large/i)

  const otherHeaders = { 'X-Forwarded-For': '203.0.113.107' }
  const fake = await withCaptcha(postForm('Fake image'))
  fake.set('image', new Blob([Buffer.from('definitely not a picture')], { type: 'image/png' }), 'fake.png')
  const rejected = await api('/api/posts', auth(token, { method: 'POST', headers: otherHeaders, body: fake }))
  assert.equal(rejected.status, 400)
  assert.match(rejected.data.error, /JPG, PNG, and WEBP/i)
})

test('admins can pause and resume registrations', async () => {
  const adminHeaders = { 'X-Forwarded-For': '203.0.113.110' }
  const memberHeaders = { 'X-Forwarded-For': '203.0.113.111' }
  const admin = await loginAs('kabya-moe@writersrealm.local', 'writer123', adminHeaders)
  const member = await loginAs('kalone-ni@writersrealm.local', 'writer123', memberHeaders)
  const lockdownRequest = (token, registrationOpen, headers) => auth(token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ registrationOpen }),
  })

  const denied = await api('/api/admin/lockdown', lockdownRequest(member.token, false, memberHeaders))
  assert.equal(denied.status, 403)

  const paused = await api('/api/admin/lockdown', lockdownRequest(admin.token, false, adminHeaders))
  assert.equal(paused.status, 200)
  assert.equal(paused.data.registrationOpen, false)
  assert.equal((await api('/api/auth/status')).data.registrationOpen, false)

  const blocked = await api('/api/auth/register', {
    method: 'POST',
    headers: { 'X-Forwarded-For': '203.0.113.112' },
    body: await withCaptcha(registrationForm('locked-out@example.com')),
  })
  assert.equal(blocked.status, 403)
  assert.match(blocked.data.error, /paused/i)

  const resumed = await api('/api/admin/lockdown', lockdownRequest(admin.token, true, adminHeaders))
  assert.equal(resumed.status, 200)
  assert.equal(resumed.data.registrationOpen, true)
  assert.equal((await api('/api/auth/status')).data.registrationOpen, true)
})
