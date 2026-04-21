'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '../lib/supabase'

const BUCKET = 'user-files'

function formatBytes(bytes) {
  if (!bytes) return '—'
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

function encodeSafe(str) {
  if (!str) return str;
  let encoded = encodeURIComponent(str);
  encoded = encoded.replace(/[!'()*~]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
  encoded = encoded.replace(/_/g, '__');
  return encoded.replace(/%/g, '_p');
}

function decodeSafe(str) {
  if (!str) return str;
  let decoded = str.replace(/_([_p])/g, match => match === '__' ? '_' : '%');
  try { return decodeURIComponent(decoded); } catch (e) { return str; }
}

function getIcon(name) {
  const ext = name?.split('.').pop()?.toLowerCase()
  const icons = {
    pdf: '📄', doc: '📝', docx: '📝', xls: '📊', xlsx: '📊',
    ppt: '📽️', pptx: '📽️',
    jpg: '🖼️', jpeg: '🖼️', png: '🖼️', gif: '🖼️', webp: '🖼️',
    mp4: '🎬', mov: '🎬', avi: '🎬', mp3: '🎵', wav: '🎵',
    zip: '📦', rar: '📦', '7z': '📦', txt: '📃', csv: '📃',
    js: '💻', ts: '💻', py: '💻', html: '💻', css: '💻',
  }
  return icons[ext] || ''
}

export default function DashboardClient({ user, isAdmin }) {
  const [files, setFiles] = useState([])
  const [allFiles, setAllFiles] = useState([]) // solo admin
  const [allUsers, setAllUsers] = useState([]) // solo admin
  const [trashFiles, setTrashFiles] = useState([])
  const [currentPath, setCurrentPath] = useState('') // Ruta de carpetas actual
  const [devices, setDevices] = useState([]) // solo admin
  const [uploading, setUploading] = useState(false)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('mis-archivos') // 'mis-archivos' | 'todos' | 'usuarios'
  const [dragOver, setDragOver] = useState(false)
  const [viewMode, setViewMode] = useState('list') // 'list' | 'grid'
  const [search, setSearch] = useState('')
  const [uploadError, setUploadError] = useState('')
  const [expandedUser, setExpandedUser] = useState(null)
  const [listError, setListError] = useState('')
  const fileRef = useRef()
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => { 
    loadFiles() 
    
    // Realtime: Reaccionar al instante si el Agente Local u otro usuario sube/borra archivos
    const channel = supabase.channel('realtime-dashboard')
      .on('postgres_changes', { event: '*', schema: 'storage', table: 'objects' }, () => {
        loadFiles() // Refresca la lista visible sin importar en qué pestaña estés
      })
      .subscribe()
      
    return () => { supabase.removeChannel(channel) }
  }, [currentPath]) // Recargar si cambian de carpeta

  async function loadFiles() {
    setLoading(true)
    setListError('')
    const folderToFetch = currentPath ? `${user.id}/${currentPath}` : user.id
    console.log('🔍 Buscando archivos en la ruta:', folderToFetch)

    // Archivos del usuario actual
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .list(folderToFetch, { limit: 10000, sortBy: { column: 'created_at', order: 'desc' } })
      
    console.log('📡 Resultado de Supabase:', data, error)

    if (error) {
      setListError(error.message)
    }
    
    setFiles(Array.isArray(data) ? data : [])

    // Archivos de la Papelera
    const { data: tData } = await supabase.storage.from(BUCKET).list(`${user.id}/.papelera`, { limit: 10000, sortBy: { column: 'created_at', order: 'desc' } })
    setTrashFiles(Array.isArray(tData) ? tData : [])

    // Si es admin, cargar todos los archivos y usuarios
    if (isAdmin) {
      const { data: users } = await supabase.from('profiles').select('*')
      setAllUsers(users || [])

      const { data: devs } = await supabase.from('user_devices').select('*').order('created_at', { ascending: false })
      setDevices(devs || [])

      // Listar archivos de cada usuario
      const allF = []
      for (const u of users || []) {
        const { data: uf, error: ufError } = await supabase.storage
          .from(BUCKET)
          .list(u.id, { limit: 10000 })
          
        if (ufError) {
          console.error(`Error al listar archivos de ${u.email}:`, ufError.message)
        } else if (Array.isArray(uf)) {
          allF.push(...uf.map(f => ({ ...f, ownerEmail: u.email, ownerId: u.id })))
        }
      }
      setAllFiles(allF)
    }
    setLoading(false)
  }

  // Helper para generar las rutas dependiendo de si estás en una subcarpeta
  function getFilePath(fileName, ownerId) {
    if (ownerId) return `${ownerId}/${fileName}`
    return currentPath ? `${user.id}/${currentPath}/${fileName}` : `${user.id}/${fileName}`
  }

  async function createFolder() {
    const folderName = prompt('Nombre de la nueva carpeta:')
    if (!folderName) return
    const safeName = encodeSafe(folderName)
    const folderPath = currentPath ? `${user.id}/${currentPath}/${safeName}` : `${user.id}/${safeName}`
    
    setUploading(true)
    await supabase.storage.from(BUCKET).upload(`${folderPath}/.emptyFolderPlaceholder`, new Blob(['']))
    await loadFiles()
    setUploading(false)
  }

  async function uploadFiles(fileList) {
    if (!fileList || fileList.length === 0) return

    // Convertir a arreglo inmediatamente para no perder referencias
    const filesArray = Array.from(fileList)

    // Limpiar el input para permitir seleccionar el mismo archivo de nuevo
    if (fileRef.current) fileRef.current.value = ''

    setUploading(true)
    setUploadError('')

    try {
      for (const file of filesArray) {
        const safeName = encodeSafe(file.name)
        const folderPath = currentPath ? `${user.id}/${currentPath}` : user.id
        const path = `${folderPath}/${safeName}`
        const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
          cacheControl: '3600',
          upsert: true, // Permitir sobrescribir el archivo si se edita
        })
        if (error) {
          setUploadError(`Error al subir "${file.name}": ${error.message}`)
          setUploading(false)
          return
        }
      }
      await loadFiles()
    } catch (err) {
      setUploadError(`Ocurrió un error inesperado: ${err.message}`)
    }
    setUploading(false)
  }

  async function deleteFile(fileName, ownerId) {
    const path = getFilePath(fileName, ownerId)
    const basePath = `${ownerId || user.id}`
    const relativePath = path.substring(basePath.length + 1) // Obtener ruta sin el ID del usuario
    const trashName = relativePath.replace(/\//g, '___') // Codificar carpetas con ___
    const trashPath = `${basePath}/.papelera/${trashName}`
    
    // Optimización: Soft Delete (Mover a Papelera)
    let { error } = await supabase.storage.from(BUCKET).move(path, trashPath)
    
    // Si el movimiento falla, puede ser porque la carpeta .papelera no existe.
    // La creamos subiendo un placeholder y reintentamos.
    if (error && error.message.includes('does not exist')) {
      console.warn("Move failed, creating .papelera folder and retrying...");
      // Crear placeholder para forzar la creación de la carpeta
      await supabase.storage.from(BUCKET).upload(`${basePath}/.papelera/.emptyFolderPlaceholder`, new Blob(['']));
      
      // Reintentar el movimiento
      const { error: retryError } = await supabase.storage.from(BUCKET).move(path, trashPath);
      error = retryError;
    }

    // Si después de reintentar sigue fallando, hacemos un borrado definitivo como fallback.
    if (error) {
      console.error("Error al mover a papelera:", error);
      await supabase.storage.from(BUCKET).remove([path])
    }

    await loadFiles()
  }

  async function restoreFile(fileName, ownerId) {
    const basePath = `${ownerId || user.id}`
    const originalRelativePath = fileName.replace(/___/g, '/') // Decodificar ruta original
    await supabase.storage.from(BUCKET).move(`${basePath}/.papelera/${fileName}`, `${basePath}/${originalRelativePath}`)
    await loadFiles()
  }

  async function hardDeleteFile(fileName, ownerId) {
    await supabase.storage.from(BUCKET).remove([`${ownerId || user.id}/.papelera/${fileName}`])
    await loadFiles()
  }

  async function emptyTrash() {
    const validFiles = trashFiles.filter(f => f.name !== '.emptyFolderPlaceholder')
    if (validFiles.length === 0) return
    if (!confirm("¿Estás seguro de que quieres vaciar la papelera? Esta acción eliminará los archivos permanentemente y no se puede deshacer.")) return
    
    setLoading(true)
    const paths = trashFiles.map(f => `${user.id}/.papelera/${f.name}`)
    
    for (let i = 0; i < paths.length; i += 100) {
      const chunk = paths.slice(i, i + 100)
      await supabase.storage.from(BUCKET).remove(chunk)
    }
    await loadFiles()
  }

  async function shareFile(fileName, ownerId) {
    const path = getFilePath(fileName, ownerId)
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60 * 48) // Cadupe en 48 horas
    if (error) return alert("Error al generar enlace: " + error.message)
    
    try {
      await navigator.clipboard.writeText(data.signedUrl)
      alert("✅ Enlace público copiado al portapapeles.\nCualquier persona con el enlace podrá descargarlo por 48 horas.")
    } catch (e) {
      prompt("Copia este enlace público (Cadupe en 48h):", data.signedUrl)
    }
  }

  async function downloadFile(fileName, ownerId) {
    const path = getFilePath(fileName, ownerId)
    const { data } = await supabase.storage.from(BUCKET).download(path)
    if (!data) return
    const url = URL.createObjectURL(data)
    const a = document.createElement('a')
    a.href = url
    a.download = decodeSafe(fileName.replace(/^\d+_/, '')) // decodificar el nombre original
    a.click()
    URL.revokeObjectURL(url)
  }

  async function toggleUserSuspension(userId, currentStatus) {
    const { error } = await supabase
      .from('profiles')
      .update({ is_suspended: !currentStatus })
      .eq('id', userId)

    if (!error) {
      setAllUsers(allUsers.map(u => u.id === userId ? { ...u, is_suspended: !currentStatus } : u))
    } else {
      alert("Error al actualizar usuario: " + error.message)
    }
  }

  async function toggleLocalSync(userId, currentStatus) {
    const { error } = await supabase
      .from('profiles')
      .update({ sync_local: !currentStatus })
      .eq('id', userId)

    if (!error) {
      setAllUsers(allUsers.map(u => u.id === userId ? { ...u, sync_local: !currentStatus } : u))
    } else {
      alert("Error al actualizar sincronización: " + error.message)
    }
  }

  async function updateDeviceStatus(deviceId, newStatus) {
    const { error } = await supabase
      .from('user_devices')
      .update({ status: newStatus })
      .eq('id', deviceId)

    if (!error) {
      setDevices(devices.map(d => d.id === deviceId ? { ...d, status: newStatus } : d))
    } else {
      alert("Error al actualizar equipo: " + error.message)
    }
  }

  async function logout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const displayName = user.email.split('@')[0]
  const initials = displayName.slice(0, 2).toUpperCase()

  const filteredFiles = files.filter(f =>
    f.name?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="min-h-screen bg-[#f7f6f3]">

      {/* Sidebar */}
      <div className="fixed left-0 top-0 h-full w-56 bg-white border-r border-[#e8e6e0] flex flex-col z-10">
        {/* Logo */}
        <div className="p-5 border-b border-[#e8e6e0]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#1a1a1a] flex items-center justify-center">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
            </div>
            <span className="font-semibold text-[15px] text-[#1a1a1a]">FileShare</span>
          </div>
        </div>

        {/* Nav */}
        <nav className="p-3 flex-1">
          <button
            onClick={() => setTab('mis-archivos')}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm mb-1 transition-all ${
              tab === 'mis-archivos'
                ? 'bg-[#1a1a1a] text-white font-medium'
                : 'text-[#555] hover:bg-[#f7f6f3]'
            }`}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
            Mis archivos
          </button>

          <button
            onClick={() => setTab('papelera')}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm mb-1 transition-all ${
              tab === 'papelera'
                ? 'bg-[#1a1a1a] text-white font-medium'
                : 'text-[#555] hover:bg-[#f7f6f3]'
            }`}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
            Papelera
          </button>

          {isAdmin && (
            <>
              <div className="px-3 pt-4 pb-1">
                <span className="text-[10px] font-medium text-[#bbb] uppercase tracking-widest">Admin</span>
              </div>
              <button
                onClick={() => setTab('todos')}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm mb-1 transition-all ${
                  tab === 'todos'
                    ? 'bg-[#1a1a1a] text-white font-medium'
                    : 'text-[#555] hover:bg-[#f7f6f3]'
                }`}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
                Todos los archivos
              </button>
              <button
                onClick={() => setTab('usuarios')}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm mb-1 transition-all ${
                  tab === 'usuarios'
                    ? 'bg-[#1a1a1a] text-white font-medium'
                    : 'text-[#555] hover:bg-[#f7f6f3]'
                }`}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                Usuarios
              </button>
              <button
                onClick={() => setTab('autorizaciones')}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm mb-1 transition-all ${
                  tab === 'autorizaciones'
                    ? 'bg-[#1a1a1a] text-white font-medium'
                    : 'text-[#555] hover:bg-[#f7f6f3]'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                  Autorizaciones
                </div>
                {devices.filter(d => d.status === 'pending').length > 0 && (
                  <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                    {devices.filter(d => d.status === 'pending').length}
                  </span>
                )}
              </button>
              <a
                href="/dashboard/invitaciones"
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm mb-1 text-[#555] hover:bg-[#f7f6f3] transition-all"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13.5 19.79 19.79 0 0 1 1.62 4.9 2 2 0 0 1 3.6 2.71h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 10.1a16 16 0 0 0 6 6l.92-.92a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 21.73 17.5z"/></svg>
                Invitaciones
              </a>
            </>
          )}

          {/* Sincronización Local */}
          <div className="px-3 pt-4 pb-1">
            <span className="text-[10px] font-medium text-[#bbb] uppercase tracking-widest">Sincronización</span>
          </div>
          <button
            onClick={async () => {
              try {
                const { data: { session } } = await supabase.auth.getSession();
                const res = await fetch('http://localhost:4000/pick-folder', { 
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ session })
                });
                if (!res.ok) throw new Error('Agent down');
                const data = await res.json();
                alert(`✅ Carpeta vinculada con éxito en tu computadora:\n\n${data.folder}\n\nTodos los cambios se reflejarán de inmediato.`);
              } catch (err) {
                alert('❌ No se pudo conectar con el Agente Local.\n\nAsegúrate de tener abierta tu terminal corriendo el comando:\nnode sync-agent.js');
              }
            }}
            className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm mb-1 text-[#555] hover:bg-[#f7f6f3] transition-all"
          >
            <div className="flex items-center gap-2.5">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              Vincular PC
            </div>
          </button>
        </nav>

        {/* User info */}
        <div className="p-3 border-t border-[#e8e6e0]">
          <div className="flex items-center gap-2.5 px-2 py-2">
            <div className="w-8 h-8 rounded-full bg-[#e8e6e0] flex items-center justify-center text-xs font-medium text-[#555]">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-[#1a1a1a] truncate">{displayName}</p>
              <p className="text-[10px] text-[#aaa] truncate" title={user.id}>{isAdmin ? 'Administrador' : 'Usuario'} • {user.id.slice(0, 8)}</p>
            </div>
            <button onClick={logout} className="text-[#bbb] hover:text-[#555] transition-colors" title="Cerrar sesión">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            </button>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="ml-56 p-8">

        {/* MIS ARCHIVOS */}
        {tab === 'mis-archivos' && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-xl font-semibold text-[#1a1a1a]">Mis archivos</h1>
                <p className="text-sm text-[#888] mt-0.5">{files.length} archivo{files.length !== 1 ? 's' : ''}</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={createFolder}
                  disabled={uploading}
                  className="flex items-center gap-2 px-4 py-2 bg-white border border-[#e8e6e0] text-[#1a1a1a] rounded-xl text-sm font-medium hover:bg-[#f7f6f3] active:scale-[0.98] transition-all disabled:opacity-50"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>
                  Nueva carpeta
                </button>
                <button
                  onClick={() => fileRef.current.click()}
                  disabled={uploading}
                  className="flex items-center gap-2 px-4 py-2 bg-[#1a1a1a] text-white rounded-xl text-sm font-medium hover:bg-[#333] active:scale-[0.98] transition-all disabled:opacity-50"
                >
                  {uploading ? (
                    <>
                      <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                      Subiendo...
                    </>
                  ) : (
                    <>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                      Subir archivo
                    </>
                  )}
                </button>
              </div>
              <input ref={fileRef} type="file" multiple className="hidden" onChange={e => uploadFiles(e.target.files)} />
            </div>

            {/* Error de upload */}
            {uploadError && (
              <div className="text-xs px-3 py-2.5 rounded-xl bg-red-50 text-red-600 border border-red-100 mb-4">
                ✗ {uploadError}
              </div>
            )}

            {/* Error de listado de archivos */}
            {listError && (
              <div className="text-xs px-3 py-2.5 rounded-xl bg-amber-50 text-amber-700 border border-amber-200 mb-4">
                ⚠️ <strong>Error al cargar archivos:</strong> {listError}
              </div>
            )}

            {/* Búsqueda */}
            {files.length > 0 && (
              <div className="relative mb-4">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-[#bbb]" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input
                  type="text"
                  placeholder="Buscar archivos..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 rounded-xl border border-[#e8e6e0] text-sm bg-white focus:outline-none focus:border-[#1a1a1a] transition-colors"
                />
              </div>
            )}

            {/* Migas de pan y Controles de Vista */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
              <div className="flex items-center gap-2 text-sm overflow-x-auto whitespace-nowrap pb-1 sm:pb-0">
                <button onClick={() => setCurrentPath('')} className="text-[#555] hover:text-[#1a1a1a] font-medium">Mis archivos</button>
                {currentPath && currentPath.split('/').map((part, idx, arr) => (
                  <span key={idx} className="flex items-center gap-2">
                    <span className="text-[#ccc]">/</span>
                    <button 
                      onClick={() => setCurrentPath(arr.slice(0, idx + 1).join('/'))}
                      className="text-[#555] hover:text-[#1a1a1a] font-medium"
                    >
                      {decodeSafe(part)}
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex bg-[#f7f6f3] p-1 rounded-lg border border-[#e8e6e0] shrink-0 self-start sm:self-auto">
                <button onClick={() => setViewMode('list')} className={`p-1.5 rounded-md transition-all ${viewMode === 'list' ? 'bg-white shadow-sm text-[#1a1a1a]' : 'text-[#aaa] hover:text-[#555]'}`} title="Vista de lista">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
                </button>
                <button onClick={() => setViewMode('grid')} className={`p-1.5 rounded-md transition-all ${viewMode === 'grid' ? 'bg-white shadow-sm text-[#1a1a1a]' : 'text-[#aaa] hover:text-[#555]'}`} title="Vista de cuadrícula">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
                </button>
              </div>
            </div>

            {/* Drop zone */}
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); uploadFiles(e.dataTransfer.files) }}
              onClick={() => files.length === 0 && fileRef.current.click()}
              className={`border-2 border-dashed rounded-2xl transition-all mb-4 ${
                dragOver
                  ? 'border-[#1a1a1a] bg-[#f0ede8]'
                  : files.length === 0
                  ? 'border-[#d8d5cf] bg-white cursor-pointer hover:border-[#1a1a1a] hover:bg-[#f0ede8]'
                  : 'border-transparent'
              }`}
            >
              {files.length === 0 && !loading && (
                <div className="py-16 text-center">
                  <div className="text-4xl mb-3">📂</div>
                  <p className="text-sm font-medium text-[#555]">Arrastra archivos aquí</p>
                  <p className="text-xs text-[#aaa] mt-1">o haz clic para seleccionar</p>
                </div>
              )}
            </div>

            {/* Lista de archivos */}
            {loading && files.length === 0 ? (
              <div className="text-center py-12 text-[#aaa] text-sm">Cargando...</div>
            ) : (
              <div className={viewMode === 'grid' ? "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4" : "space-y-1.5"}>
                {filteredFiles.filter(f => f.name !== '.emptyFolderPlaceholder' && f.name !== '.papelera').map(file => {
                  const isFolder = !file.metadata; // Supabase retorna nulo en metadatos para carpetas
                  return (
                    <div key={file.id || file.name} className={viewMode === 'grid' ? "flex flex-col items-center text-center p-4 bg-white rounded-xl border border-[#e8e6e0] hover:border-[#ccc] transition-all group relative" : "flex items-center gap-3 bg-white rounded-xl px-4 py-3 border border-[#e8e6e0] hover:border-[#ccc] transition-all group"}>
                      <span className={viewMode === 'grid' ? "text-4xl mb-3" : "text-xl"}>{isFolder ? '📁' : getIcon(file.name)}</span>
                      <div className={viewMode === 'grid' ? "w-full min-w-0" : "flex-1 min-w-0"}>
                        {isFolder ? (
                          <button onClick={() => setCurrentPath(currentPath ? `${currentPath}/${file.name}` : file.name)} className={`text-sm font-medium text-[#1a1a1a] truncate hover:underline ${viewMode === 'grid' ? 'block w-full' : ''}`}>
                            {decodeSafe(file.name)}
                          </button>
                        ) : (
                          <p className="text-sm font-medium text-[#1a1a1a] truncate">
                            {decodeSafe(file.name.replace(/^\d+_/, ''))}
                          </p>
                        )}
                        <p className="text-xs text-[#aaa] mt-0.5">{isFolder ? 'Carpeta' : formatBytes(file.metadata?.size)}</p>
                      </div>
                      <div className={viewMode === 'grid' ? "absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 p-1 rounded-lg shadow-sm border border-[#e8e6e0]" : "flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity"}>
                        {!isFolder && (
                          <>
                            <button onClick={() => shareFile(file.name, null)} className="p-1.5 rounded-lg hover:bg-blue-50 text-[#bbb] hover:text-blue-500 transition-colors" title="Copiar enlace">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                            </button>
                            <button onClick={() => downloadFile(file.name, null)} className="p-1.5 rounded-lg hover:bg-[#f7f6f3] text-[#888] transition-colors" title="Descargar">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                            </button>
                          </>
                        )}
                        <button onClick={() => isFolder ? alert('Para eliminar la carpeta, primero entra en ella y elimina sus archivos.') : deleteFile(file.name, null)} className="p-1.5 rounded-lg hover:bg-red-50 text-[#bbb] hover:text-red-500 transition-colors" title="Eliminar">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* PAPELERA */}
        {tab === 'papelera' && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-xl font-semibold text-[#1a1a1a]">Papelera de reciclaje</h1>
                <p className="text-sm text-[#888] mt-0.5">Tus archivos eliminados recientemente</p>
              </div>
              {trashFiles.filter(f => f.name !== '.emptyFolderPlaceholder').length > 0 && (
                <button
                  onClick={emptyTrash}
                  disabled={loading}
                  className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 border border-red-100 rounded-xl text-sm font-medium hover:bg-red-100 active:scale-[0.98] transition-all disabled:opacity-50"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                  Vaciar papelera
                </button>
              )}
            </div>
            {trashFiles.length === 0 ? (
              <div className="text-center py-16 text-[#aaa] text-sm">La papelera está vacía</div>
            ) : (
              <div className="space-y-1.5">
                {trashFiles.filter(f => f.name !== '.emptyFolderPlaceholder').map(file => (
                  <div key={file.id || file.name} className="flex items-center gap-3 bg-white rounded-xl px-4 py-3 border border-[#e8e6e0] hover:border-[#ccc] transition-all group">
                    <span className="text-xl">{getIcon(file.name)}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[#1a1a1a] truncate">
                        {decodeSafe(file.name.replace(/^\d+_/, '').replace(/___/g, '/'))}
                      </p>
                      <p className="text-xs text-[#aaa]">{formatBytes(file.metadata?.size)}</p>
                    </div>
                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => restoreFile(file.name, null)} className="px-3 py-1 bg-[#1a1a1a] text-white rounded-lg text-xs font-medium hover:bg-[#333] transition-colors">
                        Restaurar
                      </button>
                      <button onClick={() => hardDeleteFile(file.name, null)} className="px-3 py-1 bg-red-50 text-red-600 border border-red-100 rounded-lg text-xs font-medium hover:bg-red-100 transition-colors">
                        Eliminar final
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ADMIN — TODOS LOS ARCHIVOS */}
        {tab === 'todos' && isAdmin && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-xl font-semibold text-[#1a1a1a]">Todos los archivos</h1>
                <p className="text-sm text-[#888] mt-0.5">{allFiles.length} archivo{allFiles.length !== 1 ? 's' : ''} en el sistema</p>
              </div>
              <div className="flex bg-[#f7f6f3] p-1 rounded-lg border border-[#e8e6e0]">
                <button onClick={() => setViewMode('list')} className={`p-1.5 rounded-md transition-all ${viewMode === 'list' ? 'bg-white shadow-sm text-[#1a1a1a]' : 'text-[#aaa] hover:text-[#555]'}`} title="Vista de lista">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
                </button>
                <button onClick={() => setViewMode('grid')} className={`p-1.5 rounded-md transition-all ${viewMode === 'grid' ? 'bg-white shadow-sm text-[#1a1a1a]' : 'text-[#aaa] hover:text-[#555]'}`} title="Vista de cuadrícula">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
                </button>
              </div>
            </div>
            {allFiles.length === 0 ? (
              <div className="text-center py-16 text-[#aaa] text-sm">No hay archivos aún</div>
            ) : (
              <div className={viewMode === 'grid' ? "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4" : "space-y-1.5"}>
                {allFiles.filter(f => f.name !== '.emptyFolderPlaceholder' && f.name !== '.papelera').map(file => {
                  const isFolder = !file.metadata;
                  return (
                    <div key={`${file.ownerId}_${file.name}`} className={viewMode === 'grid' ? "flex flex-col items-center text-center p-4 bg-white rounded-xl border border-[#e8e6e0] hover:border-[#ccc] transition-all group relative" : "flex items-center gap-3 bg-white rounded-xl px-4 py-3 border border-[#e8e6e0] hover:border-[#ccc] transition-all group"}>
                      <span className={viewMode === 'grid' ? "text-4xl mb-3" : "text-xl"}>{isFolder ? '📁' : getIcon(file.name)}</span>
                      <div className={viewMode === 'grid' ? "w-full min-w-0" : "flex-1 min-w-0"}>
                        <p className="text-sm font-medium text-[#1a1a1a] truncate">
                          {isFolder ? decodeSafe(file.name) : decodeSafe(file.name.replace(/^\d+_/, ''))}
                        </p>
                        <p className="text-xs text-[#aaa] mt-0.5">{isFolder ? 'Carpeta' : formatBytes(file.metadata?.size)}</p>
                        {viewMode === 'grid' && (
                          <span className="inline-block mt-2 text-[10px] bg-[#f7f6f3] border border-[#e8e6e0] px-2 py-0.5 rounded-lg text-[#666] truncate max-w-full">
                            {file.ownerEmail?.split('@')[0]}
                          </span>
                        )}
                      </div>
                      {viewMode === 'list' && (
                        <span className="text-xs bg-[#f7f6f3] border border-[#e8e6e0] px-2.5 py-1 rounded-lg text-[#666]">
                          {file.ownerEmail?.split('@')[0]}
                        </span>
                      )}
                      <div className={viewMode === 'grid' ? "absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 p-1 rounded-lg shadow-sm border border-[#e8e6e0]" : "flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity"}>
                        {!isFolder && (
                          <>
                            <button onClick={() => shareFile(file.name, file.ownerId)} className="p-1.5 rounded-lg hover:bg-blue-50 text-[#bbb] hover:text-blue-500 transition-colors" title="Copiar enlace">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                            </button>
                            <button onClick={() => downloadFile(file.name, file.ownerId)} className="p-1.5 rounded-lg hover:bg-[#f7f6f3] text-[#888] transition-colors">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                            </button>
                          </>
                        )}
                        <button onClick={() => isFolder ? alert('Las carpetas no se pueden borrar directamente desde el panel de administrador por seguridad.') : deleteFile(file.name, file.ownerId)} className="p-1.5 rounded-lg hover:bg-red-50 text-[#bbb] hover:text-red-500 transition-colors">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ADMIN — USUARIOS */}
        {tab === 'usuarios' && isAdmin && (
          <div>
            <div className="mb-6">
              <h1 className="text-xl font-semibold text-[#1a1a1a]">Usuarios</h1>
              <p className="text-sm text-[#888] mt-0.5">{allUsers.length} usuario{allUsers.length !== 1 ? 's' : ''} registrados</p>
            </div>
            <div className="space-y-2">
              {allUsers.map(u => {
                const uFiles = allFiles.filter(f => f.ownerId === u.id && f.name !== '.emptyFolderPlaceholder' && f.name !== '.papelera')
                const ini = u.email?.slice(0, 2).toUpperCase()
                return (
                  <div key={u.id} className="bg-white rounded-xl border border-[#e8e6e0] overflow-hidden">
                    <div className="flex items-center gap-4 px-5 py-4">
                      <div className="w-9 h-9 rounded-full bg-[#e8e6e0] flex items-center justify-center text-sm font-medium text-[#555]">
                        {ini}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-[#1a1a1a]">{u.email}</p>
                        <p className="text-xs text-[#aaa]">
                          {u.role || 'usuario'} {u.is_suspended && <span className="text-red-500 font-medium ml-1">• Suspendido</span>}
                        </p>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="text-sm font-medium text-[#1a1a1a]">{uFiles.length}</p>
                          <p className="text-xs text-[#aaa]">archivo{uFiles.length !== 1 ? 's' : ''}</p>
                        </div>
                        
                        {uFiles.length > 0 && (
                          <button
                            onClick={() => setExpandedUser(expandedUser === u.id ? null : u.id)}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[#f7f6f3] text-[#555] hover:bg-[#e8e6e0] transition-colors"
                          >
                            {expandedUser === u.id ? 'Ocultar' : 'Ver archivos'}
                          </button>
                        )}

                        {/* Botón de Sincronización Selectiva */}
                        <button
                          onClick={() => toggleLocalSync(u.id, u.sync_local)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                            u.sync_local ? 'bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200' : 'bg-[#f7f6f3] text-[#555] hover:bg-[#e8e6e0] border border-[#e8e6e0]'
                          }`}
                        >
                          {u.sync_local ? '⭐ Sincronizando' : 'Sincronizar a PC'}
                        </button>

                        {u.id !== user.id && (
                          <button
                            onClick={() => toggleUserSuspension(u.id, u.is_suspended)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                              u.is_suspended
                                ? 'bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200'
                                : 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-100'
                            }`}
                          >
                            {u.is_suspended ? 'Reactivar' : 'Suspender'}
                          </button>
                        )}
                      </div>
                    </div>
                    
                    {/* Lista expandible de archivos del usuario */}
                    {expandedUser === u.id && uFiles.length > 0 && (
                      <div className="bg-[#fafaf8] border-t border-[#e8e6e0] p-4 space-y-1.5">
                        {uFiles.map(file => {
                          const isFolder = !file.metadata;
                          return (
                            <div key={file.name} className="flex items-center gap-3 bg-white rounded-lg px-3 py-2 border border-[#e8e6e0] group hover:border-[#ccc] transition-all">
                              <span className="text-lg">{isFolder ? '📁' : getIcon(file.name)}</span>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-[#1a1a1a] truncate">
                                  {isFolder ? decodeSafe(file.name) : decodeSafe(file.name.replace(/^\d+_/, ''))}
                                </p>
                                <p className="text-[10px] text-[#aaa]">{isFolder ? 'Carpeta' : formatBytes(file.metadata?.size)}</p>
                              </div>
                              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                {!isFolder && (
                                  <button onClick={() => downloadFile(file.name, u.id)} className="p-1 rounded-md hover:bg-[#f7f6f3] text-[#888] transition-colors" title="Descargar">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                                  </button>
                                )}
                                <button onClick={() => isFolder ? alert('Las carpetas no se pueden borrar directamente por seguridad.') : deleteFile(file.name, u.id)} className="p-1 rounded-md hover:bg-red-50 text-[#bbb] hover:text-red-500 transition-colors" title="Eliminar">
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                                </button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ADMIN — AUTORIZACIONES */}
        {tab === 'autorizaciones' && isAdmin && (
          <div>
            <div className="mb-6">
              <h1 className="text-xl font-semibold text-[#1a1a1a]">Autorizaciones de Equipos</h1>
              <p className="text-sm text-[#888] mt-0.5">Controla desde qué dispositivos pueden acceder los usuarios</p>
            </div>
            {devices.length === 0 ? (
              <div className="text-center py-16 text-[#aaa] text-sm">No hay dispositivos registrados</div>
            ) : (
              <div className="space-y-2">
                {devices.map(device => {
                  const userOwner = allUsers.find(u => u.id === device.user_id)
                  return (
                    <div key={device.id} className="bg-white rounded-xl border border-[#e8e6e0] p-4 flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                          device.status === 'approved' ? 'bg-green-50 text-green-600' :
                          device.status === 'pending' ? 'bg-amber-50 text-amber-600' :
                          'bg-red-50 text-red-600'
                        }`}>
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            {device.device_name.includes('Móvil') || device.device_name.includes('iPhone') 
                              ? <rect x="5" y="2" width="14" height="20" rx="2" ry="2"/>
                              : <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
                            }
                          </svg>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-[#1a1a1a]">{userOwner?.email || 'Usuario Desconocido'}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-[#555] font-medium">{device.device_name}</span>
                            <span className="text-[10px] text-[#aaa]">ID: {device.device_id.slice(0,8)}</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium ${
                              device.status === 'approved' ? 'bg-green-100 text-green-700' :
                              device.status === 'pending' ? 'bg-amber-100 text-amber-700' :
                              'bg-red-100 text-red-700'
                            }`}>
                              {device.status === 'approved' ? 'Aprobado' : device.status === 'pending' ? 'Pendiente' : 'Bloqueado'}
                            </span>
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex gap-2">
                        {device.status !== 'approved' && (
                          <button onClick={() => updateDeviceStatus(device.id, 'approved')} className="px-3 py-1.5 text-xs font-medium bg-green-50 text-green-700 hover:bg-green-100 border border-green-200 rounded-lg transition-colors">
                            Aprobar
                          </button>
                        )}
                        {device.status !== 'blocked' && (
                          <button onClick={() => updateDeviceStatus(device.id, 'blocked')} className="px-3 py-1.5 text-xs font-medium bg-red-50 text-red-600 hover:bg-red-100 border border-red-100 rounded-lg transition-colors">
                            Bloquear
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
