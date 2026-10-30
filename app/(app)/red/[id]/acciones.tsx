"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { AlertTriangle, Loader2, Pencil } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

import { PersonaDrawer } from "../../configuracion/persona-drawer"
import { darDeBaja } from "../actions"
import type { MiembroRed } from "../datos"

const MOTIVOS = ["Dejó de vender", "Decisión de Peptique", "Lo pidió la persona", "Otro"]

export function AccionesPersona({ persona, esAdmin, equipo, distribuidores }: { persona: MiembroRed; esAdmin: boolean; equipo: number; distribuidores: MiembroRed[] }) {
  const router = useRouter()
  const [editar, setEditar] = useState(false)
  const [baja, setBaja] = useState(false)
  const [motivo, setMotivo] = useState("")
  const [guardando, iniciar] = useTransition()

  return (
    <div className="flex gap-2">
      {esAdmin && (
        <Button variant="outline" size="lg" onClick={() => setEditar(true)}>
          <Pencil aria-hidden />
          {persona.estado === "por_aprobar" ? "Revisar alta" : "Editar"}
        </Button>
      )}
      {persona.estado !== "baja" && (
        <Button variant="outline" size="lg" className="border-[#ebc5c1] text-crit hover:text-crit" onClick={() => setBaja(true)}>
          Dar de baja
        </Button>
      )}
      {esAdmin && <PersonaDrawer key={String(editar)} abierto={editar} onOpenChange={setEditar} persona={persona} distribuidores={distribuidores} />}
      <Dialog open={baja} onOpenChange={setBaja}>
        <DialogContent>
          <DialogHeader>
            <span className="mb-1 inline-flex size-10 items-center justify-center rounded-xl bg-crit-bg text-crit">
              <AlertTriangle className="size-5" aria-hidden />
            </span>
            <DialogTitle className="text-[22px]">¿Dar de baja a {persona.nombre}?</DialogTitle>
            <DialogDescription>Pasa lo siguiente:</DialogDescription>
          </DialogHeader>
          <ul className="flex flex-col gap-1.5 text-[13.5px]">
            <li>· Ya no podrá entrar a su app ni vender; se cierra su sesión.</li>
            {equipo > 0 && <li>· También se dan de baja sus {equipo === 1 ? "1 comisionista" : `${equipo} comisionistas`}.</li>}
            {persona.esperando > 0 && <li>· Sus {persona.esperando} pagos en camino siguen abiertos.</li>}
            <li>· Su historial y sus clientes se conservan.</li>
          </ul>
          <div className="flex flex-col gap-1.5 text-[12.5px] font-semibold">
            Motivo (obligatorio)
            <Select value={motivo} onValueChange={setMotivo}>
              <SelectTrigger className="w-full" aria-label="Motivo">
                <SelectValue placeholder="Elegir motivo" />
              </SelectTrigger>
              <SelectContent>
                {MOTIVOS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBaja(false)}>
              Volver
            </Button>
            <Button
              className="bg-crit text-white hover:bg-crit/90"
              disabled={!motivo || guardando}
              onClick={() =>
                iniciar(async () => {
                  const r = await darDeBaja(persona.id, motivo)
                  if (r.error) return void toast.error(r.error)
                  toast.success(r.bajas && r.bajas > 1 ? `${persona.nombre} y su equipo dados de baja` : `${persona.nombre} dado de baja`)
                  setBaja(false)
                  router.refresh()
                })
              }
            >
              {guardando && <Loader2 className="animate-spin" aria-hidden />}
              Dar de baja
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
