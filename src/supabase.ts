import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() ?? ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? ''

export const supabaseConfigStatus = !supabaseUrl && !supabaseAnonKey
  ? 'missing'
  : supabaseUrl && supabaseAnonKey
    ? 'configured'
    : 'incomplete'

export const supabase = supabaseConfigStatus === 'configured'
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: true,
        persistSession: true,
      },
    })
  : null

export function workspaceStorageKey(userId: string | null, key: string) {
  return userId ? `ctrlspace.user.${userId}.${key}` : key
}
