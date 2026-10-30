/** Rectángulo a tapar, en fracciones de la página (0 a 1) para que no dependa de la resolución. */
export type Zona = { pagina: number; x: number; y: number; w: number; h: number }

export const ZONAS_REQUERIDAS = [
  { id: "proveedor", texto: "Proveedor (“Tested for”) y su sitio" },
  { id: "qr", texto: "Código QR" },
  { id: "foto", texto: "Foto del producto" },
  { id: "codigo", texto: "Código de acceso" },
  { id: "link", texto: "Link de verificación" },
] as const

export const TEXTO_FRANJA = "INFORMACIÓN PROTEGIDA"
