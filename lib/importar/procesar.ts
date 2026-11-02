import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import { separarNombre } from "@/app/(app)/productos/importar"
import type { Sesion } from "@/lib/sesion"
import { normalizarWhatsapp, whatsappValido } from "@/lib/telefono"

import { fecha, numero, sinAcentos, type Tabla } from "./leer"
import type { FilaRevisada, TipoImportacion } from "./plantillas"

/** Lo que se va a importar: la revisión por renglón y la función que lo guarda. */
export type Plan = { filas: FilaRevisada[]; aCrear: number; aplicar: () => Promise<number> }

type Ctx = { admin: SupabaseClient; sesion: Sesion }

const ETIQUETA_IMPORTADA = "Importada"
const TROZO = 500

async function insertarPorTrozos<T extends object>(admin: SupabaseClient, tabla: string, filas: T[]) {
  for (let i = 0; i < filas.length; i += TROZO) {
    const { error } = await admin.from(tabla).insert(filas.slice(i, i + TROZO))
    if (error) throw new Error(`No se pudo guardar en ${tabla}: ${error.message}`)
  }
}

const compacto = (s: string) => sinAcentos(s).replace(/[^a-z0-9+]/g, "")

/** Busca un producto del catálogo por nombre y mg ("BPC-157 10 mg", "BPC157 10", "TIRZ-20" o los apodos del Excel). */
async function buscadorProductos(admin: SupabaseClient) {
  const { data } = await admin.from("productos").select("id, nombre, presentacion, sku")
  const productos = data ?? []
  const clave = (nombre: string, pres: string) => `${compacto(nombre)}|${pres.match(/\d+(?:\.\d+)?/)?.[0] ?? ""}`
  const porClave = new Map(productos.map((p) => [clave(p.nombre, p.presentacion), p]))
  const porSku = new Map(productos.filter((p) => p.sku).map((p) => [compacto(p.sku!), p]))
  return (texto: string, presentacion = "") => {
    const t = `${texto} ${presentacion}`.trim()
    if (!t) return null
    const s = separarNombre(t)
    return porClave.get(clave(s.nombre, s.presentacion)) ?? porSku.get(compacto(t)) ?? null
  }
}

type PersonaMin = { id: string; nombre: string; whatsapp: string; perfil: string }

/** Persona por WhatsApp o por nombre (sin acentos). */
function buscadorPersonas(personas: PersonaMin[]) {
  const porWa = new Map(personas.map((p) => [p.whatsapp, p]))
  const porNombre = new Map(personas.map((p) => [sinAcentos(p.nombre), p]))
  return (v: string) => {
    if (!v.trim()) return null
    const wa = normalizarWhatsapp(v)
    return (whatsappValido(wa) ? porWa.get(wa) : null) ?? porNombre.get(sinAcentos(v)) ?? null
  }
}

const fila = (renglon: number, resumen: string): FilaRevisada => ({ renglon, estado: "nueva", resumen, mensajes: [] })
const error = (f: FilaRevisada, m: string) => {
  f.estado = "error"
  f.mensajes.push(m)
}

// ───────────── Red comercial ─────────────

