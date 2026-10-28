// Crea el primer administrador (persona + usuario de Supabase Auth + PIN).
// Uso: node --env-file=.env.local scripts/crear-admin.mjs "Nombre Apellido" "81 1234 5678" 1234 [correo@real.com]
// Requiere NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SECRET_KEY en .env.local.
import { createClient } from "@supabase/supabase-js"
import { randomBytes } from "node:crypto"

const [nombre, whatsapp, pin, correo] = process.argv.slice(2)
if (!nombre || !whatsapp || !/^[0-9]{4}$/.test(pin ?? "")) {
  console.error('Uso: node --env-file=.env.local scripts/crear-admin.mjs "Nombre" "WhatsApp" PIN [correo]')
  process.exit(1)
}

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const { data: persona, error: e1 } = await admin
  .from("personas")
  .insert({ nombre, whatsapp, perfil: "administrador", estado: "activo" })
  .select("id")
  .single()
if (e1) throw e1

const email = correo ?? `p-${persona.id}@personas.crm.peptique.com.mx`
const { data: usuario, error: e2 } = await admin.auth.admin.createUser({
  email,
  email_confirm: true,
  password: correo ? undefined : randomBytes(24).toString("base64url"),
  user_metadata: { persona_id: persona.id },
})
if (e2) throw e2

const { error: e3 } = await admin.from("personas").update({ auth_user_id: usuario.user.id }).eq("id", persona.id)
if (e3) throw e3
const { error: e4 } = await admin.rpc("asignar_pin", { p_persona: persona.id, p_pin: pin })
if (e4) throw e4

console.log(`Listo: ${nombre} es administrador. Entra en /entrar con su PIN.`)
if (correo) console.log(`Para entrar con correo, define su contraseña en Supabase → Authentication → Users → ${correo} → Send password recovery o Reset password.`)
