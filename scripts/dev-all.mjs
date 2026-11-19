// รัน Frontend (Vite), Backend (camwell-backend) และ Vision Service (ถ้ามี .venv) พร้อมกันใน Terminal เดียว
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const rootDir = process.cwd()
const visionPython = resolve(rootDir, 'vision_service', '.venv', 'Scripts', 'python.exe')

const processes = [
  spawn('npm', ['--prefix', 'backend', 'run', 'dev'], { stdio: 'inherit', shell: true }),
  spawn('npm', ['run', 'dev'], { stdio: 'inherit', shell: true }),
]

if (existsSync(visionPython)) {
  processes.push(spawn('npm', ['run', 'dev:vision'], { stdio: 'inherit', shell: true }))
} else {
  console.log('[dev:all] ข้าม vision_service (ยังไม่พบ vision_service\\.venv\\Scripts\\python.exe)')
}

let shuttingDown = false

function shutdown(exitCode = 0) {
  if (shuttingDown) return
  shuttingDown = true
  for (const child of processes) {
    if (!child.killed) {
      child.kill('SIGTERM')
    }
  }
  process.exit(exitCode)
}

for (const child of processes) {
  child.on('exit', (code) => {
    if (!shuttingDown) {
      shutdown(code ?? 0)
    }
  })
}

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))
