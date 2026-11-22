import { before, after, test } from 'node:test'
import assert from 'node:assert/strict'

const ADMIN_EMAIL = 'social-admin@writersrealm.local'
const ADMIN_PASSWORD = 'social-admin-password-123'

process.env.WRITERS_REALM_DB = ':memory:'
process.env.ADMIN_EMAILS = ADMIN_EMAIL

const { default: app } = await import('../src/app.js')
const { db } = await import('../src/db.js')

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
  'base64',
)

let server
let base
const tokens = {}
const users = {}

before(async () => {
  server = await new Promise((resolve) => {
    const instance = app.listen(0, () => resolve(instance))
  })
  base = `http://127.0.0.1:${server.address().port}`

  for (const [name, email, ip] of [
    ['alice', 'alice-social@example.com', '198.51.100.21'],
    ['bob', 'bob-social@example.com', '198.51.100.22'],
    ['admin', ADMIN_EMAIL, '198.51.100.23'],
  ]) {
    const form = new FormData()
    form.set('authorName', `${name} Author`)
    form.set('penName', `${name} Pen`)
    form.set('email', email)
    form.set('password', name === 'admin' ? ADMIN_PASSWORD : 'secret123')
    form.set('bio', 'Social feature tests')
    await withCaptcha(form)
    const response = await api('/api/auth/register', {
      method: 'POST',
      headers: { 'X-Forwarded-For': ip },
      body: form,
    })
    assert.equal(response.status, 201, JSON.stringify(response.data))
    tokens[name] = response.data.token
    users[name] = response.data.user
  }
  assert.equal(users.admin.isAdmin, true)
})

after(() => server.close())

async function api(pathname, options = {}) {
  const response = await fetch(`${base}${pathname}`, options)
  const data = await response.json()
  return { status: response.status, data, headers: response.headers }
}

function auth(token, extra = {}) {
  return {
    ...extra,
    headers: { Authorization: `Bearer ${token}`, ...(extra.headers || {}) },
  }
}

async function withCaptcha(form) {
  const challenge = await api('/api/auth/captcha')
  const match = challenge.data.question.match(/(\d+)\s*\+\s*(\d+)/)
  assert.ok(match)
  form.set('captchaId', challenge.data.captchaId)
  form.set('captchaAnswer', String(Number(match[1]) + Number(match[2])))
  form.set('website', '')
  return form
}

async function createPost(token, { title, body, category = 'general', image = false, ip = '198.51.100.40' }) {
  const form = new FormData()
  form.set('category', category)
  form.set('title', title)
  form.set('body', body)
  if (image) form.set('image', new Blob([PNG], { type: 'image/png' }), 'picture.png')
  await withCaptcha(form)
  return api('/api/posts', auth(token, {
    method: 'POST',
    headers: { 'X-Forwarded-For': ip },
    body: form,
  }))
}

