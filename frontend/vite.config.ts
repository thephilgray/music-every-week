import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    host: true, // Expose to network (for mobile testing)
    port: 5173,
  },
  define: {
    global: 'window',
  },
  build: {
    chunkSizeWarningLimit: 1000, // Optional: bump limit if you prefer single file
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-gun': ['gun', 'gun/sea', 'gun/gun'],
          'vendor-utils': ['buffer', 'lucide-react'],
        }
      }
    }
  }
})