// Copia los datos del CRM de un Supabase a otro (de la nube al servidor propio).
// El destino debe tener ya las migraciones de supabase/migrations y los buckets, y estar vacío.
// Solo lee del origen. Los usuarios de acceso se crean de nuevo en el destino y los PIN se conservan
// porque viven en personas.pin_hash. Al final compara cuántos renglones hay en cada tabla.
//
// Uso (las llaves van en un archivo, no en la línea de comandos):
//   node --env-file=deploy/mudanza.env deploy/copiar-datos.mjs
// con ORIGEN_URL, ORIGEN_LLAVE, DESTINO_URL y DESTINO_LLAVE (llaves secretas / service_role).
import { createClient } from "@supabase/supabase-js"
import { randomBytes } from "node:crypto"

const opciones = { auth: { persistSession: false, autoRefreshToken: false } }
const origen = createClient(process.env.ORIGEN_URL, process.env.ORIGEN_LLAVE, opciones)
const destino = createClient(process.env.DESTINO_URL, process.env.DESTINO_LLAVE, opciones)
const ok = (r, que) => {
  if (r.error) throw new Error(`${que}: ${r.error.message}`)
  return r.data
}

// En orden de dependencias. personas y clientes se refieren a sí mismas: esas columnas se llenan después.
const TABLAS = [
  "personas", "productos", "protocolos", "lotes", "clientes", "ventas", "venta_partidas", "movimientos_inventario",
  "pagos", "dosis_aplicadas", "comisiones", "cortes_caja", "avisos_recompra", "plan_mensual", "plan_producto",
  "gastos_fijos", "configuracion", "bitacora",
]
const DESPUES = { personas: ["distribuidor_id", "creado_por", "auth_user_id"], clientes: ["referido_por"] }
const TROZO = 500

async function todo(tabla) {
  const filas = []
  for (let desde = 0; ; desde += 1000) {
    let q = origen.from(tabla).select("*")
    if (tabla === "bitacora") q = q.order("id") // conserva el orden de la bitácora
    const pagina = ok(await q.range(desde, desde + 999), `leer ${tabla}`)
    filas.push(...pagina)
    if (pagina.length < 1000) return filas
  }
}

const cuenta = async (cliente, tabla) => (await cliente.from(tabla).select("*", { count: "exact", head: true })).count

for (const t of ["personas", "productos", "ventas"])
  if ((await cuenta(destino, t)) > 0) throw new Error(`El destino ya tiene ${t}. Esta copia solo se hace sobre una base vacía.`)

const datos = {}
for (const tabla of TABLAS) {
  const filas = await todo(tabla)
  datos[tabla] = filas
  const quitar = DESPUES[tabla] ?? []
  const limpias = filas.map((f) => {
    const c = { ...f }
    for (const k of quitar) delete c[k]
    if (tabla === "bitacora") delete c.id // identidad generada por la base
    return c
  })
  for (let i = 0; i < limpias.length; i += TROZO) {
    const trozo = limpias.slice(i, i + TROZO)
    if (tabla === "configuracion") ok(await destino.from(tabla).upsert(trozo, { onConflict: "clave" }), `copiar ${tabla}`)
    else ok(await destino.from(tabla).insert(trozo), `copiar ${tabla}`)
  }
  console.log(`${tabla}: ${filas.length}`)
}

// Referencias a la misma tabla
for (const [tabla, cols] of Object.entries(DESPUES))
  for (const f of datos[tabla]) {
    const cambio = Object.fromEntries(cols.filter((c) => c !== "auth_user_id" && f[c]).map((c) => [c, f[c]]))
    if (Object.keys(cambio).length) ok(await destino.from(tabla).update(cambio).eq("id", f.id), `ligar ${tabla}`)
  }

// Usuarios de acceso: uno nuevo por persona que tenía acceso, con el mismo correo interno.
let usuarios = 0
for (const p of datos.personas.filter((x) => x.auth_user_id)) {
  const anterior = ok(await origen.auth.admin.getUserById(p.auth_user_id), "leer usuario").user
  const nuevo = ok(
    await destino.auth.admin.createUser({
      email: anterior.email,
      email_confirm: true,
      password: randomBytes(24).toString("base64url"),
      user_metadata: { persona_id: p.id },
    }),
    "crear usuario",
  )
  ok(await destino.from("personas").update({ auth_user_id: nuevo.user.id }).eq("id", p.id), "ligar usuario")
  usuarios++
}
console.log(`usuarios de acceso: ${usuarios}`)

// Comparación final
let diferencias = 0
for (const tabla of TABLAS) {
  const [a, b] = [await cuenta(origen, tabla), await cuenta(destino, tabla)]
  if (a !== b) {
    diferencias++
    console.log(`DIFERENTE ${tabla}: origen ${a}, destino ${b}`)
  }
}
console.log(diferencias ? `Hay ${diferencias} tablas con diferencias.` : "Todas las tablas coinciden.")
