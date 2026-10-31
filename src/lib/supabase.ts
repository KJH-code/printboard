import { createClient } from '@supabase/supabase-js'
import { supabaseConfigured, supabasePublishableKey, supabaseUrl } from './config'

export const supabase = supabaseConfigured
  ? createClient(supabaseUrl!, supabasePublishableKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null
