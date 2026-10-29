import type { Metadata } from "next"
import Link from "next/link"
import { ShieldAlert } from "lucide-react"

import { Estado } from "@/components/app/estado"
import { PageHeader } from "@/components/app/page-header"
import { exigirAdmin } from "@/lib/sesion"
import { crearClienteServidor } from "@/lib/supabase/server"
import { cn } from "@/lib/utils"

import { ComisionesForm } from "./comisiones-form"
import { EquipoVista } from "./equipo-vista"
import type { PersonaFila } from "./tipos"

export const metadata: Metadata = { title: "Configuración" }

const SECCIONES = [
  { id: "equipo", titulo: "Equipo y permisos" },
  { id: "comisiones", titulo: "Comisiones" },
  { id: "reglas", titulo: "Reglas comerciales" },
] as const

export default async function Configuracion({ searchParams }: PageProps<"/configuracion">) {
  const sesion = await exigirAdmin()
  const { seccion: s } = await searchParams
  const seccion = SECCIONES.find((x) => x.id === s)?.id ?? "equipo"
  const supabase = await crearClienteServidor()

  return (
    <>
      <PageHeader ruta={[["Inicio", "/inicio"], ["Configuración"]]} titulo="Configuración" />
      <div className="flex flex-col gap-5 md:flex-row md:items-start">
        <nav aria-label="Secciones de configuración" className="flex shrink-0 gap-1 md:w-52 md:flex-col">
          {SECCIONES.map((x) => (
            <Link
              key={x.id}
              href={`/configuracion?seccion=${x.id}`}
              aria-current={x.id === seccion ? "page" : undefined}
              className={cn(
                "rounded-[10px] px-3 py-2 text-[13.5px] font-semibold text-[#5c544c] hover:bg-hueso",
                x.id === seccion && "bg-card text-foreground shadow-sm ring-1 ring-border",
              )}
            >
              {x.titulo}
            </Link>
          ))}
        </nav>
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          {seccion === "equipo" && <Equipo supabase={supabase} yo={sesion.personaId} />}
          {seccion === "comisiones" && <Comisiones supabase={supabase} />}
          {seccion === "reglas" && <Reglas supabase={supabase} />}
          <p className="flex items-start gap-2 rounded-xl border bg-hueso-2 px-3.5 py-3 text-[12.5px]">
            <ShieldAlert className="mt-px size-4 shrink-0" aria-hidden />
            Distribuidores y comisionistas no ven costos, márgenes, proveedores, COA original ni protocolos. Las altas que pide un distribuidor las aprueba el administrador.
          </p>
        </div>
      </div>
    </>
  )
}

type Supa = Awaited<ReturnType<typeof crearClienteServidor>>

async function Equipo({ supabase, yo }: { supabase: Supa; yo: string }) {
  const { data } = await supabase
    .from("personas")
    .select("id, nombre, whatsapp, perfil, estado, zona, distribuidor_id, vence_en, bloqueado_hasta, pin_hash, auth_user_id")
    .order("estado")
    .order("nombre")
  const personas = aFilas(data ?? [], yo)
  return <EquipoVista personas={personas} />
}

type PersonaBd = {
  id: string
  nombre: string
  whatsapp: string
  perfil: PersonaFila["perfil"]
  estado: PersonaFila["estado"]
  zona: string | null
  distribuidor_id: string | null
  vence_en: string | null
  bloqueado_hasta: string | null
  pin_hash: string | null
  auth_user_id: string | null
}

/** Filas para el cliente: nunca manda el hash del PIN, solo si existe. */
function aFilas(data: PersonaBd[], yo: string): PersonaFila[] {
  const ahora = Date.now()
  return data.map((p) => ({
    id: p.id,
    nombre: p.nombre,
    whatsapp: p.whatsapp,
    perfil: p.perfil,
    estado: p.estado,
    zona: p.zona,
    distribuidor_id: p.distribuidor_id,
    vence_en: p.vence_en,
    vencido: p.perfil === "temporal" && !!p.vence_en && Date.parse(p.vence_en) < ahora,
    bloqueado: !!p.bloqueado_hasta && Date.parse(p.bloqueado_hasta) > ahora,
    tienePin: !!p.pin_hash,
    tieneAcceso: !!p.auth_user_id,
    esYo: p.id === yo,
  }))
}

async function Comisiones({ supabase }: { supabase: Supa }) {
  const { data } = await supabase.from("configuracion").select("valor").eq("clave", "comisiones").maybeSingle()
  const valor = (data?.valor ?? { directa: 13, equipo: 3 }) as { directa: number; equipo: number }
  return (
    <section aria-labelledby="titulo-comisiones" className="flex flex-col gap-3 rounded-2xl border bg-card p-5">
      <div className="flex items-center gap-2">
        <h2 id="titulo-comisiones" className="flex-1 text-xl font-medium">
          Comisiones por perfil
        </h2>
        <Estado tipo="neutro">Solo administrador</Estado>
      </div>
      <ComisionesForm directa={valor.directa} equipo={valor.equipo} />
    </section>
  )
}

const REGLAS: { clave: string; titulo: string; valor: (r: Record<string, number>) => string }[] = [
  { clave: "aviso_recompra_dias", titulo: "Aviso de recompra", valor: (r) => `${r.aviso_recompra_dias} días antes de que se acabe` },
  { clave: "sin_recompra", titulo: "Sin recompra", valor: () => "al terminarse el producto" },
  { clave: "liberar_apartado_horas", titulo: "Liberar apartado de la red", valor: (r) => `${r.liberar_apartado_horas} h sin pago` },
]

async function Reglas({ supabase }: { supabase: Supa }) {
  const { data } = await supabase.from("configuracion").select("valor").eq("clave", "reglas").maybeSingle()
  const reglas = (data?.valor ?? {}) as Record<string, number>
  return (
    <section aria-labelledby="titulo-reglas" className="flex flex-col gap-3 rounded-2xl border bg-card p-5">
      <div className="flex items-center gap-2">
        <h2 id="titulo-reglas" className="flex-1 text-xl font-medium">
          Reglas comerciales
        </h2>
        <Estado tipo="neutro">Configuradas en la implementación</Estado>
      </div>
      <dl className="divide-y">
        {REGLAS.map((r) => (
          <div key={r.clave} className="flex items-center gap-3 py-2.5 text-[13.5px]">
            <dt className="flex-1 font-semibold">{r.titulo}</dt>
            <dd className="rounded-full bg-hueso px-2.5 py-0.5 text-[12px] font-semibold">{r.valor(reglas)}</dd>
          </div>
        ))}
      </dl>
      <p className="text-[11.5px] text-muted-foreground">No son interruptores: las dejamos listas con Peptique y se ajustan con nosotros.</p>
    </section>
  )
}
