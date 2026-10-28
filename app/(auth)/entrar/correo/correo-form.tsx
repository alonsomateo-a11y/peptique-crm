"use client"

import { useActionState } from "react"
import { AlertTriangle, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import { entrarConCorreo } from "../actions"

export function CorreoForm() {
  const [error, enviar, enviando] = useActionState(entrarConCorreo, null)
  return (
    <form action={enviar} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Correo</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required className="h-11 bg-card" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">Contraseña</Label>
        <Input id="password" name="password" type="password" autoComplete="current-password" required className="h-11 bg-card" />
      </div>
      {error && (
        <p role="alert" className="flex items-center gap-2 text-sm font-semibold text-crit">
          <AlertTriangle className="size-4" aria-hidden />
          {error}
        </p>
      )}
      <Button type="submit" size="lg" disabled={enviando} className="h-11">
        {enviando && <Loader2 className="animate-spin" aria-hidden />}
        Entrar
      </Button>
    </form>
  )
}
