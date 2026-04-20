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

function getIcon(name) {
  const ext = name?.split('.').pop()?.toLowerCase()
  const icons = {
    pdf: '📄', doc: '📝', docx: '📝', xls: '📊', xlsx: '📊',
    jpg: '🖼️', jpeg: '🖼️', png: '🖼️', gif: '🖼️', webp: '🖼️',
    mp4: '🎬', mov: '🎬', avi: '🎬', mp3: '🎵', wav: '🎵',
    zip: '📦', rar: '📦', '7z': '📦', txt: '📃', csv: '📃',
    js: '💻', ts: '💻', py: '💻', html: '💻', css: '💻',
  }
  return icons[ext] || '📁'
}

export default function DashboardClient({ user, isAdmin }) {
  const [files, setFiles] = useState([])
  const [allFiles, setAllFiles] = useState([]) // solo admin
  const [allUsers, setAllUsers] = useState([]) // solo admin
  const [uploading, setUploading] = useState(false)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('mis-archivos') // 'mis-archivos' | 'todos' | 'usuarios'
  const [dragOver, setDragOver] = useState(false)
  const [search, setSearch] = useState('')
  const [uploadError, setUploadError] = useState('')
  const fileRef = useRef()
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => { loadFiles() }, [])

  async function loadFiles() {
    setLoading(true)
    // Archivos del usuario actual
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .list(user.id, { sortBy: { column: 'created_at', order: 'desc' } })
    setFiles(data || [])

    // Si es admin, cargar todos los archivos y usuarios
    if (isAdmin) {
      const { data: users } = await supabase.from('profiles').select('*')
      setAllUsers(users || [])

      // Listar archivos de cada usuario
      const allF = []
      for (const u of users || []) {
        const { data: uf } = await supabase.storage
          .from(BUCKET)
          .list(u.id)
        if (uf) allF.push(...uf.map(f => ({ ...f, ownerEmail: u.email, ownerId: u.id })))
      }
      setAllFiles(allF)
    }
    setLoading(false)
  }

  async function uploadFiles(fileList) {
    setUploading(true)
    setUploadError('')
    for (const file of Array.from(fileList)) {
      // Sanitizar nombre: quitar caracteres especiales
      const safeName = file.name.replace(/[^a-zA-Z0-9._\-() ]/g, '_')
      const path = `${user.id}/${Date.now()}_${safeName}`
      const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
        cacheControl: '3600',
        upsert: false,
      })
      if (error) {
        setUploadError(`Error al subir "${file.name}": ${error.message}`)
        setUploading(false)
        return
      }
    }
    await loadFiles()
    setUploading(false)
  }

  async function deleteFile(filePath, ownerId) {
    const path = `${ownerId || user.id}/${filePath}`
    await supabase.storage.from(BUCKET).remove([path])
    await loadFiles()
  }

  async function downloadFile(fileName, ownerId) {
    const path = `${ownerId || user.id}/${fileName}`
    const { data } = await supabase.storage.from(BUCKET).download(path)
    if (!data) return
    const url = URL.createObjectURL(data)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName.replace(/^\d+_/, '') // quitar timestamp del nombre
    a.click()
    URL.revokeObjectURL(url)
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
              <a
                href="/dashboard/invitaciones"
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm mb-1 text-[#555] hover:bg-[#f7f6f3] transition-all"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13.5 19.79 19.79 0 0 1 1.62 4.9 2 2 0 0 1 3.6 2.71h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 10.1a16 16 0 0 0 6 6l.92-.92a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 21.73 17.5z"/></svg>
                Invitaciones
              </a>
            </>
          )}
        </nav>

        {/* User info */}
        <div className="p-3 border-t border-[#e8e6e0]">
          <div className="flex items-center gap-2.5 px-2 py-2">
            <div className="w-8 h-8 rounded-full bg-[#e8e6e0] flex items-center justify-center text-xs font-medium text-[#555]">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-[#1a1a1a] truncate">{displayName}</p>
              <p className="text-[10px] text-[#aaa] truncate">{isAdmin ? 'Administrador' : 'Usuario'}</p>
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
              <input ref={fileRef} type="file" multiple className="hidden" onChange={e => uploadFiles(e.target.files)} />
            </div>

            {/* Error de upload */}
            {uploadError && (
              <div className="text-xs px-3 py-2.5 rounded-xl bg-red-50 text-red-600 border border-red-100 mb-4">
                ✗ {uploadError}
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
            {loading ? (
              <div className="text-center py-12 text-[#aaa] text-sm">Cargando...</div>
            ) : (
              <div className="space-y-1.5">
                {filteredFiles.filter(f => f.name !== '.emptyFolderPlaceholder').map(file => (
                  <div key={file.id || file.name} className="flex items-center gap-3 bg-white rounded-xl px-4 py-3 border border-[#e8e6e0] hover:border-[#ccc] transition-all group">
                    <span className="text-xl">{getIcon(file.name)}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[#1a1a1a] truncate">
                        {file.name.replace(/^\d+_/, '')}
                      </p>
                      <p className="text-xs text-[#aaa]">{formatBytes(file.metadata?.size)}</p>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => downloadFile(file.name, null)}
                        className="p-1.5 rounded-lg hover:bg-[#f7f6f3] text-[#888] transition-colors"
                        title="Descargar"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                      </button>
                      <button
                        onClick={() => deleteFile(file.name, null)}
                        className="p-1.5 rounded-lg hover:bg-red-50 text-[#bbb] hover:text-red-500 transition-colors"
                        title="Eliminar"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
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
            <div className="mb-6">
              <h1 className="text-xl font-semibold text-[#1a1a1a]">Todos los archivos</h1>
              <p className="text-sm text-[#888] mt-0.5">{allFiles.length} archivo{allFiles.length !== 1 ? 's' : ''} en el sistema</p>
            </div>
            {allFiles.length === 0 ? (
              <div className="text-center py-16 text-[#aaa] text-sm">No hay archivos aún</div>
            ) : (
              <div className="space-y-1.5">
                {allFiles.filter(f => f.name !== '.emptyFolderPlaceholder').map(file => (
                  <div key={`${file.ownerId}_${file.name}`} className="flex items-center gap-3 bg-white rounded-xl px-4 py-3 border border-[#e8e6e0] hover:border-[#ccc] transition-all group">
                    <span className="text-xl">{getIcon(file.name)}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[#1a1a1a] truncate">
                        {file.name.replace(/^\d+_/, '')}
                      </p>
                      <p className="text-xs text-[#aaa]">{formatBytes(file.metadata?.size)}</p>
                    </div>
                    <span className="text-xs bg-[#f7f6f3] border border-[#e8e6e0] px-2.5 py-1 rounded-lg text-[#666]">
                      {file.ownerEmail?.split('@')[0]}
                    </span>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => downloadFile(file.name, file.ownerId)} className="p-1.5 rounded-lg hover:bg-[#f7f6f3] text-[#888] transition-colors">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                      </button>
                      <button onClick={() => deleteFile(file.name, file.ownerId)} className="p-1.5 rounded-lg hover:bg-red-50 text-[#bbb] hover:text-red-500 transition-colors">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                      </button>
                    </div>
                  </div>
                ))}
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
                const uFiles = allFiles.filter(f => f.ownerId === u.id && f.name !== '.emptyFolderPlaceholder')
                const ini = u.email?.slice(0, 2).toUpperCase()
                return (
                  <div key={u.id} className="flex items-center gap-4 bg-white rounded-xl px-5 py-4 border border-[#e8e6e0]">
                    <div className="w-9 h-9 rounded-full bg-[#e8e6e0] flex items-center justify-center text-sm font-medium text-[#555]">
                      {ini}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-[#1a1a1a]">{u.email}</p>
                      <p className="text-xs text-[#aaa]">{u.role || 'usuario'}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-[#1a1a1a]">{uFiles.length}</p>
                      <p className="text-xs text-[#aaa]">archivo{uFiles.length !== 1 ? 's' : ''}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
