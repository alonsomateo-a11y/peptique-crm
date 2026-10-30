"use client"

import { useState, useTransition } from "react"
import { Loader2, Plus } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"

import { pedirAltaComisionista } from "../../actions"

/** En celular el alta es corta (3 campos), así que va en un diálogo. */
export function AgregarComisionista() {
  const [abierto, setAbierto] = useState(false)
  const [nombre, setNombre] = useState("")
  const [whatsapp, setWhatsapp] = useState("")
  const [zona, setZona] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [enviando, iniciar] = useTransition()
  return (
    <>
      <Button className="h-10" onClick={() => setAbierto(true)}>
        <Plus aria-hidden />
        Comisionista
      </Button>
      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Agregar comisionista</DialogTitle>
            <DialogDescription>Gana 13% por venta y tú recibes 3%. Queda por aprobar del administrador.</DialogDescription>
          </DialogHeader>
          <label className="flex flex-col gap-1.5 text-[12.5px] font-semibold">
            Nombre completo
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} className="h-11" autoComplete="off" />
          </label>
          <label className="flex flex-col gap-1.5 text-[12.5px] font-semibold">
            WhatsApp
            <Input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} type="tel" inputMode="tel" className="h-11" autoComplete="off" />
          </label>
          <label className="flex flex-col gap-1.5 text-[12.5px] font-semibold">
            Zona
            <Input value={zona} onChange={(e) => setZona(e.target.value)} className="h-11" autoComplete="off" />
          </label>
          {error && (
            <p role="alert" className="text-[12.5px] font-semibold text-crit">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAbierto(false)}>
              Cancelar
            </Button>
            <Button
              disabled={enviando}
              onClick={() =>
                iniciar(async () => {
                  setError(null)
                  const r = await pedirAltaComisionista({ nombre, whatsapp, zona })
                  if (r.error) return setError(r.error)
                  toast.success("Solicitud enviada")
                  setNombre("")
                  setWhatsapp("")
                  setZona("")
                  setAbierto(false)
                })
              }
            >
              {enviando && <Loader2 className="animate-spin" aria-hidden />}
              Enviar solicitud
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
