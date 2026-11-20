// รัน Frontend (Vite) และ Backend (camwell-backend) พร้อมกันใน Terminal เดียว
import { spawn } from 'node:child_process'

const processes = [
  spawn('npm', ['--prefix', 'backend', 'run', 'dev'], { stdio: 'inherit', shell: true }),
  spawn('npm', ['--prefix', 'frontend', 'run', 'dev'], { stdio: 'inherit', shell: true }),
]

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
