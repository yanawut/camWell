import react from '@vitejs/plugin-react'
import { defineConfig, type ProxyOptions } from 'vite'

// YOLO Console เรียก /yolo/... แล้ว Vite ส่งต่อไปที่ yolo-backend โดยตัด /yolo ออก (REST + WebSocket)
// yolo-backend รับเฉพาะ origin http://localhost:5173 และ http://127.0.0.1:5173 (yolo-backend/app/config.py)
const yoloProxy: Record<string, ProxyOptions> = {
  '/yolo': { target: 'http://127.0.0.1:8000', ws: true, rewrite: (path) => path.replace(/^\/yolo/, '') },
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: { proxy: yoloProxy },
  preview: { proxy: yoloProxy },
})
