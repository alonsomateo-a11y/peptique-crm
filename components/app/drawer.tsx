"use client"

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"

/** Drawer lateral para crear o editar (los modales se reservan para confirmar). */
export function Drawer({
  abierto,
  onOpenChange,
  titulo,
  descripcion,
  children,
}: {
  abierto: boolean
  onOpenChange: (v: boolean) => void
  titulo: string
  descripcion?: string
  children: React.ReactNode
}) {
  return (
    <Sheet open={abierto} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 bg-card data-[side=right]:sm:max-w-[560px]">
        <SheetHeader className="border-b px-6 py-5">
          <SheetTitle className="text-[22px]">{titulo}</SheetTitle>
          {descripcion && <SheetDescription className="text-[12.5px]">{descripcion}</SheetDescription>}
        </SheetHeader>
        {children}
      </SheetContent>
    </Sheet>
  )
}

/** Cuerpo con scroll y pie fijo con las acciones. */
export function DrawerCuerpo({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-6 py-5">{children}</div>
}

export function DrawerPie({ children }: { children: React.ReactNode }) {
  return <div className="flex justify-end gap-2 border-t bg-hueso-2 px-6 py-4">{children}</div>
}
