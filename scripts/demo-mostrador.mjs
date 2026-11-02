// Datos de demostración para enseñar el mostrador en vivo: una persona de mostrador con PIN,
// lotes con piezas (costo $1, ficticio) y tres clientes inventados.
// Uso:
//   node --env-file=.env.local scripts/demo-mostrador.mjs crear   → guarda el PIN en .env.local (PIN_DEMO_MOSTRADOR)
//   node --env-file=.env.local scripts/demo-mostrador.mjs borrar  → quita todo lo de la demo, incluidas sus ventas
import { createClient } from "@supabase/supabase-js"
import { randomBytes, randomInt } from "node:crypto"
import { appendFileSync, readFileSync, writeFileSync } from "node:fs"

const NOMBRE = "Mostrador Demo"
const ORIGEN = "DEMO"
const CLIENTES = [
  { nombre: "Cliente Demo Uno", whatsapp: "8100000091", tipo: "paciente", waiver: true },
  { nombre: "Cliente Demo Dos", whatsapp: "8100000092", tipo: "paciente", waiver: false },
  { nombre: "Doctora Demo", whatsapp: "8100000093", tipo: "medico", waiver: true },
]

const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const ok = (r, que) => {
  if (r.error) throw new Error(`${que}: ${r.error.message}`)
  return r.data
}

async function crear() {
  const ya = ok(await s.from("personas").select("id").eq("nombre", NOMBRE), "buscar persona")
  if (ya.length) throw new Error("La demo ya existe. Bórrala primero con: borrar")

  const persona = ok(await s.from("personas").insert({ nombre: NOMBRE, whatsapp: "8100000090", perfil: "mostrador", estado: "activo" }).select("id").single(), "persona")
  const usuario = ok(
    await s.auth.admin.createUser({ email: `p-${persona.id}@personas.crm.peptique.com.mx`, email_confirm: true, password: randomBytes(24).toString("base64url"), user_metadata: { persona_id: persona.id } }),
    "usuario",
  )
  ok(await s.from("personas").update({ auth_user_id: usuario.user.id }).eq("id", persona.id), "ligar usuario")
  const pin = String(randomInt(0, 10000)).padStart(4, "0")
  ok(await s.rpc("asignar_pin", { p_persona: persona.id, p_pin: pin }), "PIN")
  appendFileSync(".env.local", `\n# Demo del mostrador (se borra con scripts/demo-mostrador.mjs borrar)\nPIN_DEMO_MOSTRADOR=${pin}\n`)

  // Una pieza de cada producto visible con precio, para que el catálogo del mostrador se vea completo.
  const productos = ok(await s.from("productos").select("id").eq("visible", true).not("precio_publico", "is", null), "productos")
  const hoy = new Date(Date.now() - 6 * 3600000).toISOString().slice(0, 10)
  const lotes = ok(
    await s
      .from("lotes")
      .insert(productos.map((p, i) => ({ codigo: `LOT-DEMO-${String(i + 1).padStart(3, "0")}`, producto_id: p.id, lote_origen: ORIGEN, llegada: hoy, piezas_recibidas: 10, costo_pieza_mxn: 1 })))
      .select("id"),
    "lotes",
  )
  ok(await s.from("movimientos_inventario").insert(lotes.map((l) => ({ lote_id: l.id, tipo: "entrada", bolsa: "general", cantidad: 10, persona_id: persona.id, nota: "demo" }))), "existencias")

  ok(
    await s.from("clientes").insert(
      CLIENTES.map((c) => ({ nombre: c.nombre, whatsapp: c.whatsapp, tipo: c.tipo, origen: "Demo", ...(c.waiver ? { waiver_firmado_en: new Date().toISOString(), waiver_nombre: c.nombre } : {}) })),
    ),
    "clientes",
  )
  console.log(`Listo: "${NOMBRE}" (perfil Mostrador), ${lotes.length} productos con 10 piezas y ${CLIENTES.length} clientes de demo. El PIN quedó en .env.local como PIN_DEMO_MOSTRADOR.`)
}

async function borrar() {
  const personas = ok(await s.from("personas").select("id, auth_user_id, creado_en").eq("nombre", NOMBRE), "persona")
  const clientes = ok(await s.from("clientes").select("id").in("whatsapp", CLIENTES.map((c) => c.whatsapp)), "clientes")
  const pid = personas.map((p) => p.id)
  const cid = clientes.map((c) => c.id)
  const ventas = [
    ...(pid.length ? ok(await s.from("ventas").select("id").in("vendedor_id", pid), "ventas") : []),
    ...(cid.length ? ok(await s.from("ventas").select("id").in("cliente_id", cid), "ventas") : []),
  ]
  const vid = [...new Set(ventas.map((v) => v.id))]
  const lotes = ok(await s.from("lotes").select("id").eq("lote_origen", ORIGEN), "lotes").map((l) => l.id)
  if (vid.length) {
    for (const t of ["pagos", "comisiones", "dosis_aplicadas", "avisos_recompra", "venta_partidas", "movimientos_inventario"]) ok(await s.from(t).delete().in("venta_id", vid), t)
    ok(await s.from("ventas").delete().in("id", vid), "ventas")
  }
  if (cid.length) ok(await s.from("avisos_recompra").delete().in("cliente_id", cid), "avisos")
  if (lotes.length) {
    ok(await s.from("movimientos_inventario").delete().in("lote_id", lotes), "movimientos")
    ok(await s.from("lotes").delete().in("id", lotes), "lotes")
  }
  if (cid.length) ok(await s.from("clientes").delete().in("id", cid), "clientes")
  // Clientes que se dieron de alta durante la demo y se quedaron sin ventas.
  let nuevos = 0
  if (personas.length) {
    const desde = personas.map((p) => p.creado_en).sort()[0]
    const recientes = ok(await s.from("clientes").select("id, ventas(id)").gte("creado_en", desde), "clientes nuevos")
    const sinVentas = recientes.filter((c) => !c.ventas?.length).map((c) => c.id)
    if (sinVentas.length) ok(await s.from("clientes").delete().in("id", sinVentas), "clientes nuevos")
    nuevos = sinVentas.length
  }
  if (pid.length) {
    ok(await s.from("cortes_caja").delete().in("abierta_por", pid), "cortes")
    ok(await s.from("bitacora").delete().in("persona_id", pid), "bitácora")
    ok(await s.from("personas").delete().in("id", pid), "persona")
    for (const p of personas) if (p.auth_user_id) await s.auth.admin.deleteUser(p.auth_user_id)
  }
  const env = readFileSync(".env.local", "utf8").replace(/\n?# Demo del mostrador[^\n]*\nPIN_DEMO_MOSTRADOR=\d+\n?/g, "\n")
  writeFileSync(".env.local", env)
  console.log(`Demo borrada: ${vid.length} ventas, ${lotes.length} lotes, ${cid.length + nuevos} clientes.`)
}

const accion = process.argv[2]
if (accion === "crear") await crear()
else if (accion === "borrar") await borrar()
else console.error("Uso: node --env-file=.env.local scripts/demo-mostrador.mjs crear|borrar")
