import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '../../../../lib/supabase-server';
import { createClient } from '@supabase/supabase-js';
import { r2, BUCKET_NAME } from '../../../../lib/r2';
import { 
  PutObjectCommand, 
  GetObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

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

    const { path, action, contentType, uploadId, partNumber, parts } = await req.json();
    
    // SEGURIDAD: Replicar el RLS de Supabase. Solo tú o un Admin pueden tocar esta carpeta.
    const { data: profile } = await supabaseQuery.from('profiles').select('role').eq('id', user.id).single();
    const isAdmin = profile?.role === 'admin';
    const isAllowed = (p) => p === String(user.id) || p.startsWith(`${user.id}/`) || isAdmin;
    
    if (path && !isAllowed(path)) {
      return NextResponse.json({ error: 'Acceso denegado a esta ruta' }, { status: 403 });
    }

    let command;
    if (action === 'upload') {
      command = new PutObjectCommand({ Bucket: BUCKET_NAME, Key: path, ContentType: contentType || 'application/octet-stream' });
    } else if (action === 'download') {
      command = new GetObjectCommand({ Bucket: BUCKET_NAME, Key: path });
    } else if (action === 'createMultipartUpload') {
      const createCmd = new CreateMultipartUploadCommand({ Bucket: BUCKET_NAME, Key: path, ContentType: contentType || 'application/octet-stream' });
      const res = await r2.send(createCmd);
      return NextResponse.json({ uploadId: res.UploadId });
    } else if (action === 'uploadPart') {
      command = new UploadPartCommand({ Bucket: BUCKET_NAME, Key: path, UploadId: uploadId, PartNumber: partNumber });
    } else if (action === 'completeMultipartUpload') {
      const completeCmd = new CompleteMultipartUploadCommand({
        Bucket: BUCKET_NAME,
        Key: path,
        UploadId: uploadId,
        MultipartUpload: { Parts: parts }
      });
      await r2.send(completeCmd);
      return NextResponse.json({ success: true });
    } else if (action === 'abortMultipartUpload') {
      const abortCmd = new AbortMultipartUploadCommand({ Bucket: BUCKET_NAME, Key: path, UploadId: uploadId });
      await r2.send(abortCmd);
      return NextResponse.json({ success: true });
    } else {
      return NextResponse.json({ error: 'Acción no válida' }, { status: 400 });
    }

    const signedUrl = await getSignedUrl(r2, command, { expiresIn: 3600 }); // Expira en 1 hora
    
    return NextResponse.json({ signedUrl });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}