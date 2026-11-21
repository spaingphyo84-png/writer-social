import bcrypt from 'bcryptjs'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { AsyncLocalStorage } from 'node:async_hooks'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
export const dataDir = path.join(root, 'data')
export const dbPath = path.join(dataDir, 'writers-realm.db')
export const ADMIN_EMAIL = 'kabya-moe@writersrealm.local'

if (!process.env.DATABASE_URL) fs.mkdirSync(dataDir, { recursive: true })

const SCHEMA_SQL = `
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      author_name TEXT NOT NULL,
      pen_name TEXT NOT NULL,
      bio TEXT NOT NULL DEFAULT '',
      avatar_url TEXT,
      is_admin BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      category TEXT NOT NULL CHECK (category IN ('poem', 'story', 'general')),
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      image_url TEXT,
      repost_of INTEGER REFERENCES posts(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS reactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK (type IN ('love', 'haha', 'sad')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (user_id, post_id)
    );

    CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS shares (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

  CREATE INDEX IF NOT EXISTS idx_posts_category_created ON posts(category, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_posts_user ON posts(user_id);
  CREATE INDEX IF NOT EXISTS idx_reactions_post ON reactions(post_id);
  CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id);
  CREATE INDEX IF NOT EXISTS idx_shares_post ON shares(post_id);
`

function toPostgres(sql) {
  let converted = ''
  let index = 0
  let quote = null
  let lineComment = false
  let blockComment = false

  for (let i = 0; i < sql.length; i += 1) {
    const ch = sql[i]
    const next = sql[i + 1]

    if (lineComment) {
      converted += ch
      if (ch === '\n') lineComment = false
      continue
    }
    if (blockComment) {
      converted += ch
      if (ch === '*' && next === '/') {
        converted += next
        i += 1
        blockComment = false
      }
      continue
    }
    if (quote) {
      converted += ch
      if (ch === quote) {
        if (next === quote) {
          converted += next
          i += 1
        } else {
          quote = null
        }
      }
      continue
    }
    if (ch === '-' && next === '-') {
      lineComment = true
      converted += ch
      continue
    }
    if (ch === '/' && next === '*') {
      blockComment = true
      converted += ch
      continue
    }
    if (ch === "'" || ch === '"') {
      quote = ch
      converted += ch
      continue
    }
    if (ch === '?') {
      converted += `$${index + 1}`
      index += 1
      continue
    }
    converted += ch
  }

  return converted
    .replace(/\bdatetime\s*\(\s*'now'\s*\)/gi, 'CURRENT_TIMESTAMP')
    .replace(/\bdatetime\s*\(\s*"now"\s*\)/gi, 'CURRENT_TIMESTAMP')
    .replace(/\bINTEGER\s+PRIMARY\s+KEY\s+AUTOINCREMENT\b/gi, 'INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY')
    .replace(/\bCURRENT_TIMESTAMP\b/gi, "to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')")
}

function createLock() {
  let tail = Promise.resolve()
  return (fn) => {
    const result = tail.then(fn, fn)
    tail = result.then(() => undefined, () => undefined)
    return result
  }
}

async function createSqliteDatabase(filename = dbPath) {
  const { default: Database } = await import('better-sqlite3')
  const sqlite = new Database(filename)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')

  const withLock = createLock()
  const txContext = new AsyncLocalStorage()

  function prepare(sql) {
    const prepared = sqlite.prepare(sql)
    const guarded = (operation) => (txContext.getStore() ? Promise.resolve().then(operation) : withLock(operation))
    return {
      get: (...params) => guarded(() => prepared.get(...params)),
      all: (...params) => guarded(() => prepared.all(...params)),
      run: (...params) => guarded(() => prepared.run(...params)),
    }
  }

  return {
    dialect: 'sqlite',
    exec: (sql) => withLock(() => { sqlite.exec(sql) }),
    prepare,
    transaction(fn) {
      return () => withLock(async () => {
        sqlite.exec('BEGIN IMMEDIATE')
        try {
          const result = await txContext.run(true, fn)
          sqlite.exec('COMMIT')
          return result
        } catch (error) {
          sqlite.exec('ROLLBACK')
          throw error
        }
      })
    },
  }
}

