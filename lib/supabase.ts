import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type LeaderboardEntry = {
  id: string
  user_address: string
  username: string | null
  total_spins: number
  unique_coins: number
  best_streak: number
  rare_finds: number
  created_at: string
  updated_at: string
}