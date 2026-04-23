import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '../../../../lib/supabase-server';
import { createClient } from '@supabase/supabase-js';
import { r2, BUCKET_NAME } from '../../../../lib/r2';
import { ListObjectsV2Command, DeleteObjectsCommand, CopyObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

export async function POST(req) {
  try {
    let supabaseQuery;
    let user;
    const authHeader = req.headers.get('authorization');
    
    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      supabaseQuery = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
      const { data } = await supabaseQuery.auth.getUser(token);
      user = data?.user;
    } else {
      supabaseQuery = await createServerSupabaseClient();
      const { data: { session } } = await supabaseQuery.auth.getSession();
      user = session?.user;
    }
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    const { action, path, targetPath, paths } = await req.json();
    
    const { data: profile } = await supabaseQuery.from('profiles').select('role').eq('id', user.id).single();
    const isAdmin = profile?.role === 'admin';
    const isAllowed = (p) => p === String(user.id) || p.startsWith(`${user.id}/`) || isAdmin;
    
    if (path && !isAllowed(path)) return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 });

    if (action === 'list') {
      const command = new ListObjectsV2Command({ Bucket: BUCKET_NAME, Prefix: path ? `${path}/` : '', Delimiter: '/' });
      const response = await r2.send(command);
      
      const folders = (response.CommonPrefixes || []).map(p => ({
        name: p.Prefix.replace(path ? `${path}/` : '', '').replace(/\/$/, ''),
        metadata: null
      }));
      
      const files = (response.Contents || []).filter(f => f.Key !== `${path}/`).map(f => ({
        name: f.Key.split('/').pop(),
        metadata: { size: f.Size, eTag: f.ETag },
        created_at: f.LastModified,
        updated_at: f.LastModified
      }));

      return NextResponse.json({ data: [...folders, ...files] });
    }

    if (action === 'delete') {
      if (!paths || paths.length === 0) return NextResponse.json({ success: true });
      if (!paths || !paths.every(isAllowed)) return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 });
      
      const command = new DeleteObjectsCommand({
        Bucket: BUCKET_NAME,
        Delete: { Objects: paths.map(p => ({ Key: p })) }
      });
      await r2.send(command);
      return NextResponse.json({ success: true });
    }

    if (action === 'move') {
      if (!isAllowed(targetPath)) return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 });
      
      await r2.send(new CopyObjectCommand({
        Bucket: BUCKET_NAME,
        CopySource: encodeURI(`${BUCKET_NAME}/${path}`),
        Key: targetPath
      }));
      
      await r2.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: path }));
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Acción no válida' }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}