async function planRed(t: Tabla, { admin, sesion }: Ctx): Promise<Plan> {
  const { data } = await admin.from("personas").select("id, nombre, whatsapp, perfil").neq("estado", "baja")
  const existentes = data ?? []
  const buscar = buscadorPersonas(existentes)
  const filas: FilaRevisada[] = []
  const nuevas: { f: FilaRevisada; nombre: string; whatsapp: string; perfil: "distribuidor" | "comisionista"; invito: string; zona: string | null }[] = []
  const enArchivo = new Map<string, string>()

  for (const { renglon, datos } of t.filas) {
    const nombre = datos.nombre ?? ""
    const wa = normalizarWhatsapp(datos.whatsapp ?? "")
    const tipo = sinAcentos(datos.tipo ?? "")
    const perfil = tipo.startsWith("dist") ? "distribuidor" : tipo.startsWith("com") ? "comisionista" : null
    const f = fila(renglon, `${nombre || "Sin nombre"} · ${perfil === "distribuidor" ? "Distribuidor" : perfil === "comisionista" ? "Comisionista" : datos.tipo || "sin tipo"}`)
    filas.push(f)
    if (nombre.length < 3) error(f, "Falta el nombre.")
    if (!whatsappValido(wa)) error(f, "WhatsApp no válido (10 dígitos).")
    if (!perfil) error(f, "Tipo: escribe Distribuidor o Comisionista.")
    if (f.estado === "error") continue
    if (enArchivo.has(wa)) {
      error(f, `WhatsApp repetido en el archivo (renglón ${enArchivo.get(wa)}).`)
      continue
    }
    enArchivo.set(wa, String(renglon))
    const ya = existentes.find((p) => p.whatsapp === wa && (p.perfil === "distribuidor" || p.perfil === "comisionista"))
    if (ya) {
      f.estado = "existe"
      f.mensajes.push(`Ya está en la red como ${ya.nombre}.`)
      continue
    }
    nuevas.push({ f, nombre, whatsapp: wa, perfil: perfil!, invito: datos.invito ?? "", zona: datos.zona || null })
  }

  // El distribuidor de un comisionista puede venir en el mismo archivo.
  const distNuevos = new Map(nuevas.filter((n) => n.perfil === "distribuidor").flatMap((n) => [[n.whatsapp, n] as const, [sinAcentos(n.nombre), n] as const]))
  for (const n of nuevas) {
    if (n.perfil === "distribuidor" && n.invito) n.f.mensajes.push("Los distribuidores no van debajo de otro; se ignora “Invitó”.")
    if (n.perfil !== "comisionista") continue
    const enBd = buscar(n.invito)
    const enArch = distNuevos.get(normalizarWhatsapp(n.invito)) ?? distNuevos.get(sinAcentos(n.invito))
    if (!n.invito) error(n.f, "Un comisionista necesita a su distribuidor en “Invitó”.")
    else if (enBd && enBd.perfil !== "distribuidor") error(n.f, `${enBd.nombre} no es distribuidor.`)
    else if (!enBd && !enArch) error(n.f, `No encontramos al distribuidor “${n.invito}”.`)
    else n.f.mensajes.push(`Equipo de ${enBd?.nombre ?? enArch!.nombre}.`)
  }

  const validas = nuevas.filter((n) => n.f.estado === "nueva")
  return {
    filas,
    aCrear: validas.length,
    aplicar: async () => {
      const ids = new Map<string, string>()
      const dist = validas.filter((n) => n.perfil === "distribuidor")
      const base = { estado: "activo", creado_por: sesion.personaId }
      if (dist.length) {
        const { data: creados, error: e } = await admin
          .from("personas")
          .insert(dist.map((n) => ({ ...base, nombre: n.nombre, whatsapp: n.whatsapp, perfil: "distribuidor", zona: n.zona })))
          .select("id, whatsapp")
        if (e) throw new Error("No se pudieron guardar los distribuidores.")
        for (const c of creados ?? []) ids.set(c.whatsapp, c.id)
      }
      const com = validas.filter((n) => n.perfil === "comisionista")
      if (com.length)
        await insertarPorTrozos(
          admin,
          "personas",
          com.map((n) => {
            const enArch = distNuevos.get(normalizarWhatsapp(n.invito)) ?? distNuevos.get(sinAcentos(n.invito))
            return { ...base, nombre: n.nombre, whatsapp: n.whatsapp, perfil: "comisionista", zona: n.zona, distribuidor_id: buscar(n.invito)?.id ?? ids.get(enArch!.whatsapp) }
          }),
        )
      return validas.length
    },
  }
}

// ───────────── Clientes ─────────────

const TIPOS_CLIENTE: Record<string, "paciente" | "medico" | "distribuidor"> = { paciente: "paciente", medico: "medico", doctor: "medico", distribuidor: "distribuidor" }

