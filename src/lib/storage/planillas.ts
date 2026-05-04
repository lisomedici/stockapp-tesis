/**
 * Helpers para subir y leer planillas del bucket "planillas" de Supabase Storage.
 *
 * Estructura de path: `{empresa_id}/{yyyy-mm}/{uuid}.{ext}`
 *   - El primer folder es el `empresa_id`. Las RLS del bucket usan ese
 *     primer folder para aislar tenants (ver migración 005 + policies del bucket).
 *   - El segundo folder es el mes (yyyy-mm) para que la lista en Supabase
 *     Dashboard sea navegable.
 *   - El nombre final es un UUID + extensión derivada del MIME type.
 *
 * En la tabla `despachos.imagen_url` guardamos el PATH (no la URL firmada),
 * porque las URLs firmadas expiran. Cuando la UI necesite mostrar la imagen,
 * llama a `getSignedUrl(path)` y obtiene una URL temporal.
 */

import { createClient } from '@/lib/supabase/server'

const BUCKET = 'planillas'

const EXT_POR_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'application/pdf': 'pdf',
}

const SIGNED_URL_TTL_SECONDS = 60 * 60 // 1 hora

export type SubirPlanillaResult =
  | { ok: true; path: string }
  | { ok: false; error: string }

export type SignedUrlResult =
  | { ok: true; url: string }
  | { ok: false; error: string }

/**
 * Sube una planilla al bucket. Espera que el usuario esté logueado y que
 * la RLS del bucket valide que el primer folder del path coincide con su
 * `current_empresa_id()`.
 */
export async function subirPlanilla(
  fileBuffer: Buffer,
  mimeType: string,
  empresaId: string
): Promise<SubirPlanillaResult> {
  const ext = EXT_POR_MIME[mimeType]
  if (!ext) {
    return {
      ok: false,
      error: `Tipo de archivo no soportado: ${mimeType}. Aceptamos JPG, PNG, WebP, HEIC y PDF.`,
    }
  }

  const yyyyMm = new Date().toISOString().slice(0, 7) // 'YYYY-MM'
  const uuid = crypto.randomUUID()
  const path = `${empresaId}/${yyyyMm}/${uuid}.${ext}`

  const supabase = await createClient()
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, fileBuffer, {
      contentType: mimeType,
      upsert: false,
    })

  if (error) {
    return { ok: false, error: `Error al subir planilla: ${error.message}` }
  }

  return { ok: true, path }
}

/**
 * Genera una URL firmada temporal para leer una planilla guardada.
 * La URL expira en 1 hora; si la UI la necesita más tiempo, regenerar.
 */
export async function getSignedUrl(path: string): Promise<SignedUrlResult> {
  const supabase = await createClient()
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS)

  if (error || !data?.signedUrl) {
    return {
      ok: false,
      error: `No se pudo generar URL firmada: ${error?.message ?? 'desconocido'}`,
    }
  }

  return { ok: true, url: data.signedUrl }
}

/**
 * Lista de mime types aceptados, expuesta para el `accept` del input file.
 */
export const MIME_TYPES_ACEPTADOS = Object.keys(EXT_POR_MIME).join(',')
