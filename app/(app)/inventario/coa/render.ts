// Solo en el navegador: dibuja el COA original en imágenes y arma el PDF público aplanado.
import { PDFDocument } from "pdf-lib"

import { TEXTO_FRANJA, type Zona } from "./tipos"

export type Pagina = { src: string; ancho: number; alto: number; anchoPt: number; altoPt: number; canvas: HTMLCanvasElement }

const ESCALA = 2.5 // ~180 dpi: se lee bien y el archivo no pesa de más

export async function cargarPaginas(url: string, tipo: string): Promise<Pagina[]> {
  const datos = await fetch(url).then((r) => {
    if (!r.ok) throw new Error("No se pudo descargar el COA.")
    return r.arrayBuffer()
  })
  if (tipo === "pdf") {
    const pdfjs = await import("pdfjs-dist")
    pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs"
    const doc = await pdfjs.getDocument({ data: datos }).promise
    const paginas: Pagina[] = []
    for (let i = 1; i <= doc.numPages; i++) {
      const p = await doc.getPage(i)
      const base = p.getViewport({ scale: 1 })
      const vista = p.getViewport({ scale: ESCALA })
      const canvas = document.createElement("canvas")
      canvas.width = Math.round(vista.width)
      canvas.height = Math.round(vista.height)
      await p.render({ canvasContext: canvas.getContext("2d")!, viewport: vista }).promise
      paginas.push({ src: canvas.toDataURL("image/png"), ancho: canvas.width, alto: canvas.height, anchoPt: base.width, altoPt: base.height, canvas })
    }
    await doc.destroy()
    return paginas
  }
  const img = await createImageBitmap(new Blob([datos]))
  const canvas = document.createElement("canvas")
  canvas.width = img.width
  canvas.height = img.height
  canvas.getContext("2d")!.drawImage(img, 0, 0)
  return [{ src: canvas.toDataURL("image/png"), ancho: img.width, alto: img.height, anchoPt: img.width * 0.75, altoPt: img.height * 0.75, canvas }]
}

/** Pinta franjas con el texto centrado; lo que queda debajo se pierde al rasterizar. */
function pintarFranjas(ctx: CanvasRenderingContext2D, zonas: Zona[], ancho: number, alto: number) {
  for (const z of zonas) {
    const x = z.x * ancho
    const y = z.y * alto
    const w = z.w * ancho
    const h = z.h * alto
    ctx.fillStyle = "#2b2622"
    ctx.fillRect(x, y, w, h)
    const tam = Math.max(8, Math.min(h * 0.42, (w / TEXTO_FRANJA.length) * 1.55))
    ctx.font = `800 ${tam}px Manrope, Arial, sans-serif`
    ctx.fillStyle = "#f5f0ea"
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    if (w > tam * 4) ctx.fillText(TEXTO_FRANJA, x + w / 2, y + h / 2, w * 0.92)
  }
}

/**
 * PDF público: cada página es una imagen con las franjas ya pintadas (no hay capa de texto
 * debajo) y el documento se crea sin metadatos del original.
 */
export async function generarPdfPublico(paginas: Pagina[], zonas: Zona[]): Promise<Blob> {
  const pdf = await PDFDocument.create({ updateMetadata: false })
  pdf.setProducer("Peptique")
  pdf.setCreator("Peptique")
  pdf.setTitle("Certificado de análisis")
  for (let i = 0; i < paginas.length; i++) {
    const p = paginas[i]
    const canvas = document.createElement("canvas")
    canvas.width = p.ancho
    canvas.height = p.alto
    const ctx = canvas.getContext("2d")!
    ctx.drawImage(p.canvas, 0, 0)
    pintarFranjas(ctx, zonas.filter((z) => z.pagina === i), p.ancho, p.alto)
    const jpg = await new Promise<Blob>((ok, mal) => canvas.toBlob((b) => (b ? ok(b) : mal(new Error("No se pudo generar la página."))), "image/jpeg", 0.9))
    const imagen = await pdf.embedJpg(await jpg.arrayBuffer())
    const pagina = pdf.addPage([p.anchoPt, p.altoPt])
    pagina.drawImage(imagen, { x: 0, y: 0, width: p.anchoPt, height: p.altoPt })
  }
  const bytes = await pdf.save()
  return new Blob([bytes as BlobPart], { type: "application/pdf" })
}
