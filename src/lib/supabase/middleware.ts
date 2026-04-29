import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // Sin sesión → redirigir al login
  if (!user && pathname !== '/login') {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    const role = profile?.role

    // En login o raíz → redirigir al dashboard según rol
    if (pathname === '/' || pathname === '/login') {
      const dest =
        role === 'deposito' ? '/deposito/dashboard' : '/admin/dashboard'
      return NextResponse.redirect(new URL(dest, request.url))
    }

    // Ruta /admin/* → solo admins
    if (pathname.startsWith('/admin') && role !== 'admin') {
      return NextResponse.redirect(new URL('/deposito/dashboard', request.url))
    }

    // Ruta /deposito/* → solo depósito
    if (pathname.startsWith('/deposito') && role !== 'deposito') {
      return NextResponse.redirect(new URL('/admin/dashboard', request.url))
    }
  }

  return supabaseResponse
}