async function createPostgresDatabase() {
  const { default: pg } = await import('pg')
  const { Pool, types } = pg

  types.setTypeParser(20, Number)
  types.setTypeParser(1700, Number)

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  })
  const txContext = new AsyncLocalStorage()

  function query(sql, params = []) {
    const client = txContext.getStore()
    return client ? client.query(sql, params) : pool.query(sql, params)
  }

  return {
    dialect: 'postgres',
    exec: (sql) => query(toPostgres(sql)),
    prepare(rawSql) {
      const sql = toPostgres(rawSql)
      const runSql = /^\s*INSERT\b/i.test(sql) && !/\bRETURNING\b/i.test(sql)
        ? `${sql} RETURNING id`
        : sql
      return {
        get: async (...params) => {
          const { rows } = await query(sql, params)
          return rows[0]
        },
        all: async (...params) => {
          const { rows } = await query(sql, params)
          return rows
        },
        run: async (...params) => {
          const { rows, rowCount } = await query(runSql, params)
          return { changes: rowCount, lastInsertRowid: rows[0]?.id }
        },
      }
    },
    transaction(fn) {
      return async () => {
        const client = await pool.connect()
        try {
          await client.query('BEGIN')
          const result = await txContext.run(client, fn)
          await client.query('COMMIT')
          return result
        } catch (error) {
          await client.query('ROLLBACK')
          throw error
        } finally {
          client.release()
        }
      }
    },
  }
}

const seedWriters = [
  {
    email: 'kabya-moe@writersrealm.local',
    authorName: 'ခင်သက်အောင်',
    penName: 'ကဗျာမိုး',
    bio: 'ကဗျာဆရာ၊ စာပေဝါသနာအိုး။ မိုးရွာသည့်နေ့တိုင်း စာကြောင်းတစ်ကြောင်း ရေးချင်တတ်သည်။ ရှုမဝစာပေကို ချစ်မက်သူ။',
  },
  {
    email: 'kalone-ni@writersrealm.local',
    authorName: 'မောင်နိုင်ဦး',
    penName: 'ကလောင်နီ',
    bio: 'ဝတ္ထုတိုဆရာ။ မြို့ငယ်လေးတစ်ခုက လူတွေရဲ့ ဇာတ်လမ်းလေးတွေကို စုဆောင်းပြီး စာအဖြစ် ပြန်ရေးတတ်သူ။ လက်ဖက်ရည်တစ်ခွက်နဲ့ စာရေးရတာ ပိုအားရှိသည်။',
  },
]

