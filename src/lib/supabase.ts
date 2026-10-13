import { createClient } from '@supabase/supabase-js'

const rawUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

if (!rawUrl || !key) {
  throw new Error('Supabase-Konfiguration fehlt: VITE_SUPABASE_URL und VITE_SUPABASE_PUBLISHABLE_KEY setzen.')
}

// Es zählt nur die Grundadresse (https://<projekt>.supabase.co). Zusätze wie /rest/v1 oder ein
// Schrägstrich am Ende werden entfernt: supabase-js hängt /auth/v1, /rest/v1 und /storage/v1 selbst an.
let url: string
try {
  url = new URL(rawUrl.trim()).origin
} catch {
  throw new Error(`VITE_SUPABASE_URL ist keine gültige Adresse: «${rawUrl}»`)
}

// Es wird bewusst nur der öffentliche (publishable) Schlüssel verwendet.
export const supabase = createClient(url, key.trim())
