import { startTransition, type FormEvent } from "react"

/**
 * Envía un <form> a una acción de useActionState sin que React limpie los campos
 * (con action={...} React 19 los resetea aunque la validación falle).
 */
export const enviarSinLimpiar = (accion: (datos: FormData) => void) => (e: FormEvent<HTMLFormElement>) => {
  e.preventDefault()
  const datos = new FormData(e.currentTarget)
  startTransition(() => accion(datos))
}