async function planClientes(t: Tabla, { admin }: Ctx): Promise<Plan> {
  const [{ data: cl }, { data: per }] = await Promise.all([admin.from("clientes").select("whatsapp, nombre"), admin.from("personas").select("id, nombre, whatsapp, perfil").neq("estado", "baja")])
  const existentes = new Map((cl ?? []).map((c) => [c.whatsapp, c.nombre]))
  const persona = buscadorPersonas(per ?? [])
  const filas: FilaRevisada[] = []
  const nuevos: Record<string, unknown>[] = []
  const enArchivo = new Map<string, number>()

  for (const { renglon, datos } of t.filas) {
    const nombre = datos.nombre ?? ""
    const wa = normalizarWhatsapp(datos.whatsapp ?? "")
    const f = fila(renglon, nombre || "Sin nombre")
    filas.push(f)
    if (nombre.length < 3) error(f, "Falta el nombre.")
    if (!whatsappValido(wa)) error(f, "WhatsApp no válido (10 dígitos).")
    const tipoTxt = sinAcentos(datos.tipo ?? "")
    const tipo = tipoTxt ? TIPOS_CLIENTE[tipoTxt.split(" ")[0]] : "paciente"
    if (!tipo) error(f, "Tipo: Paciente, Médico o Distribuidor.")
    const correo = (datos.correo ?? "").trim()
    if (correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) error(f, "Correo no válido.")
    if (f.estado === "error") continue
    if (enArchivo.has(wa)) {
      error(f, `WhatsApp repetido en el archivo (renglón ${enArchivo.get(wa)}).`)
      continue
    }
    enArchivo.set(wa, renglon)
    if (existentes.has(wa)) {
      f.estado = "existe"
      f.mensajes.push(`Ya existe como ${existentes.get(wa)}.`)
      continue
    }
    const atiende = persona(datos.atiende ?? "")
    if (datos.atiende && !atiende) f.mensajes.push(`No encontramos a “${datos.atiende}”; queda sin asignar.`)
    const etiquetas = [...new Set((datos.etiquetas ?? "").split(/[,;]/).map((e) => e.trim().slice(0, 30)).filter(Boolean))].slice(0, 10)
    nuevos.push({ nombre, whatsapp: wa, tipo, correo: correo || null, etiquetas, vendedor_id: atiende?.id ?? null, origen: datos.origen || "Importación" })
  }
  return { filas, aCrear: nuevos.length, aplicar: async () => (await insertarPorTrozos(admin, "clientes", nuevos), nuevos.length) }
}

// ───────────── Inventario por lote ─────────────

async function planInventario(t: Tabla, { admin, sesion }: Ctx): Promise<Plan> {
  const producto = await buscadorProductos(admin)
  const { data: lotes } = await admin.from("lotes").select("producto_id, lote_origen")
  const yaHay = new Set((lotes ?? []).filter((l) => l.lote_origen).map((l) => `${l.producto_id}|${sinAcentos(l.lote_origen!)}`))
  const hoy = new Date(Date.now() - 6 * 3600000).toISOString().slice(0, 10)
  const filas: FilaRevisada[] = []
  const nuevos: { producto_id: string; lote_origen: string | null; llegada: string; piezas: number; usd: number | null; tc: number | null; mxn: number }[] = []
  const enArchivo = new Set<string>()

  for (const { renglon, datos } of t.filas) {
    const p = producto(datos.producto ?? "", datos.presentacion ?? "")
    const piezas = numero(datos.piezas ?? "")
    const f = fila(renglon, `${p ? `${p.nombre} ${p.presentacion}` : datos.producto || "Sin producto"} · ${piezas ?? "?"} pzas${datos.lote ? ` · lote ${datos.lote}` : ""}`)
    filas.push(f)
    if (!p) error(f, `No encontramos “${[datos.producto, datos.presentacion].filter(Boolean).join(" ")}” en el catálogo.`)
    if (piezas === null || !Number.isInteger(piezas) || piezas < 1) error(f, "Piezas: número entero mayor a 0.")
    const usd = numero(datos.costo_usd ?? "")
    const tc = numero(datos.tipo_cambio ?? "")
    const mxnDirecto = numero(datos.costo_mxn ?? "")
    let mxn: number | null = null
    if (usd !== null && usd > 0) {
      if (tc === null || !(tc > 0) || tc > 100) error(f, "Costo en USD sin tipo de cambio válido.")
      else mxn = Math.round(usd * tc * 100) / 100
    } else if (mxnDirecto !== null && mxnDirecto > 0) mxn = mxnDirecto
    else error(f, "Falta el costo por pieza (MXN, o USD con tipo de cambio).")
    let llegada = datos.llegada ? fecha(datos.llegada) : hoy
    if (!llegada) error(f, `Fecha de llegada no válida: “${datos.llegada}”.`)
    else if (llegada > hoy) error(f, "La fecha de llegada es futura.")
    if (!datos.llegada) f.mensajes.push("Sin fecha de llegada; se usa hoy.")
    if (f.estado === "error" || !p) continue
    const llave = datos.lote ? `${p.id}|${sinAcentos(datos.lote)}` : null
    if (llave && enArchivo.has(llave)) {
      error(f, "Lote repetido en el archivo.")
      continue
    }
    if (llave) enArchivo.add(llave)
    if (llave && yaHay.has(llave)) {
      f.estado = "existe"
      f.mensajes.push("Ese lote ya está en el inventario.")
      continue
    }
    llegada = llegada!
    nuevos.push({ producto_id: p.id, lote_origen: datos.lote || null, llegada, piezas: piezas!, usd: usd && usd > 0 ? usd : null, tc: usd && usd > 0 ? tc : null, mxn: mxn! })
  }

  return {
    filas,
    aCrear: nuevos.length,
    aplicar: async () => {
      // Códigos consecutivos por año, a partir del último que exista.
      const siguiente = new Map<string, number>()
      for (const n of nuevos) {
        const anio = n.llegada.slice(0, 4)
        if (!siguiente.has(anio)) {
          const { data } = await admin.from("lotes").select("codigo").like("codigo", `LOT-MX-${anio}-%`).order("codigo", { ascending: false }).limit(1)
          siguiente.set(anio, Number(data?.[0]?.codigo.slice(`LOT-MX-${anio}-`.length) ?? 0) + 1)
        }
      }
      const filasLote = nuevos.map((n) => {
        const anio = n.llegada.slice(0, 4)
        const k = siguiente.get(anio)!
        siguiente.set(anio, k + 1)
        return { codigo: `LOT-MX-${anio}-${String(k).padStart(3, "0")}`, producto_id: n.producto_id, lote_origen: n.lote_origen, llegada: n.llegada, piezas_recibidas: n.piezas, costo_pieza_usd: n.usd, tipo_cambio: n.tc, costo_pieza_mxn: n.mxn }
      })
      let hechos = 0
      for (let i = 0; i < filasLote.length; i += TROZO) {
        const trozo = filasLote.slice(i, i + TROZO)
        const { data: creados, error: e } = await admin.from("lotes").insert(trozo).select("id, codigo, piezas_recibidas")
        if (e || !creados) throw new Error(`Se importaron ${hechos} lotes; el resto falló. Revisa Inventario antes de reintentar.`)
        const { error: em } = await admin
          .from("movimientos_inventario")
          .insert(creados.map((l) => ({ lote_id: l.id, tipo: "entrada", bolsa: "general", cantidad: l.piezas_recibidas, persona_id: sesion.personaId, nota: "importación" })))
        if (em) {
          await admin.from("lotes").delete().in("id", creados.map((l) => l.id))
          throw new Error(`Se importaron ${hechos} lotes; el resto falló. Revisa Inventario antes de reintentar.`)
        }
        hechos += creados.length
      }
      return hechos
    },
  }
}

