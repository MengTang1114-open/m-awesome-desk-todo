import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './'：打包后 Electron 用 file:// 打开 dist/index.html
export default defineConfig({ base: './', plugins: [react()] })
