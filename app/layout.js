import './globals.css'

export const metadata = {
  title: 'FileShare — Tu espacio seguro',
  description: 'Sistema de archivos privado por usuario',
}

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  )
}
