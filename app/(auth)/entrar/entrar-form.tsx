"use client"

import { useState } from "react"
import { ArrowLeft, ArrowRight } from "lucide-react"

import { Button } from "@/components/ui/button"
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp"
import { PERFIL_INFO, PERFILES, type Perfil } from "@/lib/perfiles"
import { cn } from "@/lib/utils"

const INICIALES: Record<Perfil, string> = {
  administrador: "AD",
  admin_comercial: "AC",
  mostrador: "M",
  distribuidor: "D",
  comisionista: "C",
  temporal: "T",
}

export function EntrarForm() {
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [pin, setPin] = useState("")

  if (!perfil) {
    return (
      <div className="flex flex-col gap-2.5">
        {PERFILES.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPerfil(p)}
            className="flex items-center gap-3.5 rounded-2xl border bg-card px-[18px] py-4 text-left hover:border-espresso focus-visible:ring-3 focus-visible:ring-ring focus-visible:outline-none"
          >
            <span
              className={cn(
                "inline-flex size-[42px] items-center justify-center rounded-full text-[13px] font-extrabold",
                p === "distribuidor" || p === "comisionista" ? "bg-[#dce6d8]" : "bg-bruma",
              )}
            >
              {INICIALES[p]}
            </span>
            <span className="flex-1">
              <span className="flex items-center gap-2">
                <b className="text-[15px]">{PERFIL_INFO[p].nombre}</b>
                <span className="rounded-full bg-hueso px-2.5 text-[11.5px] leading-[22px] font-semibold text-[#5c544c]">
                  {PERFIL_INFO[p].donde}
                </span>
              </span>
              <span className="mt-0.5 block text-[12.5px] text-muted-foreground">{PERFIL_INFO[p].puede}</span>
            </span>
            <span className="inline-flex items-center gap-1 text-sm font-bold text-chart-1">
              Entrar <ArrowRight className="size-4" aria-hidden />
            </span>
          </button>
        ))}
      </div>
    )
  }

  return (
    <form
      className="flex flex-col items-start gap-5"
      onSubmit={(e) => {
        e.preventDefault()
        // Pendiente: validar el PIN contra Supabase (ver README · Acceso con PIN).
      }}
    >
      <button
        type="button"
        onClick={() => {
          setPerfil(null)
          setPin("")
        }}
        className="inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Cambiar perfil
      </button>
      <div>
        <h2 className="text-2xl font-medium">PIN de {PERFIL_INFO[perfil].nombre}</h2>
        <p className="mt-1 text-sm text-muted-foreground">Escribe tus 4 números.</p>
      </div>
      <InputOTP maxLength={4} value={pin} onChange={setPin} inputMode="numeric" pattern="^[0-9]*$" autoFocus aria-label="PIN de 4 números">
        <InputOTPGroup className="gap-3">
          {[0, 1, 2, 3].map((i) => (
            <InputOTPSlot key={i} index={i} className="size-14 rounded-xl border bg-card text-xl font-bold first:rounded-xl last:rounded-xl" />
          ))}
        </InputOTPGroup>
      </InputOTP>
      <Button type="submit" size="lg" disabled={pin.length < 4} className="h-11 px-6">
        Entrar
      </Button>
    </form>
  )
}
