// รัน Frontend (Vite), Backend (camwell-backend) และ yolo-backend (ถ้ามี .venv) พร้อมกันใน Terminal เดียว
import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const yoloPython = resolve(process.cwd(), 'yolo-backend', '.venv', 'Scripts', 'python.exe')

const processes = [
  spawn('npm', ['--prefix', 'backend', 'run', 'dev'], { stdio: 'inherit', shell: true }),
  spawn('npm', ['--prefix', 'frontend', 'run', 'dev'], { stdio: 'inherit', shell: true }),
]

if (existsSync(yoloPython)) {
  processes.push(spawn('npm', ['run', 'dev:yolo'], { stdio: 'inherit', shell: true }))
} else {
  console.log('[dev:all] ข้าม yolo-backend (ยังไม่พบ yolo-backend\\.venv\\Scripts\\python.exe) — YOLO Console จะขึ้นว่า offline')
}

let shuttingDown = false

function shutdown(exitCode = 0) {
  if (shuttingDown) return
  shuttingDown = true
  for (const child of processes) {
    if (child.exitCode !== null) continue
    // shell: true ทำให้ child เป็น cmd.exe ถ้า kill แค่ตัวนั้น server ตัวจริงข้างใต้จะยังรันต่อ จึงต้องปิดทั้ง tree
    if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
    else child.kill('SIGTERM')
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
