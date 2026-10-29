// Crea los buckets privados de Storage (protocolos y COA). Se puede correr varias veces.
// Uso: node --env-file=.env.local scripts/crear-buckets.mjs
import { createClient } from "@supabase/supabase-js"

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const BUCKETS = [
  { id: "protocolos", tipos: ["application/pdf"] },
  { id: "coas", tipos: ["application/pdf", "image/png", "image/jpeg"] },
]

for (const b of BUCKETS) {
  const { error } = await admin.storage.createBucket(b.id, { public: false, fileSizeLimit: "10MB", allowedMimeTypes: b.tipos })
  if (error && !/already exists/i.test(error.message)) throw error
  console.log(`${b.id}: ${error ? "ya existía" : "creado"} (privado)`)
}