const seedPosts = [
  {
    user: 1,
    category: 'poem',
    title: 'မိုးရွာသောနေ့',
    body: `မိုးက တံခါးခေါက်လာတယ်
တိတ်တိတ်လေးနဲ့ မိုးမကြိုတင်ဘဲ

ခေါင်းအုံးပေါ်က စာအုပ်လေးကို
မိုးက လက်နဲ့ထိလိုက်သလို
စာမျက်နှာတွေ စိုစွတ်လာတယ်

စာကြောင်းတွေကလည်း ရေမခံဘဲ
အသံတိတ်ရာကနေ စီးဆင်းလာတယ်

ငါတို့ မမြင်ရတဲ့ ကောင်းကင်က
ဒီနေ့ စာရေးသူတစ်ယောက် ဖြစ်သွားတယ်`,
    age: '5 hours',
  },
  {
    user: 2,
    category: 'story',
    title: 'မီးထွန်းထားသော ဆိုင်ငယ်',
    body: `လမ်းထောင့်က လက်ဖက်ရည်ဆိုင်လေးက ည ၁၁ နာရီအထိ မီးထွန်းထားတတ်တယ်။ ဆိုင်ရှင်အမေက မီးခြစ်ဆံလေးကို တစ်ချက်တိုက်လိုက်တိုင်း မြို့က နည်းနည်း ပိုနွေးလာသလို ခံစားရတယ်။

တစ်နေ့ မိုးသည်းနေတဲ့ ညတစ်ခုမှာ ကျောင်းသားလေးတစ်ယောက် ရေစိုနဲ့ ဝင်လာတယ်။ ပိုက်ဆံမရှိလို့ လက်ဖက်ရည်မမှာနိုင်ပေမယ့် စာအုပ်တစ်အုပ် ကျန်နေခဲ့တယ်။ စာအုပ်ထဲမှာ "မိုးရပ်ရင် ပြန်လာပါမယ်" လို့ ရေးထားတဲ့ စာကြောင်းလေး ပါတယ်။

အမေက စာအုပ်ကို မီးခိုးရောင်ထဲ ထားပြီး နောက်တစ်နေ့အတွက် လက်ဖက်ရည်တစ်ခွက် ကြိုတင်ထားလိုက်တယ်။

မိုးရပ်တဲ့နေ့မှာ ကျောင်းသားလေး ပြန်လာတယ်။ ဒီတစ်ခေါက်တော့ စာအုပ်အသစ်တစ်အုပ်ပါ ယူလာတယ်။ ဆိုင်လေးထဲမှာ စာအုပ်နှစ်အုပ်နဲ့ လက်ဖက်ရည်နှစ်ခွက် ရှိနေတယ်။

အချို့အရာတွေက ပြန်လာတတ်တယ်။ မီးလေးထွန်းထားရင် ပိုလွယ်တယ်။`,
    age: '1 day',
  },
  {
    user: 1,
    category: 'poem',
    title: 'စာကြောင်းတစ်ကြောင်း',
    body: `မနက်က ရေးခဲ့တဲ့ စာကြောင်းတစ်ကြောင်းက
ညနေရောက်တော့ တခြားအဓိပ္ပာယ် ရသွားတယ်

စာလုံးတွေက မပြောင်းပေမယ့်
ဖတ်တဲ့သူ့မျက်လုံးက ပြောင်းသွားတာကြောင့်

ဒါကြောင့် စာရေးသူတစ်ယောက်ဟာ
မှန်တာကို ရေးတာထက်
ရိုးသားတာကို ရေးတတ်ဖို့ လိုတယ်`,
    age: '2 days',
  },
  {
    user: 2,
    category: 'general',
    title: 'စာရေးသူတစ်ယောက်ရဲ့ မနက်ခင်း',
    body: `မနက် ၅ နာရီခွဲ။ မီးဖွင့်လိုက်တာနဲ့ စာရေးစားပွဲပေါ်က ဖုန်လေးတွေကို မြင်လိုက်ရတယ်။ မနေ့က ရေးလို့မပြီးခဲ့တဲ့ ဇာတ်လမ်းက စာမျက်နှာထဲမှာ တစ်ဝက်လောက် အိပ်ပျော်နေတယ်။

လက်ဖက်ရည်တစ်ခွက်၊ တိတ်ဆိတ်မှုတစ်ခု၊ ပြီးတော့ ကီးဘုတ်လေးက အသံစတယ်။ စာရေးတာဆိုတာ ကြီးကျယ်တဲ့အရာ မဟုတ်ဘဲ မမြင်ရတဲ့အရာကို မြင်အောင် လုပ်ပြတာလို့ ဒီမနက်မှာ ထင်လိုက်မိတယ်။

ဒီနေ့လည်း စာကြောင်းလေးတစ်ကြောင်း ရေးဖြစ်ပါစေ။ ✍️`,
    age: '3 days',
  },
  {
    user: 2,
    category: 'story',
    title: 'လမ်းထောင့်က စာအုပ်ဆိုင်',
    body: `ဆိုင်ငယ်လေးကို အမေက "စာအိမ်" လို့ ခေါ်တယ်။ စာအုပ်တွေကို အိမ်သားတွေလို သဘောထားလို့။ နေ့တိုင်း မနက်ဖွင့်ရင် အမေက စာအုပ်တွေကို နေရာချပေးရင်း မေတ္တာနဲ့ ပြောတတ်တယ် — "မင်းတို့ ဒီနေ့ ဖတ်ခံရမယ်နော်။"

ကလေးတစ်ယောက် စာအုပ်ကို လက်နဲ့ကိုင်ရင်း မျက်နှာပြောင်းသွားတာကို အမေက ဘယ်တုန်းကမှ မမေ့ခဲ့ဘူး။ စာအုပ်က ဈေးပေါပေမယ့် ကလေး့်အတွက်တော့ ကမ္ဘာတစ်ခုလုံး ဖြစ်သွားတယ်။

ညနေမှာ ဆိုင်ပိတ်ချိန်ရောက်ရင် အမေက စာအုပ်တွေကို ပြန်လှမ်းကြည့်ရင်း ပြုံးတတ်တယ်။ ဒီနေ့ ဘယ်သူ့ကို ကမ္ဘာပိုပေးနိုင်ခဲ့လဲဆိုတာ သိနေလို့။`,
    age: '4 days',
  },
  {
    user: 1,
    category: 'poem',
    title: 'မီးအိမ်လေး',
    body: `အိမ်ငယ်လေးထဲမှာ
မီးအိမ်က တစ်လုံးတည်း အလိုက်ပေးတယ်

မင်းပြောခဲ့တဲ့ စကားလုံးတွေက
မီးရောင်ထဲမှာ အရိပ်ဖြစ်လာပြီး
နံရံပေါ်မှာ ကခုန်နေတယ်

ငါတို့ မပြောဖြစ်ခဲ့တာတွေကတော့
မီးမရောက်တဲ့ ထောင့်လေးထဲမှာ
တိတ်တိတ်လေး စောင့်နေကြတယ်

ဒီည မီးကို နည်းနည်းပိုမီးစေချင်တယ်`,
    age: '5 days',
  },
  {
    user: 1,
    category: 'general',
    title: 'ကလောင်နဲ့ မိုးကြိုး',
    body: `စာရေးဖို့ မိုးကြိုးက မလိုအပ်ပေမယ့် တစ်ခါတလေ အားတက်စေတယ်။ ကောင်းကင်က တစ်ချက်လက်ခုပ်လိုက်တာနဲ့ စာကြောင်းတွေက လိုက်ထွက်လာတတ်တယ်။

ဒီနေ့ ကလောင်လေး ထက်မြက်နေပါစေ။ မိုးကြိုးကတော့ ဖြစ်ချင်မှ ဖြစ်တာဆိုတော့... စာကြောင်းကို ကိုယ်တိုင် ရေးကြရအောင်။`,
    age: '6 days',
  },
]