// ───────────── Historial de ventas ─────────────

const METODOS: [RegExp, "efectivo" | "tarjeta" | "transferencia"][] = [
  [/^(efe|cash|contado)/, "efectivo"],
  [/^(tar|tdc|tdd|credito|debito|terminal|clip|visa|master|amex)/, "tarjeta"],
  [/^(trans|spei|deposito|banco)/, "transferencia"],
]

async function planHistorial(t: Tabla, { admin, sesion }: Ctx): Promise<Plan> {
  const producto = await buscadorProductos(admin)
  const [{ data: cl }, { data: per }, { data: lotes }, { data: folios }] = await Promise.all([
    admin.from("clientes").select("id, nombre, whatsapp"),
    admin.from("personas").select("id, nombre, whatsapp, perfil"),
    admin.from("lotes").select("id, producto_id, lote_origen"),
    admin.from("ventas").select("folio").like("folio", "H-%"),
  ])
  const persona = buscadorPersonas(per ?? [])
  const clientePorWa = new Map((cl ?? []).map((c) => [c.whatsapp, c]))
  const clientesPorNombre = new Map<string, { id: string; nombre: string }[]>()
  for (const c of cl ?? []) clientesPorNombre.set(sinAcentos(c.nombre), [...(clientesPorNombre.get(sinAcentos(c.nombre)) ?? []), c])
  const lotePor = new Map((lotes ?? []).filter((l) => l.lote_origen).map((l) => [`${l.producto_id}|${sinAcentos(l.lote_origen!)}`, l.id]))
  const foliosHechos = new Set((folios ?? []).map((f) => f.folio))
  const hoy = new Date(Date.now() - 6 * 3600000).toISOString().slice(0, 10)

  type Linea = { f: FilaRevisada; producto_id: string; lote_id: string | null; cantidad: number; importe: number }
  type Venta = { folio: string; fecha: string; cliente: { id?: string; nombre: string; whatsapp: string | null }; vendedor: PersonaMin | null; metodo: "efectivo" | "tarjeta" | "transferencia"; lineas: Linea[]; filas: FilaRevisada[] }
  const ventas = new Map<string, Venta>()
  const filas: FilaRevisada[] = []

  for (const { renglon, datos } of t.filas) {
    const p = producto(datos.producto ?? "", datos.presentacion ?? "")
    const piezas = numero(datos.piezas ?? "")
    const f = fila(renglon, "")
    filas.push(f)
    const dia = fecha(datos.fecha ?? "")
    if (!dia) error(f, `Fecha no válida: “${datos.fecha ?? ""}”.`)
    else if (dia > hoy) error(f, "La fecha es futura.")
    if (!p) error(f, `No encontramos “${[datos.producto, datos.presentacion].filter(Boolean).join(" ")}” en el catálogo.`)
    if (piezas === null || !Number.isInteger(piezas) || piezas < 1) error(f, "Piezas: número entero mayor a 0.")
    const precio = numero(datos.precio ?? "")
    const importeTxt = numero(datos.importe ?? "")
    const importe = importeTxt ?? (precio !== null && piezas ? precio * piezas : null)
    if (importe === null || importe < 0) error(f, "Falta el precio por pieza o el importe.")
    const metodoTxt = sinAcentos(datos.metodo ?? "")
    const metodo = metodoTxt ? METODOS.find(([re]) => re.test(metodoTxt))?.[1] : "efectivo"
    if (!metodo) error(f, `Forma de pago no reconocida: “${datos.metodo}”.`)

    const folioOriginal = (datos.folio ?? "").trim()
    // Sin folio, cada renglón es su propia venta; el folio sale de la fecha y el renglón para que volver a subir el mismo archivo no duplique.
    const folio = `H-${folioOriginal ? folioOriginal.replace(/^H-/i, "").slice(0, 30) : `${(dia ?? "").replace(/-/g, "")}-${renglon}`}`
    f.resumen = `${folio} · ${dia ?? "?"} · ${datos.cliente || "Sin cliente"} · ${p ? `${p.nombre} ${p.presentacion}` : datos.producto || "?"} × ${piezas ?? "?"}`

    // Cliente: por WhatsApp, si no por nombre (solo si no hay dos con el mismo nombre).
    const wa = normalizarWhatsapp(datos.whatsapp ?? "")
    let cliente: Venta["cliente"] | null = null
    if (whatsappValido(wa)) cliente = clientePorWa.get(wa) ?? { nombre: datos.cliente ?? "", whatsapp: wa }
    else {
      const mismos = clientesPorNombre.get(sinAcentos(datos.cliente ?? "")) ?? []
      if (mismos.length === 1) cliente = mismos[0] as Venta["cliente"]
      else if (mismos.length > 1) error(f, `Hay ${mismos.length} clientes llamados “${datos.cliente}”; agrega su WhatsApp.`)
      else error(f, `“${datos.cliente || "Sin nombre"}” no existe; agrega su WhatsApp para darlo de alta.`)
    }
    if (cliente && !cliente.id && (cliente.nombre ?? "").length < 3) error(f, "Falta el nombre del cliente.")

    const vendedor = persona(datos.vendio ?? "")
    if (datos.vendio && !vendedor) f.mensajes.push(`No encontramos a “${datos.vendio}”; queda a nombre de quien importa.`)

    if (foliosHechos.has(folio)) {
      f.estado = "existe"
      f.mensajes = ["Esta venta ya se importó."]
      continue
    }
    const loteId = p && datos.lote ? (lotePor.get(`${p.id}|${sinAcentos(datos.lote)}`) ?? null) : null
    if (p && datos.lote && !loteId) f.mensajes.push(`No encontramos el lote “${datos.lote}”; se guarda sin lote.`)

    const v = ventas.get(folio) ?? { folio, fecha: dia ?? "", cliente: cliente ?? { nombre: "", whatsapp: null }, vendedor, metodo: metodo ?? "efectivo", lineas: [], filas: [] }
    if (ventas.has(folio)) {
      if (dia && v.fecha && dia !== v.fecha) error(f, `El folio ${folioOriginal} tiene otra fecha en otro renglón.`)
      if (cliente && v.cliente.whatsapp && cliente.whatsapp && cliente.whatsapp !== v.cliente.whatsapp) error(f, `El folio ${folioOriginal} tiene otro cliente en otro renglón.`)
    }
    v.filas.push(f)
    if (f.estado !== "error" && p) v.lineas.push({ f, producto_id: p.id, lote_id: loteId, cantidad: piezas!, importe: Math.round(importe! * 100) / 100 })
    ventas.set(folio, v)
  }

  // Si un renglón de la venta tiene error, la venta completa no se importa.
  const validas = [...ventas.values()].filter((v) => {
    const mala = v.filas.some((f) => f.estado === "error")
    if (mala) for (const f of v.filas) if (f.estado !== "error") error(f, "Otro renglón de esta venta tiene error; se omite la venta completa.")
    return !mala && v.lineas.length > 0
  })
  const clientesNuevos = new Set(validas.filter((v) => !v.cliente.id).map((v) => v.cliente.whatsapp))
  for (const v of validas) if (!v.cliente.id) v.filas[0].mensajes.push("Cliente nuevo: se da de alta.")

  return {
    filas,
    aCrear: validas.length,
    aplicar: async () => {
      // 1) Clientes nuevos
      const altas = [...clientesNuevos].map((wa) => {
        const v = validas.find((x) => x.cliente.whatsapp === wa)!
        return { nombre: v.cliente.nombre, whatsapp: wa!, tipo: "paciente", vendedor_id: v.vendedor?.id ?? null, origen: "Importación" }
      })
      const idPorWa = new Map<string, string>()
      for (let i = 0; i < altas.length; i += TROZO) {
        const { data, error: e } = await admin.from("clientes").insert(altas.slice(i, i + TROZO)).select("id, whatsapp")
        if (e) throw new Error("No se pudieron dar de alta los clientes nuevos. No se importó ninguna venta.")
        for (const c of data ?? []) idPorWa.set(c.whatsapp, c.id)
      }
      // 2) Ventas, partidas y pagos, por trozos
      let hechas = 0
      for (let i = 0; i < validas.length; i += TROZO) {
        const trozo = validas.slice(i, i + TROZO)
        const filasVenta = trozo.map((v) => {
          const red = v.vendedor?.perfil === "distribuidor" || v.vendedor?.perfil === "comisionista"
          return {
            folio: v.folio,
            canal: red ? "red" : "en_persona",
            cliente_id: v.cliente.id ?? idPorWa.get(v.cliente.whatsapp!)!,
            vendedor_id: v.vendedor?.id ?? sesion.personaId,
            estado: "entregada",
            forma_pago: "completo",
            total: Math.round(v.lineas.reduce((s, l) => s + l.importe, 0) * 100) / 100,
            etiquetas: [ETIQUETA_IMPORTADA],
            nota: "Importada del historial",
            creado_en: `${v.fecha}T12:00:00-06:00`,
          }
        })
        const { data: creadas, error: e } = await admin.from("ventas").insert(filasVenta).select("id, folio")
        if (e || !creadas) throw new Error(`Se importaron ${hechas} ventas; el resto falló. Puedes volver a subir el archivo: las ya importadas se omiten.`)
        const id = new Map(creadas.map((c) => [c.folio, c.id]))
        try {
          await insertarPorTrozos(
            admin,
            "venta_partidas",
            trozo.flatMap((v) => v.lineas.map((l) => ({ venta_id: id.get(v.folio), producto_id: l.producto_id, lote_id: l.lote_id, cantidad: l.cantidad, precio_unitario: Math.round((l.importe / l.cantidad) * 100) / 100 }))),
          )
          await insertarPorTrozos(
            admin,
            "pagos",
            trozo.map((v, k) => {
              const red = filasVenta[k].canal === "red"
              return {
                venta_id: id.get(v.folio),
                monto: filasVenta[k].total,
                metodo: red && v.metodo === "efectivo" ? "transferencia" : v.metodo,
                lugar: red ? "red" : v.metodo === "transferencia" ? "banco" : "en_persona",
                cobro_persona_id: filasVenta[k].vendedor_id,
                estado: red ? "reflejado" : "conciliado",
                referencia: "Importado del historial",
                creado_en: filasVenta[k].creado_en,
              }
            }),
          )
        } catch {
          const ids = creadas.map((c) => c.id)
          await admin.from("pagos").delete().in("venta_id", ids)
          await admin.from("venta_partidas").delete().in("venta_id", ids)
          await admin.from("ventas").delete().in("id", ids)
          throw new Error(`Se importaron ${hechas} ventas; el resto falló. Puedes volver a subir el archivo: las ya importadas se omiten.`)
        }
        hechas += creadas.length
      }
      return hechas
    },
  }
}

export const PLANES: Record<TipoImportacion, (t: Tabla, ctx: Ctx) => Promise<Plan>> = {
  red: planRed,
  clientes: planClientes,
  inventario: planInventario,
  historial: planHistorial,
}
