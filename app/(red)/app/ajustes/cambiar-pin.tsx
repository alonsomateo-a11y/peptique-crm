"use client"

import { useState, useTransition } from "react"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"

import { cambiarMiPin } from "../../actions"

const pin = (id: string, etiqueta: string, valor: string, set: (v: string) => void) => (
  <label htmlFor={id} className="flex flex-col gap-1.5 text-[12.5px] font-semibold">
    {etiqueta}
    <Input id={id} type="password" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} autoComplete="off" value={valor} onChange={(e) => set(e.target.value.replace(/\D/g, ""))} className="h-12 w-32 text-center text-lg tracking-[0.4em]" />
  </label>
)

export function CambiarPin() {
  const [abierto, setAbierto] = useState(false)
  const [actual, setActual] = useState("")
  const [nuevo, setNuevo] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [guardando, iniciar] = useTransition()
  return (
    <>
      <Button variant="outline" size="lg" className="h-12" onClick={() => setAbierto(true)}>
        Cambiar PIN
      </Button>
      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cambiar PIN</DialogTitle>
            <DialogDescription>4 números. No lo compartas.</DialogDescription>
          </DialogHeader>
          {pin("pin-actual", "PIN actual", actual, setActual)}
          {pin("pin-nuevo", "PIN nuevo", nuevo, setNuevo)}
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
              disabled={guardando || actual.length !== 4 || nuevo.length !== 4}
              onClick={() =>
                iniciar(async () => {
                  setError(null)
                  const r = await cambiarMiPin(actual, nuevo)
                  if (r.error) return setError(r.error)
                  toast.success("PIN cambiado")
                  setActual("")
                  setNuevo("")
                  setAbierto(false)
                })
              }
            >
              {guardando && <Loader2 className="animate-spin" aria-hidden />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
