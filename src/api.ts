import { resolveAppUrl } from './config'
import type { AuthResponse, Comment, Post, Trend, User, Writer } from './types'

export const TOKEN_KEY = 'writers-realm-token'
export const LOCALE_KEY = 'writers-realm-locale'
export const THEME_KEY = 'writers-realm-theme'

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY)
}

export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers)
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  headers.set('Accept-Language', localStorage.getItem(LOCALE_KEY) === 'my' ? 'my' : 'en')
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const response = await fetch(resolveAppUrl(`/api${path}`), { ...options, headers })
  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }
  if (!response.ok) {
    const message = (payload as { error?: string } | null)?.error || 'Something went wrong'
    throw new ApiError(message, response.status)
  }
  return payload as T
}

export interface CaptchaChallenge {
  captchaId: string
  question: string
  expiresIn: number
}

export const api = {
  me: () => apiFetch<{ user: User }>('/auth/me'),
  captcha: () => apiFetch<CaptchaChallenge>('/auth/captcha'),
  login: (email: string, password: string) => apiFetch<AuthResponse>('/auth/login', {
    method: 'POST', body: JSON.stringify({ email, password }),
  }),
  register: (data: FormData) => apiFetch<AuthResponse>('/auth/register', { method: 'POST', body: data }),
  updateProfile: (data: FormData) => apiFetch<{ user: User }>('/users/me', { method: 'PATCH', body: data }),
  featuredWriters: () => apiFetch<{ writers: Writer[] }>('/users/featured'),
  trending: () => apiFetch<{ trending: Trend[] }>('/users/trending'),
  posts: (params: { category?: string; authorId?: number; limit?: number } = {}) => {
    const query = new URLSearchParams()
    if (params.category && params.category !== 'all') query.set('category', params.category)
    if (params.authorId) query.set('authorId', String(params.authorId))
    if (params.limit) query.set('limit', String(params.limit))
    const suffix = query.toString()
    return apiFetch<{ posts: Post[] }>(`/posts${suffix ? `?${suffix}` : ''}`)
  },
  createPost: (data: FormData) => apiFetch<{ post: Post }>('/posts', { method: 'POST', body: data }),
  updatePost: (id: number, data: FormData) => apiFetch<{ post: Post }>(`/posts/${id}`, { method: 'PUT', body: data }),
  deletePost: (id: number) => apiFetch<{ success: boolean }>(`/posts/${id}`, { method: 'DELETE' }),
  react: (id: number, type: string) => apiFetch<{ counts: Post['counts'] }>(`/posts/${id}/react`, {
    method: 'POST', body: JSON.stringify({ type }),
  }),
  comments: (id: number) => apiFetch<{ comments: Comment[] }>(`/posts/${id}/comments`),
  addComment: (id: number, body: string) => apiFetch<{ comment: Comment }>(`/posts/${id}/comments`, {
    method: 'POST', body: JSON.stringify({ body }),
  }),
  deleteComment: (postId: number, commentId: number) => apiFetch<{ success: boolean }>(`/posts/${postId}/comments/${commentId}`, {
    method: 'DELETE',
  }),
  cleanSpam: () => apiFetch<{ success: boolean; deletedPosts: number; deletedUsers: number }>('/admin/spam', {
    method: 'DELETE',
  }),
  share: (id: number, kind: 'link' | 'repost') => apiFetch<{ repost: Post | null; shareCount: number }>(`/posts/${id}/share`, {
    method: 'POST', body: JSON.stringify({ kind }),
  }),
}
