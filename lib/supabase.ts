import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

if (!url || !key) {
  throw new Error('Supabase-Konfiguration fehlt: VITE_SUPABASE_URL und VITE_SUPABASE_PUBLISHABLE_KEY setzen.')
}

// Es wird bewusst nur der öffentliche (publishable) Schlüssel verwendet.
export const supabase = createClient(url, key)
