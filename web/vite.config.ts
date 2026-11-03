import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // allow viewing the preview through tunnel hosts (Cloudflare / localhost.run)
  preview: { allowedHosts: ['.trycloudflare.com', '.lhr.life'] },
  server: { allowedHosts: ['.trycloudflare.com', '.lhr.life'] },
})
