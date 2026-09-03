import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react()],
    server: {
      host: '127.0.0.1',
      allowedHosts: env.JARVIS_REMOTE_ACCESS_MODE === 'tailscale' && env.VITE_PUBLIC_HOST
        ? [new URL(env.VITE_PUBLIC_HOST).hostname]
        : [],
      port: 43117,
      proxy: {
        '/api': 'http://localhost:43118',
      },
    },
  }
})
