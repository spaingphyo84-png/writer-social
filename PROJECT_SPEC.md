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
├── tsconfig.json                # Frontend TypeScript config
├── tailwind.config.js           # Literary color palette, darkMode: 'class'
├── postcss.config.js
├── server/
│   ├── src/
│   │   ├── index.js             # Express bootstrap, static serving of dist/
│   │   ├── db.js                # SQLite schema, migrations, seed data
│   │   ├── auth.js              # JWT sign/verify, bcrypt hashing, auth middleware
│   │   ├── validation.js        # Shared validation + strict MIME checks
│   │   ├── routes/
│   │   │   ├── auth.js          # /api/auth/*
│   │   │   ├── users.js         # /api/users/*
│   │   │   └── posts.js         # /api/posts/* (CRUD, react, comment, share, repost)
│   │   └── messages.js          # EN/MY error messages
│   └── tests/
│       └── app.test.js          # Node built-in test runner (node:test)
├── src/
│   ├── main.tsx
│   ├── App.tsx                  # Providers, routing state, layout shell
│   ├── index.css                # Tailwind + theme tokens/custom utilities
│   ├── types.ts                 # Shared TS interfaces
│   ├── i18n.ts                  # Complete EN/MY translation dictionary + hook
│   ├── context/
│   │   ├── AuthContext.tsx      # Session, login/register/logout/update profile
│   │   ├── ThemeContext.tsx     # Dark/light persisted in localStorage
│   │   ├── LocaleContext.tsx    # EN/MY persisted in localStorage
│   │   └── ToastContext.tsx     # Toast notifications
│   ├── api.ts                   # Typed fetch wrapper
│   └── components/
│       ├── Header.tsx
│       ├── LeftSidebar.tsx
│       ├── RightSidebar.tsx
│       ├── Composer.tsx
│       ├── PostCard.tsx
│       ├── Comments.tsx
│       ├── AuthModal.tsx
│       ├── EditProfileModal.tsx
│       ├── Toast.tsx
│       └── Icons.tsx (re-exports lucide-react icons)
└── uploads/                     # Local file storage (images only, gitignored)
```

### Runtime flow

- **Development:** `npm run dev` starts the Express API on port **3001** and Vite on port **5173**. Vite proxies `/api` and `/uploads` to Express.
- **Production:** `npm run build` compiles the frontend into `dist/`; `npm start` serves both the API and the compiled SPA from Express on `PORT` (default 3001).
- **Database:** SQLite file at `data/writers-realm.db`, created and seeded automatically on first start.
- **Auth:** JWT stored in `localStorage` and sent as `Authorization: Bearer <token>`; passwords hashed with bcrypt.
- **Uploads:** `multer` with disk storage into `uploads/`, filenames prefixed with UUID; only `image/jpeg`, `image/png`, `image/webp` accepted. Video MIME types are explicitly rejected with bilingual errors.

---

## 2. Database Schema (SQLite)

### `users`
| Column | Type | Notes |
| --- | --- | --- |
| `id` | INTEGER PRIMARY KEY AUTOINCREMENT | |
| `email` | TEXT UNIQUE NOT NULL | lowercase |
| `password_hash` | TEXT NOT NULL | bcrypt |
| `author_name` | TEXT NOT NULL | Author Name / စာရေးဆရာ အမည် |
| `pen_name` | TEXT NOT NULL | Pen Name / ကလောင်အမည် (badge) |
| `bio` | TEXT NOT NULL DEFAULT '' | Bio |
| `avatar_url` | TEXT DEFAULT NULL | `/uploads/<file>` |
| `created_at` | TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP | |

### `posts`
| Column | Type | Notes |
| --- | --- | --- |
| `id` | INTEGER PRIMARY KEY AUTOINCREMENT | |
| `user_id` | INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE | author |
| `category` | TEXT NOT NULL CHECK IN ('poem','story','general') | tab |
| `title` | TEXT NOT NULL | |
| `body` | TEXT NOT NULL | poem / story text |
| `image_url` | TEXT DEFAULT NULL | `/uploads/<file>` |
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

Indexes are created on `posts(category, created_at)`, `reactions(post_id)`, `comments(post_id)`, `shares(post_id)`.

---

## 3. API Reference

| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| POST | `/api/auth/register` | no | Register (author_name, pen_name, email, password, bio?, avatar?) |
| POST | `/api/auth/login` | no | Login, returns `{ token, user }` |
| GET | `/api/auth/me` | yes | Current user |
| PATCH | `/api/users/me` | yes | Update author_name, pen_name, bio, avatar |
| GET | `/api/users/featured` | no | Featured writers with stats |
| GET | `/api/users/trending` | no | Trending categories/tags with counts |
| GET | `/api/posts?category=&limit=` | no | Feed, newest first, with author, reaction counts, viewer reaction, comment/share counts |
| GET | `/api/posts/:id` | no | Single post |
| POST | `/api/posts` | yes | Create post (multipart: category, title, body, image) |
| DELETE | `/api/posts/:id` | yes (owner) | Delete post |
| POST | `/api/posts/:id/react` | yes | `{ type: 'love'|'haha'|'sad' }` toggle/switch |
| GET | `/api/posts/:id/comments` | no | Comments list |
| POST | `/api/posts/:id/comments` | yes | Add comment |
| DELETE | `/api/posts/:id/comments/:commentId` | yes (owner) | Delete comment |
| POST | `/api/posts/:id/share` | optional | `{ kind: 'repost'|'link' }`; repost requires auth, link share works anonymously |
| GET | `/api/health` | no | Health check |

All errors return `{ error: string }`; validation errors include a `message` in the active language supplied via `Accept-Language` (`en`/`my`) header.

---

## 4. Requirements

### 4.1 Layout & Theme
- Opens directly into a responsive 3-column feed: left navigation/categories, center composer + feed, right featured writers + trending.
- Below `lg`, right column hides; below `md`, left column collapses into horizontal category chips and bottom navigation.
- Light theme: warm parchment/cream with amber/terracotta accents. Dark theme: deep ink/slate with warm gold accents.
- Theme toggle persisted in `localStorage` and applied via `class="dark"` on `<html>`.

### 4.2 Bilingual Support
- `EN`/`MY` header toggle persisted in `localStorage`.
- Every UI label, button, placeholder, category name, toast, and server validation message has an English and Burmese string.
- Post content remains user-generated (not translated).

### 4.3 Writer Profiles
- Register/login with email + password.
- Author name, pen name shown as a prominent badge next to names everywhere, bio, profile picture upload.
- Profile edit modal; avatar and pen name displayed on posts and comments.

### 4.4 Composer & Strict No-Video Policy
- Tabs: ကဗျာ (Poem), ဝတ္ထုတို (Short Story), အထွေထွေ (General).
- Image attachments only: `.jpg`, `.jpeg`, `.png`, `.webp`; frontend `accept="image/*"` plus explicit extension validation; backend multer `fileFilter` plus a second MIME/extension check rejecting `video/*` with a clear EN/MY error.
- Max upload size 8 MB.

### 4.5 Social Interactions
- Reactions: Love (အသည်း ❤️), Haha (ဟဟ 😂), Sad (ငိုတာ 😢) with live counts; clicking active one removes it, clicking another switches it.
- Comments visible/expandable on all post types; owner can delete own comments.
- Share: "Repost to Feed" (creates a repost entry in the feed) and "Copy Post Link" (clipboard + toast).

### 4.6 Seed Data
- Two sample Myanmar writers with pen names, bios, and avatars (initials-based placeholder).
- Multiple sample poems (ကဗျာ) and short stories (ဝတ္ထုတို) in Burmese plus a few general posts.
- Seed reactions and comments so counters and threads look alive on first launch.
- Demo login (also available as a one-click button in the sign-in modal): `kabya-moe@writersrealm.local` / `writer123` (second writer: `kalone-ni@writersrealm.local` / `writer123`).

### 4.7 Verification
- `npm run build` (TypeScript + Vite) must pass with zero errors.
- `npm test` (node:test backend suite) must pass.
- Startup instructions documented in this file (see §6).

---

## 5. Security & Validation Notes

- Passwords hashed with bcrypt (cost 10); never returned by API.
- JWT secret from `JWT_SECRET` env var with a dev-only fallback.
- Parameterized SQL statements via `better-sqlite3` (no string interpolation of user input).
- Uploaded files served statically from `/uploads` with strict MIME filtering; original filenames discarded.
- Request body limits: 100 kB JSON, 8 MB multipart.
- No video bytes ever accepted or stored.

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
The SQLite database and `uploads/` folder are created automatically on first launch and seeded with sample writers/posts.

Optional environment variables (see `.env.example`):

```
PORT=3001
JWT_SECRET=replace-with-a-long-random-string
```
