import Link from "next/link"
import { ChevronLeft } from "lucide-react"

/** Ruta de regreso + título. Toda pantalla interna la lleva (WCAG 2.4.8). */
export function PageHeader({
  ruta,
  titulo,
  descripcion,
  acciones,
}: {
  /** Pares [texto, href]; el último es la pantalla actual (sin href). */
  ruta?: [string, string?][]
  titulo: string
  descripcion?: React.ReactNode
  acciones?: React.ReactNode
}) {
  const anterior = ruta && ruta.length > 1 ? ruta[ruta.length - 2] : null
  return (
    <div className="flex flex-col gap-3">
      {ruta && (
        <nav aria-label="Ruta" className="flex flex-wrap items-center gap-2 text-[12.5px] text-[#5c544c]">
          {anterior?.[1] && (
            <Link
              href={anterior[1]}
              aria-label={`Regresar a ${anterior[0]}`}
              className="inline-flex h-[30px] items-center gap-1 rounded-[9px] border bg-card pr-3 pl-2 font-semibold text-foreground"
            >
              <ChevronLeft className="size-3.5" aria-hidden />
              Regresar
            </Link>
          )}
          {ruta.map(([texto, href], i) => (
            <span key={texto} className="flex items-center gap-2">
              {i > 0 && <span className="text-taupe">/</span>}
              {href && i < ruta.length - 1 ? (
                <Link href={href} className="hover:underline">
                  {texto}
                </Link>
              ) : (
                <b className="text-foreground">{texto}</b>
              )}
            </span>
          ))}
        </nav>
      )}
      <div className="flex flex-wrap items-end gap-2.5">
        <div className="min-w-0 flex-1 basis-60">
          <h1 className="text-[30px] leading-tight font-medium">{titulo}</h1>
          {descripcion && <p className="mt-1 text-[12.5px] text-muted-foreground">{descripcion}</p>}
        </div>
        {acciones}
      </div>
    </div>
  )
}
