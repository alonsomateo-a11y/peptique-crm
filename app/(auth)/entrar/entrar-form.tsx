"use client"

import Link from "next/link"
import { useActionState, useState, useTransition } from "react"
import { AlertTriangle, ArrowLeft, ArrowRight, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp"
import { PERFIL_INFO, PERFILES, type Perfil } from "@/lib/perfiles"
import { cn } from "@/lib/utils"

import { entrarConPin, listarPersonas, type PersonaEntrada } from "./actions"

const INICIALES: Record<Perfil, string> = {
  administrador: "AD",
  admin_comercial: "AC",
  mostrador: "M",
  distribuidor: "D",
  comisionista: "C",
  temporal: "T",
}

const tarjeta =
  "flex items-center gap-3.5 rounded-2xl border bg-card px-[18px] py-4 text-left hover:border-espresso focus-visible:ring-3 focus-visible:ring-ring focus-visible:outline-none"

export function EntrarForm() {
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [personas, setPersonas] = useState<PersonaEntrada[] | null>(null)
  const [persona, setPersona] = useState<PersonaEntrada | null>(null)
  const [cargando, iniciar] = useTransition()

  function elegirPerfil(p: Perfil) {
    setPerfil(p)
    setPersonas(null)
    iniciar(async () => setPersonas(await listarPersonas(p)))
  }

  function regresar() {
    if (persona) setPersona(null)
    else setPerfil(null)
  }

  if (!perfil) {
    return (
      <div className="flex flex-col gap-2.5">
        {PERFILES.map((p) => (
          <button key={p} type="button" onClick={() => elegirPerfil(p)} className={tarjeta}>
            <Avatar texto={INICIALES[p]} red={p === "distribuidor" || p === "comisionista"} />
            <span className="flex-1">
              <span className="flex items-center gap-2">
                <b className="text-[15px]">{PERFIL_INFO[p].nombre}</b>
                <span className="rounded-full bg-hueso px-2.5 text-[11.5px] leading-[22px] font-semibold text-[#5c544c]">{PERFIL_INFO[p].donde}</span>
              </span>
              <span className="mt-0.5 block text-[12.5px] text-muted-foreground">{PERFIL_INFO[p].puede}</span>
            </span>
            <span className="inline-flex items-center gap-1 text-sm font-bold text-chart-1">
              Entrar <ArrowRight className="size-4" aria-hidden />
            </span>
          </button>
        ))}
        <Link href="/entrar/correo" className="mt-2 text-sm font-semibold text-muted-foreground underline-offset-4 hover:underline">
          Administrador: entrar con correo y contraseña
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-start gap-5">
      <button type="button" onClick={regresar} className="inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden />
        {persona ? "Cambiar persona" : "Cambiar perfil"}
      </button>

      {!persona && (
        <>
          <h2 className="text-2xl font-medium">{PERFIL_INFO[perfil].nombre}: ¿quién eres?</h2>
          {cargando || personas === null ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden /> Cargando…
            </p>
          ) : personas.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay personas activas con este perfil. Pide al administrador que te dé de alta.</p>
          ) : (
            <div className="grid w-full grid-cols-1 gap-2.5 sm:grid-cols-2">
              {personas.map((p) => (
                <button key={p.id} type="button" onClick={() => setPersona(p)} className={tarjeta}>
                  <Avatar texto={p.iniciales} red={perfil === "distribuidor" || perfil === "comisionista"} />
                  <span className="flex flex-col">
                    <b className="text-[15px]">{p.nombre}</b>
                    {p.zona && <span className="text-[12.5px] text-muted-foreground">{p.zona}</span>}
                  </span>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {persona && <FormularioPin persona={persona} />}
    </div>
  )
}

function FormularioPin({ persona }: { persona: PersonaEntrada }) {
  const [pin, setPin] = useState("")
  const [error, enviar, enviando] = useActionState(entrarConPin, null)

  return (
    <form action={enviar} className="flex flex-col items-start gap-5">
      <input type="hidden" name="persona" value={persona.id} />
      <input type="hidden" name="pin" value={pin} />
      <div>
        <h2 className="text-2xl font-medium">PIN de {persona.nombre.split(" ")[0]}</h2>
        <p className="mt-1 text-sm text-muted-foreground">Escribe tus 4 números.</p>
      </div>
      <InputOTP
        maxLength={4}
        value={pin}
        onChange={setPin}
        inputMode="numeric"
        pattern="^[0-9]*$"
        autoFocus
        aria-label="PIN de 4 números"
        aria-invalid={!!error}
        aria-describedby={error ? "error-pin" : undefined}
      >
        <InputOTPGroup className="gap-3">
          {[0, 1, 2, 3].map((i) => (
            <InputOTPSlot key={i} index={i} className="size-14 rounded-xl border bg-card text-xl font-bold first:rounded-xl last:rounded-xl" />
          ))}
        </InputOTPGroup>
      </InputOTP>
      {error && (
        <p id="error-pin" role="alert" className="flex items-center gap-2 text-sm font-semibold text-crit">
          <AlertTriangle className="size-4" aria-hidden />
          {error}
        </p>
      )}
      <Button type="submit" size="lg" disabled={pin.length < 4 || enviando} className="h-11 px-6">
        {enviando && <Loader2 className="animate-spin" aria-hidden />}
        Entrar
      </Button>
    </form>
  )
}

function Avatar({ texto, red }: { texto: string; red?: boolean }) {
  return (
    <span className={cn("inline-flex size-[42px] shrink-0 items-center justify-center rounded-full text-[13px] font-extrabold", red ? "bg-[#dce6d8]" : "bg-bruma")}>
      {texto}
    </span>
  )
}
