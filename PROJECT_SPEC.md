# Writer's Realm — Project Specification

**စာရေးဆရာများ၏ ကလောင်ကမ္ဘာ**

A modern full-stack social media web application built specifically for authors and writers to share poems (ကဗျာ), short stories (ဝတ္ထုတို), and general writing (အထွေထွေ) with a literary community.

---

## 1. Architecture Overview

```
writer-social/
├── PROJECT_SPEC.md              # This document
├── package.json                 # Root scripts (dev/build/start/test)
├── index.html                   # Vite entry
├── vite.config.ts               # Dev proxy /api -> :3001, /uploads -> :3001
├── tsconfig.json                # Frontend TypeScript config (strict, noEmit)
├── tailwind.config.js           # Literary color palette, darkMode: 'class'
├── postcss.config.js
├── server/
│   ├── src/
│   │   ├── index.js             # Express bootstrap
│   │   ├── app.js               # App factory, Helmet/CORS, routes, SPA fallback
│   │   ├── db.js                # SQLite/Postgres schema, migrations, seed data
│   │   ├── auth.js              # JWT sign/verify, bcrypt, public projections
│   │   ├── media.js             # Cloudinary signed uploads + Base64 persistence
│   │   ├── upload.js            # Multer memory uploads + strict validation
│   │   ├── validation.js        # Sanitization, validators, search escaping
│   │   ├── rateLimit.js         # Per-IP/per-user fixed-window rate limits
│   │   ├── captcha.js           # Signed arithmetic CAPTCHA + honeypot
│   │   ├── lockdown.js          # Admin-controlled registration pause
│   │   ├── spam.js              # Spam pattern heuristics
│   │   ├── messages.js          # EN/MY error messages
│   │   └── routes/
│   │       ├── auth.js          # /api/auth/*
│   │       ├── users.js         # /api/users/* (profile, follows)
│   │       ├── posts.js         # /api/posts/* (CRUD, social, search, bookmarks)
│   │       ├── admin.js         # /api/admin/* (moderation, feedback)
│   │       └── feedback.js      # /api/feedback
│   └── tests/
│       ├── app.test.js          # Core API security/regression suite
│       └── social.test.js       # Persistent media/social/feedback suite
├── src/
│   ├── main.tsx                 # React entry + provider composition
│   ├── App.tsx                  # Feed views, profiles, modals, layout shell
│   ├── index.css                # Tailwind + theme tokens/custom utilities
│   ├── types.ts                 # Shared TS interfaces
│   ├── i18n.ts                  # EN/MY dictionary + FeedView type
│   ├── config.ts                # Capacitor/native API URL resolution
│   ├── api.ts                   # Typed fetch wrapper + token storage
│   ├── utils.ts                 # timeAgo, initials, client-side compression
│   ├── context/
│   │   ├── AuthContext.tsx      # Session, auth/profile modal state
│   │   ├── SettingsContext.tsx  # ThemeProvider + LocaleProvider
│   │   └── ToastContext.tsx     # Toast notifications + UI
│   └── components/
│       ├── Header.tsx           # Search, language/theme, feedback, admin actions
│       ├── LeftSidebar.tsx      # Categories + Following/Saved navigation
│       ├── RightSidebar.tsx     # Featured writers + trending categories
│       ├── Footer.tsx           # Feedback button + developer credit
│       ├── FeedbackModal.tsx    # Suggestion/bug submission
│       ├── AdminFeedbackModal.tsx # Admin feedback inbox
│       ├── Composer.tsx         # Post creation, CAPTCHA, image compression
│       ├── PostCard.tsx         # Post UI, reactions, comments, bookmarks
│       ├── Comments.tsx
│       ├── AuthModal.tsx
│       ├── EditProfileModal.tsx
│       ├── EditPostModal.tsx
│       └── Common.tsx           # Avatar, badges, spinner, ModalShell
└── uploads/                     # Legacy files only; new uploads are never written here
```

### Runtime flow

- **Development:** `npm run dev` starts the Express API on port **3001** and Vite on port **5173**. Vite proxies `/api` and `/uploads` to Express.
- **Production:** `npm run build` compiles the frontend into `dist/`; `npm start` serves both the API and the compiled SPA from Express on `PORT` (default 3001).
- **Database:** PostgreSQL when `DATABASE_URL` is set; otherwise SQLite at `data/writers-realm.db`. `CREATE TABLE IF NOT EXISTS` statements run on every boot, so new tables are added non-destructively to existing databases.
- **Auth:** JWT stored in `localStorage` and sent as `Authorization: Bearer <token>`; passwords hashed with bcrypt; every request reloads a public user projection from the database.
- **Persistent media:** `multer` memory storage validates a maximum of **2 MB** and only `image/jpeg`, `image/png`, `image/webp` (declared MIME, extension, and magic bytes). The browser compresses images with canvas before upload; the server then either:
  1. uploads to Cloudinary (signed API request) when `CLOUDINARY_URL` **or** `CLOUDINARY_CLOUD_NAME` + `CLOUDINARY_API_KEY` + `CLOUDINARY_API_SECRET` is configured, or
  2. stores the image as a compressed `data:<mime>;base64,...` URL directly in `users.avatar_url` / `posts.image_url`.

  No new image is written to ephemeral disk, so images and avatars survive Render restarts. Legacy `/uploads/<file>` URLs remain readable for old records but are never created for new uploads.