const seedComments = [
  { post: 1, user: 2, body: 'မိုးရွာတဲ့နေ့နဲ့ စာကြောင်းက အရမ်းလိုက်ဖက်တယ်။ ဖတ်ရင်း ငါ့မနက်ခင်းကို ပြန်မြင်လိုက်မိတယ်။' },
  { post: 1, user: 1, body: 'ကျေးဇူးတင်ပါတယ်နော်။ မိုးက စာရေးခိုင်းနေတာပါ။' },
  { post: 2, user: 1, body: 'ဆိုင်ငယ်လေးက စာထဲမှာ အရမ်းအသက်ဝင်နေတယ်။ မီးခြစ်ဆံလေးကို မြင်လိုက်ရသလိုပဲ။' },
  { post: 3, user: 2, body: '"ရိုးသားတာကို ရေးတတ်ဖို့" ဆိုတဲ့ စာကြောင်းကို သိမ်းထားလိုက်မယ်။' },
  { post: 5, user: 1, body: 'စာအိမ်ဆိုတဲ့ အခေါ်အဝေါ်လေး အရမ်းလှတယ်။' },
]

function adminValue(db, isAdmin) {
  return db.dialect === 'postgres' ? isAdmin : (isAdmin ? 1 : 0)
}

function ago(age) {
  const [, amount, unit] = age.match(/^(\d+) (hour|day)s?$/) || []
  const ms = unit === 'hour' ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000
  return new Date(Date.now() - Number(amount || 1) * ms).toISOString().replace('T', ' ').slice(0, 19)
}

