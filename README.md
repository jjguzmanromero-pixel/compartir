# FileShare — Sistema de archivos privado por usuario
## Stack: Next.js 14 + Supabase + Vercel

---

## ¿Qué hace este sistema?

- Cada usuario se registra y tiene su **carpeta privada**
- Ningún usuario puede ver los archivos de otro
- El **Admin** ve todos los archivos y usuarios desde un panel especial
- Funciona 100% por internet, sin red local
- Gratis hasta ~1GB de storage (plan free de Supabase)

---

## Instalación paso a paso

### 1. Crear proyecto en Supabase

1. Ve a [supabase.com](https://supabase.com) → **New project**
2. Anota la **URL del proyecto** y la **anon key** (Settings → API)

### 2. Ejecutar el SQL

1. En Supabase → **SQL Editor** → **New query**
2. Copia y pega el contenido de `supabase/migrations/setup.sql`
3. Haz clic en **Run**

### 3. Crear el bucket de Storage

1. Supabase → **Storage** → **New bucket**
2. Nombre: `user-files`
3. **Desactiva** "Public bucket" (debe ser privado)
4. Guarda

### 4. Configurar variables de entorno

Copia el archivo de ejemplo:
```bash
cp .env.example .env.local
```

Edita `.env.local` con tus credenciales de Supabase:
```
NEXT_PUBLIC_SUPABASE_URL=https://TU_PROYECTO.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu_anon_key_aqui
```

### 5. Instalar y correr en local

```bash
npm install
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000)

### 6. Hacer a alguien Admin

Después de que el primer usuario se registre, ejecuta en el SQL Editor de Supabase:

```sql
update public.profiles set role = 'admin' where email = 'tu@correo.com';
```

---

## Desplegar en Vercel

### Opción A — Desde GitHub (recomendado)

1. Sube este proyecto a GitHub
2. Ve a [vercel.com](https://vercel.com) → **New Project**
3. Importa tu repositorio
4. En **Environment Variables**, agrega:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
5. Haz clic en **Deploy**

¡Listo! Vercel te dará una URL tipo `tu-app.vercel.app`

### Opción B — Desde terminal

```bash
npm i -g vercel
vercel
# Sigue las instrucciones, agrega las env vars cuando te lo pida
```

---

## Estructura del proyecto

```
fileshare/
├── app/
│   ├── layout.js          # Layout raíz
│   ├── page.js            # Redirige a /dashboard
│   ├── login/
│   │   └── page.js        # Pantalla de login/registro
│   └── dashboard/
│       └── page.js        # Dashboard (verifica sesión)
├── components/
│   └── DashboardClient.js # UI principal del dashboard
├── lib/
│   ├── supabase.js        # Cliente browser
│   └── supabase-server.js # Cliente server (SSR)
├── middleware.js           # Protección de rutas
├── supabase/
│   └── migrations/
│       └── setup.sql      # SQL para configurar Supabase
└── .env.example           # Plantilla de variables de entorno
```

---

## Cómo funciona la seguridad

La privacidad de archivos se garantiza mediante **Row Level Security (RLS)** en Supabase:

- Los archivos se guardan en paths con formato: `{user_id}/{timestamp}_{nombre}`
- Las políticas RLS verifican que `auth.uid()` coincida con la carpeta del archivo
- **Ni siquiera con la API directa** puede un usuario acceder a archivos ajenos
- El Admin tiene políticas especiales que le permiten ver y eliminar cualquier archivo

---

## Personalización

| Qué cambiar | Dónde |
|---|---|
| Nombre de la app | `app/layout.js` y `components/DashboardClient.js` |
| Colores / diseño | `app/globals.css` y clases Tailwind en los componentes |
| Tamaño máximo de archivos | Supabase Dashboard → Storage → Settings |
| Tipos de archivo permitidos | `components/DashboardClient.js` función `uploadFiles` |
| Agregar más roles | `supabase/migrations/setup.sql` check constraint en `profiles.role` |