---

## 2. Database Schema

All SQL is written once in `server/src/db.js` and translated to Postgres placeholders/identity syntax when `DATABASE_URL` is present. All values are bound as parameters; `?` placeholders are never filled with string interpolation.

### `users`
| Column | Type | Notes |
| --- | --- | --- |
| `id` | INTEGER PRIMARY KEY AUTOINCREMENT | |
| `email` | TEXT UNIQUE NOT NULL | lowercase, never returned by the API |
| `password_hash` | TEXT NOT NULL | bcrypt, never returned by the API |
| `author_name` | TEXT NOT NULL | Author Name / စာရေးဆရာ အမည် |
| `pen_name` | TEXT NOT NULL | Pen Name / ကလောင်အမည် (badge) |
| `bio` | TEXT NOT NULL DEFAULT '' | Bio |
| `avatar_url` | TEXT DEFAULT NULL | Cloudinary HTTPS URL or `data:image/...;base64,...` |
| `is_admin` | BOOLEAN NOT NULL DEFAULT FALSE | synced from `ADMIN_EMAILS` on boot |
| `created_at` | TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP | |

### `posts`
| Column | Type | Notes |
| --- | --- | --- |
| `id` | INTEGER PRIMARY KEY AUTOINCREMENT | |
| `user_id` | INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE | author |
| `category` | TEXT NOT NULL CHECK IN ('poem','story','general') | tab |
| `title` | TEXT NOT NULL | |
| `body` | TEXT NOT NULL | poem / story text |
| `image_url` | TEXT DEFAULT NULL | Cloudinary HTTPS URL or Base64 data URL |
| `repost_of` | INTEGER DEFAULT NULL REFERENCES posts(id) ON DELETE SET NULL | reposts |
| `created_at` | TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP | |

### `reactions`
| Column | Type | Notes |
| --- | --- | --- |
| `id` | INTEGER PRIMARY KEY AUTOINCREMENT | |
| `user_id` | INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE | |
| `post_id` | INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE | |
| `type` | TEXT NOT NULL CHECK IN ('love','haha','sad') | one active reaction per user/post |
| `created_at` | TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP | |
| **Constraint** | `UNIQUE(user_id, post_id)` | toggle / switch supported |

### `comments`
| Column | Type | Notes |
| --- | --- | --- |
| `id` | INTEGER PRIMARY KEY AUTOINCREMENT | |
| `post_id` | INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE | |
| `user_id` | INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE | |
| `body` | TEXT NOT NULL | |
| `created_at` | TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP | |

### `shares`
| Column | Type | Notes |
| --- | --- | --- |
| `id` | INTEGER PRIMARY KEY AUTOINCREMENT | |
| `post_id` | INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE | |
| `user_id` | INTEGER REFERENCES users(id) ON DELETE SET NULL | null = anonymous link share |
| `created_at` | TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP | |

### `follows`
| Column | Type | Notes |
| --- | --- | --- |
| `follower_id` | INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE | viewer |
| `following_id` | INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE | target writer |
| `created_at` | TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP | |
| **Constraint** | `PRIMARY KEY (follower_id, following_id)`, `CHECK (follower_id <> following_id)` | idempotent toggle, no self-follow |

### `bookmarks`
| Column | Type | Notes |
| --- | --- | --- |
| `user_id` | INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE | owner |
| `post_id` | INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE | saved post |
| `created_at` | TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP | |
| **Constraint** | `PRIMARY KEY (user_id, post_id)` | private, idempotent toggle |

### `feedback`
| Column | Type | Notes |
| --- | --- | --- |
| `id` | INTEGER PRIMARY KEY AUTOINCREMENT | |
| `user_id` | INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE | sender (from JWT only) |
| `category` | TEXT NOT NULL CHECK IN ('suggestion','bug','other') | |
| `message` | TEXT NOT NULL | sanitized plain text, up to 2,000 chars |
| `created_at` | TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP | |

