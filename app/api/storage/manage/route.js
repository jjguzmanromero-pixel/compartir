import { NextResponse } from 'next/server';
import { createClient } from '../../../../lib/supabase-server';
import { r2, BUCKET_NAME } from '../../../../lib/r2';
import { ListObjectsV2Command, DeleteObjectsCommand, CopyObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

export async function POST(req) {
  try {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    const { action, path, targetPath, paths } = await req.json();

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', session.user.id).single();
    const isAdmin = profile?.role === 'admin';
    const isAllowed = (p) => p.startsWith(`${session.user.id}/`) || isAdmin;

    if (path && !isAllowed(path)) return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 });

    if (action === 'list') {
      const command = new ListObjectsV2Command({ Bucket: BUCKET_NAME, Prefix: path ? `${path}/` : '', Delimiter: '/' });
      const response = await r2.send(command);
      
      // Mapear la respuesta de S3 al formato exacto que tu Frontend espera
      const folders = (response.CommonPrefixes || []).map(p => ({
        name: p.Prefix.replace(path ? `${path}/` : '', '').replace(/\/$/, ''),
        metadata: null // metadata null indica que es una carpeta
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
      
      // S3 no tiene el comando "Move", requiere Copiar y luego Borrar el original
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