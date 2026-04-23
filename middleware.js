import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

// 1. Inicializar la conexión a Redis (Solo si las variables están configuradas)
const redis = process.env.UPSTASH_REDIS_REST_URL
  ? new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    })
  : null;

// 2. Configurar el limitador: 500 peticiones por cada 1 minuto (Aumentado para permitir operaciones masivas como borrado de carpetas)
const ratelimit = redis
  ? new Ratelimit({
      redis: redis,
      limiter: Ratelimit.slidingWindow(500, '1 m'),
      analytics: true,
    })
  : null;

export async function middleware(request) {
  // --- LÓGICA DE RATE LIMITING (Protección de API) ---
  if (request.nextUrl.pathname.startsWith('/api/')) {
    if (ratelimit) {
      const ip = request.ip ?? request.headers.get('x-forwarded-for') ?? '127.0.0.1';
      const { success, limit, reset, remaining } = await ratelimit.limit(`ratelimit_${ip}`);
      
      if (!success) {
        return NextResponse.json(
          { error: 'Demasiadas peticiones detectadas. Por favor, espera un minuto por seguridad.' },
          { status: 429, headers: { 'X-RateLimit-Limit': limit.toString(), 'X-RateLimit-Remaining': remaining.toString(), 'X-RateLimit-Reset': reset.toString() } }
        );
      }
    }
  }

  let response = NextResponse.next({ request: { headers: request.headers } })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        get(name) { return request.cookies.get(name)?.value },
        set(name, value, options) {
          request.cookies.set({ name, value, ...options })
          response = NextResponse.next({ request: { headers: request.headers } })
          response.cookies.set({ name, value, ...options })
        },
        remove(name, options) {
          request.cookies.set({ name, value: '', ...options })
          response = NextResponse.next({ request: { headers: request.headers } })
          response.cookies.set({ name, value: '', ...options })
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  // Si no está autenticado y trata de acceder a rutas protegidas → redirigir al login
  if (!user && request.nextUrl.pathname.startsWith('/dashboard')) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Si ya está autenticado y va al login → redirigir al dashboard
  if (user && request.nextUrl.pathname === '/login') {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return response
}

export const config = {
  // IMPORTANTE: Agregar /api/:path* para que el middleware intercepte las peticiones
  matcher: ['/api/:path*', '/dashboard/:path*', '/login'],
}
