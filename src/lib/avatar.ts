/** Where a profile photo is served from (the public avatars bucket); null without one. */
export const avatarUrl = (path: string | null | undefined) =>
  path ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/avatars/${path}` : null

/** The colours people can pick for an initials avatar: the overtrue chart palette, readable with white text. */
export const AVATAR_COLORS = ['#2a5bff', '#0e9767', '#c27a05', '#9157f1', '#dc4797', '#0891b2', '#e5484d', '#475569'] as const