test('uploaded images and avatars are persisted as database data URLs', async () => {
  const avatar = new FormData()
  avatar.set('authorName', 'Alice Author')
  avatar.set('penName', 'Alice Pen')
  avatar.set('bio', 'Social feature tests')
  avatar.set('avatar', new Blob([PNG], { type: 'image/png' }), 'avatar.png')
  const updated = await api('/api/users/me', auth(tokens.alice, { method: 'PATCH', body: avatar }))
  assert.equal(updated.status, 200)
  assert.ok(updated.data.user.avatarUrl.startsWith('data:image/png;base64,'))

  const created = await createPost(tokens.alice, {
    title: 'A Persistent Picture',
    body: 'This image survives every restart.',
    image: true,
    ip: '198.51.100.41',
  })
  assert.equal(created.status, 201)
  const imageUrl = created.data.post.imageUrl
  assert.ok(imageUrl.startsWith('data:image/png;base64,'))

  const stored = await db.prepare('SELECT image_url FROM posts WHERE id = ?').get(created.data.post.id)
  const storedAvatar = await db.prepare('SELECT avatar_url FROM users WHERE id = ?').get(users.alice.id)
  assert.equal(stored.image_url, imageUrl)
  assert.equal(storedAvatar.avatar_url, updated.data.user.avatarUrl)
  assert.doesNotMatch(JSON.stringify(created.data), /"email"|"password/)

  const fetched = await api(`/api/posts/${created.data.post.id}`)
  assert.equal(fetched.data.post.imageUrl, imageUrl)
})

test('follows toggle safely and power the following feed', async () => {
  const feed = await api('/api/posts?limit=100')
  const authorId = feed.data.posts.find((post) => post.author.id !== users.alice.id).author.id

  const self = await api(`/api/users/${users.alice.id}/follow`, auth(tokens.alice, { method: 'POST' }))
  assert.equal(self.status, 400)

  const followed = await api(`/api/users/${authorId}/follow`, auth(tokens.alice, { method: 'POST' }))
  assert.equal(followed.status, 200)
  assert.equal(followed.data.followers, 1)
  assert.equal(followed.data.isFollowing, true)

  const profile = await api(`/api/users/${authorId}`, auth(tokens.alice))
  assert.equal(profile.data.user.followers, 1)
  assert.equal(profile.data.user.isFollowing, true)
  assert.doesNotMatch(JSON.stringify(profile.data), /email|password_hash/)

  const followingFeed = await api('/api/posts?feed=following', auth(tokens.alice))
  assert.equal(followingFeed.status, 200)
  assert.ok(followingFeed.data.posts.length > 0)
  assert.ok(followingFeed.data.posts.every((post) => post.author.id === authorId))

  const guest = await api('/api/posts?feed=following')
  assert.equal(guest.status, 401)

  const unfollowed = await api(`/api/users/${authorId}/follow`, auth(tokens.alice, { method: 'POST' }))
  assert.equal(unfollowed.status, 200)
  assert.equal(unfollowed.data.followers, 0)
  assert.equal(unfollowed.data.isFollowing, false)

  const empty = await api('/api/posts?feed=following', auth(tokens.alice))
  assert.equal(empty.data.posts.length, 0)

  const missing = await api('/api/users/999999/follow', auth(tokens.alice, { method: 'POST' }))
  assert.equal(missing.status, 404)
})

test('bookmarks are private, toggleable and have their own feed', async () => {
  const target = (await api('/api/posts?limit=1')).data.posts[0]

  const saved = await api(`/api/posts/${target.id}/bookmark`, auth(tokens.alice, { method: 'POST' }))
  assert.equal(saved.status, 200)
  assert.equal(saved.data.bookmarked, true)

  const aliceSaved = await api('/api/posts?feed=saved', auth(tokens.alice))
  assert.ok(aliceSaved.data.posts.some((post) => post.id === target.id))
  assert.equal(aliceSaved.data.posts.find((post) => post.id === target.id).bookmarked, true)

  const bobSaved = await api('/api/posts?feed=saved', auth(tokens.bob))
  assert.equal(bobSaved.data.posts.length, 0)

  const removed = await api(`/api/posts/${target.id}/bookmark`, auth(tokens.alice, { method: 'POST' }))
  assert.equal(removed.data.bookmarked, false)
  assert.equal((await api('/api/posts?feed=saved', auth(tokens.alice))).data.posts.length, 0)

  const missing = await api('/api/posts/999999/bookmark', auth(tokens.alice, { method: 'POST' }))
  assert.equal(missing.status, 404)
})

test('search covers titles, bodies and pen names with category filtering', async () => {
  const created = await createPost(tokens.bob, {
    title: 'Winter Lantern',
    body: 'A quiet harbor under silver rain.',
    ip: '198.51.100.42',
  })
  assert.equal(created.status, 201)

  const byTitle = await api('/api/posts?q=winter')
  assert.ok(byTitle.data.posts.some((post) => post.id === created.data.post.id))

  const byBody = await api('/api/posts?q=harbor')
  assert.ok(byBody.data.posts.some((post) => post.id === created.data.post.id))

  const byAuthor = await api(`/api/posts?q=${encodeURIComponent('ကဗျာမိုး')}`)
  assert.ok(byAuthor.data.posts.length > 0)
  assert.ok(byAuthor.data.posts.every((post) => post.author.penName.includes('ကဗျာမိုး')))

  const wildcard = await api('/api/posts?q=%25')
  assert.equal(wildcard.data.posts.length, 0)

  const poems = await api('/api/posts?category=poem')
  assert.ok(poems.data.posts.length > 0)
  assert.ok(poems.data.posts.every((post) => post.category === 'poem'))
})

test('feedback is sanitized, rate limited and admin managed', async () => {
  const guest = await api('/api/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ category: 'bug', message: 'Guest message' }),
  })
  assert.equal(guest.status, 401)

  for (let index = 0; index < 3; index += 1) {
    const response = await api('/api/feedback', auth(tokens.alice, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category: index === 0 ? 'bug' : 'suggestion',
        message: `<script>alert("xss")</script> Please improve ${index}`,
      }),
    }))
    assert.equal(response.status, 201, JSON.stringify(response.data))
    assert.doesNotMatch(response.data.feedback.message, /<script>/)
  }

  const blocked = await api('/api/feedback', auth(tokens.alice, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ category: 'bug', message: 'One too many' }),
  }))
  assert.equal(blocked.status, 429)

  const invalid = await api('/api/feedback', auth(tokens.bob, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ category: 'unknown', message: 'Hello' }),
  }))
  assert.equal(invalid.status, 400)

  const forbidden = await api('/api/admin/feedback', auth(tokens.bob))
  assert.equal(forbidden.status, 403)

  const listed = await api('/api/admin/feedback', auth(tokens.admin))
  assert.equal(listed.status, 200)
  assert.equal(listed.data.feedback.length, 3)
  assert.doesNotMatch(JSON.stringify(listed.data), /email|password/)
  assert.ok(listed.data.feedback.every((item) => typeof item.user.penName === 'string'))

  const target = listed.data.feedback[0].id
  const deleted = await api(`/api/admin/feedback/${target}`, auth(tokens.admin, { method: 'DELETE' }))
  assert.equal(deleted.status, 200)
  assert.equal((await api('/api/admin/feedback', auth(tokens.admin))).data.feedback.length, 2)

  const missing = await api('/api/admin/feedback/999999', auth(tokens.admin, { method: 'DELETE' }))
  assert.equal(missing.status, 404)
})
