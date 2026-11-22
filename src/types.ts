import type { Category, ReactionType } from './i18n'

export interface Author {
  id: number
  authorName: string
  penName: string
  avatarUrl: string | null
}

export interface PostCounts {
  love: number
  haha: number
  sad: number
  comments: number
  shares: number
  viewerReaction?: ReactionType | null
}

export interface PostRepostInfo {
  id: number
  title: string
  authorName: string
  penName: string
  userId: number
}

export interface Post {
  id: number
  category: Category
  title: string
  body: string
  imageUrl: string | null
  repostOf: number | null
  createdAt: string
  author: Author
  counts: PostCounts
  viewerReaction: ReactionType | null
  bookmarked: boolean
  repost: PostRepostInfo | null
}

export interface Comment {
  id: number
  body: string
  createdAt: string
  author: Author
}

export interface User extends Author {
  bio: string
  createdAt: string
  isAdmin: boolean
  followers?: number
  following?: number
  isFollowing?: boolean
}

export interface FeedbackEntry {
  id: number
  category: 'suggestion' | 'bug' | 'other'
  message: string
  createdAt: string
  user: Pick<Author, 'id' | 'authorName' | 'penName' | 'avatarUrl'>
}

export interface Writer extends User {
  postCount: number
  stats: { posts: number; comments: number; reactions: number }
}

export interface Trend {
  category: Category
  count: number
}

export interface AuthResponse {
  token: string
  user: User
}
