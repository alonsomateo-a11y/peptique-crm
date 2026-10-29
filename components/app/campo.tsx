import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

/** Etiqueta + control + ayuda/error, con aria enlazado. */
export function Campo({
  id,
  etiqueta,
  ayuda,
  error,
  className,
  children,
}: {
  id: string
  etiqueta: string
  ayuda?: React.ReactNode
  error?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <Label htmlFor={id} className="text-[12.5px] font-semibold">
        {etiqueta}
      </Label>
      {children}
      {error ? (
        <span id={`${id}-error`} role="alert" className="text-[11.5px] font-semibold text-crit">
          {error}
        </span>
      ) : (
        ayuda && <span className="text-[11.5px] text-muted-foreground">{ayuda}</span>
      )}
    </div>
  )
}

/** Número dentro de un círculo para enlazar pantalla y nota (como en el wireframe). */
export function TituloSeccion({ children, extra }: { children: React.ReactNode; extra?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <h3 className="flex-1 font-sans text-[13px] font-bold">{children}</h3>
      {extra}
    </div>
  )
}
