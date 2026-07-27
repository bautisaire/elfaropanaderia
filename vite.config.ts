import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Separa las librerías grandes en chunks propios para que se cacheen entre
// deploys y no se re-descarguen cada vez que cambia el código de la tienda.
const vendorChunks: Array<[RegExp, string]> = [
  [/node_modules[\\/](react|react-dom|scheduler|react-router|react-router-dom)[\\/]/, 'react-vendor'],
  [/node_modules[\\/](firebase|@firebase)[\\/]/, 'firebase'],
  [/node_modules[\\/](recharts|d3-[^\\/]+|victory-[^\\/]+|react-datepicker|date-fns)[\\/]/, 'charts'],
  [/node_modules[\\/](leaflet|react-leaflet|@react-leaflet)[\\/]/, 'maps'],
]

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Los helpers de interop CommonJS son módulos virtuales compartidos.
          // Sin asignarlos, Rollup los deja en el primer chunk que los use
          // (p.ej. maps) y el resto acaba arrastrando ese chunk al arranque.
          if (id.includes('commonjsHelpers')) return 'react-vendor'
          if (!id.includes('node_modules')) return
          for (const [pattern, chunk] of vendorChunks) {
            if (pattern.test(id)) return chunk
          }
          // El resto de dependencias van juntas: si quedaran en el chunk de
          // entrada, los chunks vendor dependerían de él y Rollup los cargaría
          // en el arranque para respetar el orden de ejecución.
          return 'vendor'
        },
      },
    },
  },
})
