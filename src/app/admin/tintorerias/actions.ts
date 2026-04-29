'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function createTintoreria(formData: { nombre: string }) {
  const supabase = await createClient()

  const nombre = formData.nombre.trim()
  if (!nombre) return { error: 'El nombre es obligatorio.' }

  const { error } = await supabase.from('tintorerias').insert({ nombre })

  if (error) return { error: error.message }

  revalidatePath('/admin/tintorerias')
  return { success: true }
}
