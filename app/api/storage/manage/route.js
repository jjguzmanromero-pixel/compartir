import { NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase-server';
import { createClient } from '@supabase/supabase-js';
import { r2, BUCKET_NAME } from '../../../lib/r2';
import { PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export async function POST(req) {
  try {
    let supabaseQuery;
    let user;
    const authHeader = req.headers.get('authorization');
    
    if (authHeader) {
      supabaseQuery = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: authHeader, apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY } }
      });
      const { data } = await supabaseQuery.auth.getUser();
      user = data?.user;
    } else {
      supabaseQuery = await createServerSupabaseClient();
      const { data: { session } } = await supabaseQuery.auth.getSession();
      user = session?.user;
    }
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    const { path, action, contentType } = await req.json();
    
    // SEGURIDAD: Replicar el RLS de Supabase. Solo tú o un Admin pueden tocar esta carpeta.
    const { data: profile } = await supabaseQuery.from('profiles').select('role').eq('id', user.id).single();
    const isAdmin = profile?.role === 'admin';
    
    if (path && !path.startsWith(`${user.id}/`) && !isAdmin) {
      return NextResponse.json({ error: 'Acceso denegado a esta ruta' }, { status: 403 });
    }

    let command;
    if (action === 'upload') {
      command = new PutObjectCommand({ Bucket: BUCKET_NAME, Key: path, ContentType: contentType || 'application/octet-stream' });
    } else if (action === 'download') {
      command = new GetObjectCommand({ Bucket: BUCKET_NAME, Key: path });
    } else {
      return NextResponse.json({ error: 'Acción no válida' }, { status: 400 });
    }

    const signedUrl = await getSignedUrl(r2, command, { expiresIn: 3600 }); // Expira en 1 hora
    
    return NextResponse.json({ signedUrl });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}