"use client"

import { useActionState, useState, useTransition } from "react"
import { AlertTriangle, Loader2, LogOut, Unlock } from "lucide-react"
import { toast } from "sonner"

import { Campo } from "@/components/app/campo"
import { Drawer, DrawerCuerpo, DrawerPie } from "@/components/app/drawer"
import { Segmentado } from "@/components/app/segmentado"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { PERFIL_INFO, PERFILES, type Perfil } from "@/lib/perfiles"
import { enviarSinLimpiar } from "@/lib/formulario"

import { cerrarSesionPersona, desbloquearPersona, guardarPersona } from "./actions"
import { EstadoPersona } from "./equipo-vista"
import type { PersonaFila, Resultado } from "./tipos"

/** ISO → "YYYY-MM-DDTHH:mm" en hora de Monterrey, para <input type="datetime-local">. */
function aLocal(iso: string | null) {
  const d = iso ? new Date(iso) : new Date()
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Monterrey",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d)
  const p = Object.fromEntries(partes.map((x) => [x.type, x.value]))
  return iso ? `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}` : `${p.year}-${p.month}-${p.day}T23:59`
}

export function PersonaDrawer({
  abierto,
  onOpenChange,
  persona,
  distribuidores,
}: {
  abierto: boolean
  onOpenChange: (v: boolean) => void
  persona: PersonaFila | null
  distribuidores: PersonaFila[]
}) {
  const [perfil, setPerfil] = useState<Perfil>(persona?.perfil ?? "mostrador")
  const [estado, setEstado] = useState(persona?.estado === "por_aprobar" ? "activo" : (persona?.estado ?? "activo"))
  const [ocupado, iniciar] = useTransition()

  const [res, enviar, enviando] = useActionState(async (prev: Resultado, form: FormData) => {
    const r = await guardarPersona(prev, form)
    if (r?.ok) {
      toast.success(persona ? "Cambios guardados" : "Persona dada de alta")
      onOpenChange(false)
    }
    return r
  }, null)
  const err = res?.errores ?? {}
  const id = (k: string) => `persona-${k}`
  const aria = (k: string) => (err[k] ? { "aria-invalid": true, "aria-describedby": `${id(k)}-error` } : {})

  function accion(fn: (id: string) => Promise<Resultado>, exito: string) {
    if (!persona) return
    iniciar(async () => {
      const r = await fn(persona.id)
      if (r?.ok) toast.success(exito)
      else toast.error(r?.error ?? "No se pudo completar.")
    })
  }

  const necesitaPin = !persona || !persona.tienePin

  return (
    <Drawer
      abierto={abierto}
      onOpenChange={onOpenChange}
      titulo={persona ? (persona.estado === "por_aprobar" ? `Aprobar a ${persona.nombre}` : persona.nombre) : "Nueva persona"}
      descripcion={persona ? PERFIL_INFO[persona.perfil].nombre : "Entra con su PIN; no necesita correo"}
    >
      <form onSubmit={enviarSinLimpiar(enviar)} className="flex min-h-0 flex-1 flex-col">
        {persona && <input type="hidden" name="id" value={persona.id} />}
        <DrawerCuerpo>
          {res?.error && (
            <p role="alert" className="flex items-center gap-2 rounded-xl bg-crit-bg px-3.5 py-2.5 text-sm font-semibold text-crit">
              <AlertTriangle className="size-4" aria-hidden />
              {res.error}
            </p>
          )}

          {persona && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-hueso-2 px-3.5 py-3">
              <EstadoPersona p={persona} />
              <span className="flex-1" />
              {persona.bloqueado && (
                <Button type="button" variant="outline" size="sm" disabled={ocupado} onClick={() => accion(desbloquearPersona, "PIN desbloqueado")}>
                  <Unlock aria-hidden />
                  Desbloquear PIN
                </Button>
              )}
              {persona.tieneAcceso && persona.estado === "activo" && !persona.esYo && (
                <Button type="button" variant="outline" size="sm" disabled={ocupado} onClick={() => accion(cerrarSesionPersona, "Sesión cerrada")}>
                  <LogOut aria-hidden />
                  Cerrar sesión ahora
                </Button>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Campo id={id("nombre")} etiqueta="Nombre" error={err.nombre} className="col-span-2">
              <Input id={id("nombre")} name="nombre" defaultValue={persona?.nombre} autoComplete="off" {...aria("nombre")} />
            </Campo>
            <Campo id={id("whatsapp")} etiqueta="WhatsApp" error={err.whatsapp}>
              <Input id={id("whatsapp")} name="whatsapp" type="tel" inputMode="tel" defaultValue={persona?.whatsapp} placeholder="81 1234 5678" autoComplete="off" {...aria("whatsapp")} />
            </Campo>
            <Campo id={id("zona")} etiqueta="Zona" ayuda="Opcional" error={err.zona}>
              <Input id={id("zona")} name="zona" defaultValue={persona?.zona ?? ""} placeholder="San Pedro" autoComplete="off" />
            </Campo>
          </div>

          <Campo id={id("perfil")} etiqueta="Perfil" error={err.perfil} ayuda={PERFIL_INFO[perfil].puede}>
            <Select name="perfil" value={perfil} onValueChange={(v) => setPerfil(v as Perfil)} disabled={persona?.esYo}>
              <SelectTrigger id={id("perfil")} className="w-full" {...aria("perfil")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PERFILES.map((p) => (
                  <SelectItem key={p} value={p}>
                    {PERFIL_INFO[p].nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {persona?.esYo && <input type="hidden" name="perfil" value={perfil} />}
          </Campo>

          {perfil === "comisionista" && (
            <Campo id={id("distribuidor_id")} etiqueta="Distribuidor" error={err.distribuidor_id} ayuda="Su distribuidor recibe el 3% de sus ventas">
              <Select name="distribuidor_id" defaultValue={persona?.distribuidor_id ?? undefined}>
                <SelectTrigger id={id("distribuidor_id")} className="w-full" {...aria("distribuidor_id")}>
                  <SelectValue placeholder={distribuidores.length ? "Elige un distribuidor" : "Primero da de alta un distribuidor"} />
                </SelectTrigger>
                <SelectContent>
                  {distribuidores.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Campo>
          )}

          {perfil === "temporal" && (
            <Campo id={id("vence_en")} etiqueta="Vence" error={err.vence_en} ayuda="Hora de Monterrey. Al vencer ya no puede entrar.">
              <Input id={id("vence_en")} name="vence_en" type="datetime-local" defaultValue={aLocal(persona?.vence_en ?? null)} {...aria("vence_en")} />
            </Campo>
          )}

          <Campo
            id={id("pin")}
            etiqueta={necesitaPin ? "PIN de 4 números" : "Cambiar PIN"}
            error={err.pin}
            ayuda={necesitaPin ? "Compártelo en persona. No se vuelve a mostrar." : "Déjalo vacío para conservar el actual."}
          >
            <Input
              id={id("pin")}
              name="pin"
              type="password"
              inputMode="numeric"
              pattern="[0-9]{4}"
              maxLength={4}
              autoComplete="new-password"
              placeholder="••••"
              className="w-32 text-center text-lg tracking-[0.4em]"
              {...aria("pin")}
            />
          </Campo>

          {persona && !persona.esYo && (
            <div className="flex flex-col gap-1.5">
              <span className="text-[12.5px] font-semibold">Estado</span>
              <Segmentado
                name="estado"
                etiqueta="Estado de la persona"
                valor={estado}
                onChange={setEstado}
                opciones={[
                  { valor: "activo", texto: persona.estado === "por_aprobar" ? "Aprobar" : "Activo" },
                  { valor: "baja", texto: persona.estado === "por_aprobar" ? "Rechazar" : "Baja" },
                ]}
              />
              <span className="text-[11.5px] text-muted-foreground">
                {estado === "baja" ? "Se cierra su sesión y ya no puede entrar. Su historial se conserva." : "Puede entrar con su PIN."}
              </span>
            </div>
          )}
        </DrawerCuerpo>
        <DrawerPie>
          <Button type="button" variant="outline" size="lg" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="submit" size="lg" disabled={enviando}>
            {enviando && <Loader2 className="animate-spin" aria-hidden />}
            {persona ? (persona.estado === "por_aprobar" && estado === "activo" ? "Aprobar alta" : "Guardar cambios") : "Dar de alta"}
          </Button>
        </DrawerPie>
      </form>
    </Drawer>
  )
}