Indexes: `posts(category, created_at DESC)`, `posts(user_id)`, `reactions(post_id)`, `comments(post_id)`, `shares(post_id)`, `follows(following_id)`, `bookmarks(post_id)`, `feedback(user_id, created_at DESC)`.

---

## 3. API Reference

| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| GET | `/api/health` | no | Health check |
| GET | `/api/auth/captcha` | no | Signed arithmetic challenge |
| GET | `/api/auth/status` | no | Registration open state |
| POST | `/api/auth/register` | no | Register (authorName, penName, email, password, bio?, avatar?, CAPTCHA) |
| POST | `/api/auth/login` | no | Login, returns `{ token, user }` |
| GET | `/api/auth/me` | yes | Current user |
| GET | `/api/users/featured` | no | Featured writers with stats |
| GET | `/api/users/trending` | no | Category counts |
| PATCH | `/api/users/me` | yes | Update authorName, penName, bio, avatar |
| GET | `/api/users/:id` | optional | Public profile with post/comment/reaction stats, follower/following counts, `isFollowing` |
| POST | `/api/users/:id/follow` | yes | Toggle follow; self-follow returns `400`; cannot target another user's identity |
| GET | `/api/posts?q=&category=&authorId=&feed=&limit=` | optional | Feed with reaction/comment/share counts, `bookmarked`, viewer reaction. `q` searches title, body, author name and pen name. `feed=following\|saved` requires auth |
| GET | `/api/posts/:id` | optional | Single post |
| POST | `/api/posts` | yes | Create post (multipart: category, title, body, image, CAPTCHA) |
| PUT / PATCH | `/api/posts/:id` | yes (owner) | Update category/title/body and optionally replace or remove image |
| DELETE | `/api/posts/:id` | yes (owner or admin) | Delete post |
| POST | `/api/posts/:id/react` | yes | `{ type: 'love'|'haha'|'sad' }` toggle/switch |
| POST | `/api/posts/:id/bookmark` | yes | Toggle private bookmark for the authenticated user |
| GET | `/api/posts/:id/comments` | no | Comments list |
| POST | `/api/posts/:id/comments` | yes | Add comment |
| DELETE | `/api/posts/:id/comments/:commentId` | yes (owner) | Delete comment |
| POST | `/api/posts/:id/share` | optional | `{ kind: 'repost'|'link' }`; repost requires auth |
| POST | `/api/feedback` | yes (3/hour/user) | `{ category: 'suggestion'|'bug'|'other', message }` sanitized feedback |
| GET | `/api/admin/feedback` | yes (admin) | Feedback list with public author info only |
| DELETE | `/api/admin/feedback/:id` | yes (admin) | Delete feedback |
| DELETE | `/api/admin/spam` | yes (admin) | Heuristic spam cleanup |
| GET / POST | `/api/admin/lockdown` | yes (admin) | Read / toggle registration pause |

All errors return `{ error: string }`; validation messages use the language supplied via `Accept-Language` (`en`/`my`) or `lang` form field. Owner/admin-only actions return `403`; missing tokens return `401`; missing records return `404`. Responses use public projections (`id`, author name, pen name, bio, avatar, admin flag, createdAt) and never include email, password hash, or tokens.

---

## 4. Requirements

### 4.1 Layout & Theme
- Responsive 3-column feed: left navigation, center composer + feed, right featured writers + trending.
- Below `lg`, right column hides; below `md`, left column collapses into horizontal chips.
- Light theme: warm parchment/cream with amber/terracotta accents. Dark theme: deep ink/slate with warm gold accents.
- Theme toggle persisted in `localStorage` and applied via `class="dark"` on `<html>`.
- Subtle developer credit footer: `Developed by Mayin Su Mo(Siss Paing Phyoe)` with muted typography that works in both themes.

### 4.2 Bilingual Support
- `EN`/`MY` header toggle persisted in `localStorage`.
- Every UI label, button, placeholder, category name, toast, and server validation message has an English and Burmese string.
- Feedback button/modal is labelled `Feedback / အကြံပြုရန်`.
- Post content remains user-generated (not translated).

### 4.3 Writer Profiles
- Register/login with email + password.
- Author name, pen name badge, bio, and persistent avatar.
- Profile view shows follower and following counts, a Follow/Following toggle (hidden for your own profile), and the writer's posts.
- Profile edit modal keeps the current avatar when no new image is chosen.

### 4.4 Composer & Strict No-Video Policy
- Tabs: ကဗျာ (Poem), ဝတ္ထုတို (Short Story), အထွေထွေ (General).
- Image attachments only: `.jpg`, `.jpeg`, `.png`, `.webp`; frontend validation plus multer `fileFilter`, declared MIME/extension checks, and magic-byte sniffing reject video and spoofed files with EN/MY errors.
- Maximum **2 MB** per file. Images are canvas-compressed in the browser (max 1600 px, WebP quality 0.82 with fallback to the original) before storage.

