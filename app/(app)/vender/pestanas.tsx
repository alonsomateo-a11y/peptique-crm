import Link from "next/link"

import { cn } from "@/lib/utils"

export function PestanasVender({ actual }: { actual: "vender" | "mis-ventas" }) {
  return (
    <nav aria-label="Vender" className="flex gap-1 border-b">
      {[
        ["vender", "/vender", "Vender"],
        ["mis-ventas", "/vender/mis-ventas", "Mis ventas"],
      ].map(([id, href, texto]) => (
        <Link
          key={id}
          href={href}
          aria-current={actual === id ? "page" : undefined}
          className={cn("-mb-px border-b-2 border-transparent px-3 py-2 text-[13px] font-semibold text-muted-foreground", actual === id && "border-espresso text-foreground")}
        >
          {texto}
        </Link>
      ))}
    </nav>
  )
}