export async function seedDatabase(db) {
  const existing = (await db.prepare('SELECT COUNT(*) AS count FROM users').get()).count
  if (Number(existing) > 0) return false

  const insertUser = db.prepare(`
    INSERT INTO users (email, password_hash, author_name, pen_name, bio, is_admin, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `)
  const insertPost = db.prepare(`
    INSERT INTO posts (user_id, category, title, body, created_at)
    VALUES (?, ?, ?, ?, ?)
  `)
  const insertReaction = db.prepare(db.dialect === 'postgres'
    ? `INSERT INTO reactions (user_id, post_id, type, created_at) VALUES (?, ?, ?, ?)
       ON CONFLICT (user_id, post_id) DO UPDATE SET type = EXCLUDED.type, created_at = EXCLUDED.created_at`
    : `INSERT OR REPLACE INTO reactions (user_id, post_id, type, created_at) VALUES (?, ?, ?, ?)`)
  const insertComment = db.prepare(`
    INSERT INTO comments (post_id, user_id, body, created_at) VALUES (?, ?, ?, ?)
  `)
  const insertShare = db.prepare(`
    INSERT INTO shares (post_id, user_id, created_at) VALUES (?, NULL, ?)
  `)

  const seed = db.transaction(async () => {
    const passwordHash = bcrypt.hashSync('writer123', 10)
    const created = ago('6 days')
    const userIds = []
    for (const writer of seedWriters) {
      const info = await insertUser.run(
        writer.email, passwordHash, writer.authorName, writer.penName, writer.bio,
        adminValue(db, writer.email === ADMIN_EMAIL), created,
      )
      userIds.push(Number(info.lastInsertRowid))
    }

    const postIds = []
    for (const post of seedPosts) {
      const info = await insertPost.run(
        userIds[post.user - 1], post.category, post.title, post.body, ago(post.age),
      )
      postIds.push(Number(info.lastInsertRowid))
    }

    const reactionPlan = [
      [0, 'love'], [0, 'haha'], [1, 'sad'], [2, 'love'], [2, 'haha'], [3, 'sad'],
      [4, 'love'], [4, 'haha'], [5, 'love'], [6, 'haha'],
    ]
    for (const [index, [postIndex, type]] of reactionPlan.entries()) {
      const reactor = userIds[index % 2]
      if (postIds[postIndex] && reactor !== undefined) {
        await insertReaction.run(reactor, postIds[postIndex], type, ago('1 hour'))
      }
    }

    for (const comment of seedComments) {
      await insertComment.run(postIds[comment.post - 1], userIds[comment.user - 1], comment.body, ago('2 hours'))
    }
    await insertShare.run(postIds[0], ago('1 hour'))
    await insertShare.run(postIds[1], ago('1 hour'))
    await insertShare.run(postIds[4], ago('1 hour'))
  })

  await seed()
  return true
}

export const db = process.env.DATABASE_URL
  ? await createPostgresDatabase()
  : await createSqliteDatabase(process.env.WRITERS_REALM_DB || dbPath)

async function ensureAdminColumn(database) {
  try {
    await database.exec('ALTER TABLE users ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT FALSE')
  } catch (error) {
    const duplicateColumn = error?.code === '42701' ||
      (error?.code === 'SQLITE_ERROR' && /duplicate column name/i.test(error?.message || ''))
    if (!duplicateColumn) throw error
  }
}

async function ensureDemoUser(database) {
  const existing = await database.prepare('SELECT id FROM users WHERE email = ?').get(ADMIN_EMAIL)
  if (existing) return

  const writer = seedWriters[0]
  const columns = '(email, password_hash, author_name, pen_name, bio, is_admin, created_at)'
  const values = 'VALUES (?, ?, ?, ?, ?, ?, ?)'
  const conflict = database.dialect === 'postgres' ? ' ON CONFLICT (email) DO NOTHING' : ' OR IGNORE'
  const insert = database.dialect === 'postgres'
    ? `INSERT INTO users ${columns} ${values}${conflict}`
    : `INSERT${conflict} INTO users ${columns} ${values}`

  await database.prepare(insert).run(
    ADMIN_EMAIL,
    bcrypt.hashSync('writer123', 10),
    writer.authorName,
    writer.penName,
    writer.bio,
    adminValue(database, true),
    ago('6 days'),
  )
}

export async function initializeDatabase() {
  await db.exec(SCHEMA_SQL)
  await ensureAdminColumn(db)
  await seedDatabase(db)
  await ensureDemoUser(db)
  await db.prepare('UPDATE users SET is_admin = ? WHERE email = ?').run(adminValue(db, true), ADMIN_EMAIL)
}

await initializeDatabase()