### 4.5 Social Interactions
- Reactions: Love (အသည်း ❤️), Haha (ဟဟ 😂), Sad (ငိုတာ 😢) with live counts; clicking active one removes it, clicking another switches it.
- Comments visible/expandable on all post types; owner can delete own comments.
- Share: "Repost to Feed" and "Copy Post Link".
- Follow writers to build a **Following** feed; save posts with the bookmark button to build a **Saved / Bookmarks** view. Both are private to the authenticated user.
- Server-side search by title, body, author name, or pen name, with category filtering (`Poem / Short Story / General`). Search tokens escape SQL wildcard characters.

### 4.6 Feedback System
- Feedback button in header and footer opens a clean modal with suggestion/bug/other categories and a 2,000-character message.
- JWT required; in-memory fixed window limits each user to **3 submissions per hour** with `X-RateLimit-*` and `Retry-After` headers.
- HTML is stripped and entities decoded server-side before storage; spam patterns are rejected.
- Admin-only feedback inbox lists messages with pen names and timestamps and supports deletion.

### 4.7 Post Ownership
- Post cards owned by the signed-in writer show Edit and Delete in the overflow menu.
- Edit opens a pre-filled modal with title, category, content, and optional image replace/remove; saving calls `PUT /api/posts/:id` with FormData.
- Changing to a category outside the active feed filter resets the feed to All so the updated post stays visible.

### 4.8 Seed Data
- Two sample Myanmar writers with pen names and bios.
- Multiple sample poems and short stories in Burmese plus general posts, with seeded reactions, comments and shares.
- No demo-login shortcut: every account signs in through `POST /api/auth/login`.

### 4.9 Verification
- `npm run build` (TypeScript + Vite) must pass with zero errors.
- `npm test` (node:test backend suite) must pass with zero failures.
- `npm run typecheck` may be run independently.

---

## 5. Security & Validation Notes

- Passwords hashed with bcrypt (cost 10); email/password/hash fields never serialized by `publicUser()` or feedback queries.
- JWT secret from `JWT_SECRET`, with a temporary random fallback that invalidates sessions on restart; configure a long secret in production.
- Parameterized SQL for every query on both SQLite and Postgres; dynamic `WHERE`/`SET` fragments come only from fixed whitelists, and `LIKE` wildcards in user search terms are escaped.
- Ownership checks on post/comment edits and deletes; follow/bookmark target ids are validated and the actor always comes from the JWT (no IDOR). Self-follow is blocked in middleware and by a DB `CHECK`.
- Admin-only moderation and feedback endpoints are guarded by `requireAuth` + `requireAdmin`; admin emails are declarative via `ADMIN_EMAILS` and the public demo account is always demoted.
- Uploads are validated twice (multer filter and magic bytes), limited to 2 MB, and either sent to Cloudinary over HTTPS with a signed request or stored as Base64 in the database. Cloudinary responses must be HTTPS URLs on the configured cloud domain.
- CSP allows `data:` and `blob:` images (needed for Base64 persistence) while keeping `script-src` restricted to `'self'` and `capacitor:`.
- JSON bodies limited to 50 kB, multipart fields to 256 kB, and feedback to 3/hour/user; CAPTCHA, honeypot, registration/login/post rate limits and spam heuristics protect public forms.
- `/uploads` is retained read-only for legacy images with `nosniff` and cache headers; new uploads never touch the filesystem.

---

## 6. Startup Instructions

```bash
# 1. Install dependencies (once)
npm install

# 2. Development: API on :3001, Vite UI on :5173
npm run dev

# 3. Or production: build + serve everything from :3001
npm run build
npm start

# 4. Verify
npm test
npm run typecheck
```

Open **http://localhost:5173** in development or **http://localhost:3001** in production.
The SQLite database is created automatically on first launch and seeded with sample writers/posts.

Environment variables (see `.env.example`):

```
PORT=3001
JWT_SECRET=replace-with-a-long-random-string
CAPTCHA_SECRET=replace-with-a-separate-long-random-string
REGISTRATION_OPEN=true
ADMIN_EMAILS=owner@example.com
DATABASE_URL=postgres://user:password@host:5432/writers_realm

# Optional: persistent Cloudinary storage (use either form)
CLOUDINARY_URL=cloudinary://api_key:api_secret@cloud_name
# CLOUDINARY_CLOUD_NAME=cloud_name
# CLOUDINARY_API_KEY=api_key
# CLOUDINARY_API_SECRET=api_secret
```

When no Cloudinary configuration is present, images are stored as Base64 data URLs in the database automatically.
