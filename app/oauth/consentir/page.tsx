import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { AlertTriangle, Check, Eye, ShieldCheck } from "lucide-react"

import { Button } from "@/components/ui/button"
import { PERFIL_INFO } from "@/lib/perfiles"
import { DIAS_CONECTOR, PERFILES_CONECTOR } from "@/lib/mcp/sesion"
import { obtenerSesion } from "@/lib/sesion"
import { crearClienteServidor } from "@/lib/supabase/server"

import { decidir } from "./acciones"
import { redireccionPermitida } from "./permitidos"

export const metadata: Metadata = { title: "Conectar Claude" }

function Aviso({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="flex items-start gap-2 rounded-xl bg-warn-bg px-3.5 py-2.5 text-sm font-semibold text-warn">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
      {children}
    </p>
  )
}

export default async function Consentir({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { authorization_id: id, error } = await searchParams
  const sesion = await obtenerSesion()

  let contenido: React.ReactNode
  if (typeof id !== "string" || error) {
    contenido = <Aviso>No pudimos leer la solicitud de conexión. Vuelve a Claude y conecta otra vez.</Aviso>
  } else {
    const supabase = await crearClienteServidor()
    const { data: detalle } = await supabase.auth.oauth.getAuthorizationDetails(id)
    // Ya se había permitido antes: Supabase manda directo de regreso.
    if (detalle && !("authorization_id" in detalle) && PERFILES_CONECTOR.includes(sesion.perfil)) redirect(detalle.redirect_url)

    const valida = !!detalle && "authorization_id" in detalle
    const perfilOk = PERFILES_CONECTOR.includes(sesion.perfil)
    const destinoOk = valida && redireccionPermitida(detalle.redirect_uri)
    const puede = valida && perfilOk && destinoOk
    contenido = (
      <>
        {!valida && <Aviso>La solicitud venció o ya se usó. Vuelve a Claude y conecta otra vez.</Aviso>}
        {valida && !perfilOk && <Aviso>Tu perfil ({PERFIL_INFO[sesion.perfil].nombre}) no puede conectar Claude. Solo el administrador y el admin comercial.</Aviso>}
        {valida && perfilOk && !destinoOk && <Aviso>Esta solicitud no viene de Claude ({new URL(detalle.redirect_uri).host}). Por seguridad no se puede permitir.</Aviso>}
        {valida && (
          <div className="flex flex-col gap-3 rounded-2xl border bg-card p-5">
            <p className="text-[15px]">
              <b>{detalle.client.name || "Claude"}</b> quiere usar el CRM como <b>{sesion.nombre}</b> ({PERFIL_INFO[sesion.perfil].nombre}).
            </p>
            <ul className="flex flex-col gap-2.5 text-sm">
              <li className="flex gap-2.5">
                <Eye className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                Ver lo mismo que ves tú en el CRM, nada más{sesion.perfil === "administrador" ? "" : " (sin costos ni márgenes)"}.
              </li>
              <li className="flex gap-2.5">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                Proponer ventas, pagos, lotes o precios. Nada se guarda hasta que tú lo confirmas en la conversación.
              </li>
              <li className="flex gap-2.5">
                <Check className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                Vale {DIAS_CONECTOR} días; después te pedimos tu PIN otra vez. El administrador puede cortarlo con “Cerrar sesiones”.
              </li>
            </ul>
            <p className="text-xs text-muted-foreground">
              Lo que consultes desde Claude pasa por los servidores de Anthropic para responderte, con tu propia cuenta de Claude. Regresará a {new URL(detalle.redirect_uri).host}.
            </p>
          </div>
        )}
        {valida && (
          <form action={decidir} className="flex flex-wrap gap-2.5">
            <input type="hidden" name="authorization_id" value={id} />
            {puede && (
              <Button type="submit" name="decision" value="permitir" size="lg">
                Permitir
              </Button>
            )}
            <Button type="submit" name="decision" value="negar" variant="outline" size="lg">
              No permitir
            </Button>
          </form>
        )}
      </>
    )
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-4 px-4 py-14">
      <div className="flex items-center gap-2.5">
        <span className="inline-flex size-7 items-center justify-center rounded-lg bg-espresso font-serif text-[15px] font-semibold text-hueso">P</span>
        <b className="font-serif text-[22px] font-semibold">Peptique</b>
      </div>
      <h1 className="text-[30px] leading-tight font-medium">Conectar Claude</h1>
      {contenido}
    </main>
  )
}
