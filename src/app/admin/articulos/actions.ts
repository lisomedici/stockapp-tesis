'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function createArticulo(formData: {
  nombre: string
  descripcion: string
}) {
  const supabase = await createClient()

  const nombre = formData.nombre.trim()
  if (!nombre) return { error: 'El nombre es obligatorio.' }

  const { error } = await supabase.from('articulos').insert({
    nombre,
    descripcion: formData.descripcion.trim() || null,
  })

  if (error) return { error: error.message }

  revalidatePath('/admin/articulos')
  return { success: true }
}
