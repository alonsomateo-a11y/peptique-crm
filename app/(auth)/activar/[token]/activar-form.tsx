"use client"

import { useActionState } from "react"
import { AlertTriangle, Loader2 } from "lucide-react"

import { Campo } from "@/components/app/campo"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { enviarSinLimpiar } from "@/lib/formulario"

import { activarAcceso } from "../actions"

export function ActivarForm({ token, conCorreo }: { token: string; conCorreo: boolean }) {
  const [res, enviar, enviando] = useActionState(activarAcceso.bind(null, token), null)
  const err = res?.errores ?? {}
  const id = (k: string) => `activar-${k}`
  const aria = (k: string) => (err[k] ? { "aria-invalid": true, "aria-describedby": `${id(k)}-error` } : {})
  const pinProps = {
    type: "password",
    inputMode: "numeric" as const,
    pattern: "[0-9]{4}",
    maxLength: 4,
    autoComplete: "new-password",
    placeholder: "••••",
    required: true,
    className: "h-11 w-32 bg-card text-center text-lg tracking-[0.4em]",
  }

  return (
    <form onSubmit={enviarSinLimpiar(enviar)} className="flex flex-col gap-4">
      {res?.error && (
        <p role="alert" className="flex items-center gap-2 rounded-xl bg-crit-bg px-3.5 py-2.5 text-sm font-semibold text-crit">
          <AlertTriangle className="size-4 shrink-0" aria-hidden />
          {res.error}
        </p>
      )}

      {conCorreo && (
        <>
          <Campo id={id("email")} etiqueta="Correo" error={err.email}>
            <Input id={id("email")} name="email" type="email" autoComplete="email" required className="h-11 bg-card" {...aria("email")} />
          </Campo>
          <Campo id={id("password")} etiqueta="Contraseña" ayuda="Al menos 10 caracteres." error={err.password}>
            <Input id={id("password")} name="password" type="password" autoComplete="new-password" minLength={10} required className="h-11 bg-card" {...aria("password")} />
          </Campo>
          <Campo id={id("password2")} etiqueta="Repite la contraseña" error={err.password2}>
            <Input id={id("password2")} name="password2" type="password" autoComplete="new-password" required className="h-11 bg-card" {...aria("password2")} />
          </Campo>
        </>
      )}

      <div className="flex flex-wrap gap-4">
        <Campo id={id("pin")} etiqueta="PIN de 4 números" error={err.pin}>
          <Input id={id("pin")} name="pin" {...pinProps} {...aria("pin")} />
        </Campo>
        <Campo id={id("pin2")} etiqueta="Repite el PIN" error={err.pin2}>
          <Input id={id("pin2")} name="pin2" {...pinProps} {...aria("pin2")} />
        </Campo>
      </div>

      <Button type="submit" size="lg" disabled={enviando} className="h-11">
        {enviando && <Loader2 className="animate-spin" aria-hidden />}
        Crear mi acceso y entrar
      </Button>
    </form>
  )
}
