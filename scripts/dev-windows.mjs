// เปิด backend, yolo-backend และ frontend คนละหน้าต่าง ใช้จาก scripts\dev.bat
// ตรวจทุกตัวแล้วสรุปผลแยกรายตัว ตัวที่พอร์ตยังถูกใช้อยู่จะไม่เปิดซ้ำและไม่ซ่อม
// ข้อที่ไม่ผ่านจะซ่อมให้ถ้าซ่อมเองได้ (npm ci, pip install) ถ้าไม่ได้จะข้ามตัวนั้นแล้วบอกวิธีแก้
import { execSync, spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ALL_STARTED = 0
const NEEDS_ATTENTION = 1

const root = resolve(import.meta.dirname, '..')
const yoloPython = join(root, 'yolo-backend', '.venv', 'Scripts', 'python.exe')
const requirements = join(root, 'yolo-backend', 'requirements.txt')
const faceRequirements = join(root, 'yolo-backend', 'requirements-face.txt')
// onnxruntime-gpu 1.27 ขึ้นไปสร้างมาสำหรับ CUDA 13 ใช้คู่กับ torch cu128 ไม่ได้ (ดู yolo-backend\requirements-face.txt)
const ONNXRUNTIME_GPU = 'onnxruntime-gpu>=1.22,<1.27'

// ผลตรวจหนึ่งข้อคือ { label, ok, detail, warn?, repair? } โดย repair() รันคำสั่งซ่อมแล้วคืนผลตรวจข้อนั้นใหม่
const SERVICES = [
  {
    name: 'backend',
    url: 'http://localhost:4000',
    port: 4000,
    dir: join(root, 'backend'),
    command: 'npm.cmd run dev',
    inspect: () => [inspectNode('>=22.5.0', 'backend ใช้ node:sqlite'), inspectNodeModules('backend')],
  },
  {
    name: 'yolo-backend',
    url: 'http://127.0.0.1:8000',
    port: 8000,
    dir: root,
    command: 'npm.cmd run dev:yolo',
    inspect: () => inspectVenv(),
  },
  {
    name: 'frontend',
    url: 'http://localhost:5173',
    port: 5173,
    dir: join(root, 'frontend'),
    command: 'npm.cmd run dev -- --open',
    inspect: () => [inspectNode('^20.19.0 || >=22.12.0', 'Vite 8'), inspectNodeModules('frontend')],
  },
]

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'))
const parseVersion = (text) => text.split('.').map(Number)
const compareVersions = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]

// รองรับเฉพาะรูปแบบ >=x.y.z และ ^x.y.z ที่คั่นด้วย || ตามที่ใช้ใน SERVICES
function satisfies(version, range) {
  const current = parseVersion(version)
  return range.split('||').some((part) => {
    const text = part.trim()
    const min = parseVersion(text.replace(/^(\^|>=)/, ''))
    const atLeast = compareVersions(current, min) >= 0
    return text.startsWith('^') ? current[0] === min[0] && atLeast : atLeast
  })
}

function inspectNode(range, reason) {
  const ok = satisfies(process.versions.node, range)
  return { label: 'Node.js', ok, detail: `${process.versions.node} ${ok ? 'ผ่าน' : 'ไม่ผ่าน'} ต้องการ ${range} (${reason})` }
}

const packageName = (path) => path.slice(path.lastIndexOf('node_modules/') + 'node_modules/'.length)

// npm บันทึกสิ่งที่ติดตั้งจริงไว้ใน node_modules/.package-lock.json จึงเทียบกับ package-lock.json ได้โดยไม่ต้องรัน npm
// แพ็กเกจ optional ที่ไม่มีอาจเป็นของแพลตฟอร์มอื่น จึงไม่นับว่าขาด
function inspectNodeModules(name) {
  const dir = join(root, name)
  const lockPath = join(dir, 'package-lock.json')
  if (!existsSync(lockPath)) {
    return { label: 'node_modules', ok: false, detail: `ไม่มี ${name}\\package-lock.json จึงตรวจและซ่อมเองไม่ได้` }
  }
  const repair = () => runNpmCi(name)
  const installedPath = join(dir, 'node_modules', '.package-lock.json')
  if (!existsSync(installedPath)) return { label: 'node_modules', ok: false, detail: 'ยังไม่ได้ติดตั้ง', repair }

  const wanted = readJson(lockPath).packages
  const installed = readJson(installedPath).packages
  const problems = []
  for (const [path, meta] of Object.entries(wanted)) {
    if (!path.startsWith('node_modules/')) continue
    const got = installed[path]
    if (!got && !meta.optional && !meta.devOptional) problems.push(`${packageName(path)} ขาด`)
    if (got && got.version !== meta.version) problems.push(`${packageName(path)} ต้องการ ${meta.version} แต่มี ${got.version}`)
  }
  for (const path of Object.keys(installed)) {
    if (!(path in wanted)) problems.push(`${packageName(path)} เกินมา`)
  }
  if (problems.length === 0) {
    const count = Object.keys(installed).filter((path) => path.startsWith('node_modules/')).length
    return { label: 'node_modules', ok: true, detail: `ตรงกับ package-lock.json ครบ ${count} แพ็กเกจ` }
  }
  const examples = problems.slice(0, 3).join(', ')
  return { label: 'node_modules', ok: false, detail: `ไม่ตรงกับ package-lock.json ${problems.length} แพ็กเกจ เช่น ${examples}`, repair }
}

function runNpmCi(name) {
  console.log(`\n[..] ${name}: กำลังรัน npm ci`)
  const ci = spawnSync('npm ci --no-audit --no-fund', { cwd: join(root, name), stdio: 'inherit', shell: true })
  const after = inspectNodeModules(name)
  const how = ci.status === 0 ? 'รัน npm ci แล้ว' : 'รัน npm ci แล้วแต่ล้มเหลว ดู error ด้านบน'
  return { ...after, detail: `${how} ตอนนี้${after.detail}`, repair: undefined }
}

const VENV_REPORT = `
import json, platform, sys
from importlib.metadata import PackageNotFoundError, version

def installed(name):
    try:
        return version(name)
    except PackageNotFoundError:
        return None

def compare(path):
    pinned = 0
    wrong = []
    for line in open(path, encoding="utf-8"):
        line = line.split("#")[0].strip()
        if line:
            pinned += 1
            name, _, want = line.partition("==")
            got = installed(name)
            if got != want:
                wrong.append({"name": name, "want": want, "got": got})
    return {"pinned": pinned, "wrong": wrong}

print(json.dumps({
    "python": platform.python_version(),
    "torch": installed("torch"),
    "main": compare(sys.argv[1]),
    "face": compare(sys.argv[2]),
    "ortCpu": installed("onnxruntime"),
    "ortGpu": installed("onnxruntime-gpu"),
}))
`

function inspectVenv() {
  const uncheckable = (reason) => [
    { label: 'torch', ok: false, detail: `ตรวจไม่ได้ เพราะ${reason}` },
    { label: 'pip packages', ok: false, detail: `ตรวจไม่ได้ เพราะ${reason}` },
    { label: 'face packages', ok: false, optional: true, detail: `ตรวจไม่ได้ เพราะ${reason}` },
  ]
  if (!existsSync(yoloPython)) {
    // โปรเจกต์รุ่นเก่ามี vision_service\ (ย้ายมาเป็น yolo-backend\ แล้ว) git pull ลบไฟล์โค้ดแต่ทิ้ง .venv ไว้ในโฟลเดอร์เดิม
    const leftover = existsSync(join(root, 'vision_service'))
      ? ' / เจอโฟลเดอร์ vision_service\\ ของรุ่นเก่า ไม่ได้ใช้แล้ว ลบทิ้งได้ และอย่าย้าย .venv ในนั้นมาใช้ (venv ผูกกับ path เดิม)'
      : ''
    return [
      {
        label: '.venv',
        ok: false,
        detail:
          'ยังไม่มี สร้างครั้งเดียว: py -3.12 -m venv yolo-backend\\.venv แล้วลง torch ตามบรรทัดแรกของ yolo-backend\\requirements.txt ' +
          `แล้วรัน dev.bat อีกครั้ง สคริปต์จะลงที่เหลือให้ (ดูหัวข้อ YOLO Console ใน README.md)${leftover}`,
      },
      ...uncheckable('ยังไม่มี .venv'),
    ]
  }
  const run = spawnSync(yoloPython, ['-I', '-c', VENV_REPORT, requirements, faceRequirements], { encoding: 'utf8' })
  if (run.status !== 0) {
    return [
      { label: '.venv', ok: false, detail: 'มีโฟลเดอร์แต่เปิด python ไม่ได้ ให้ลบ yolo-backend\\.venv แล้วสร้างใหม่ตาม README.md' },
      ...uncheckable('เปิด python ใน .venv ไม่ได้'),
    ]
  }

  const report = JSON.parse(run.stdout)
  const describe = ({ name, want, got }) => `${name} ต้องการ ${want} แต่${got ? `มี ${got}` : 'ไม่ได้ติดตั้ง'}`
  const torch = report.torch
    ? { label: 'torch', ok: true, detail: report.torch }
    : { label: 'torch', ok: false, detail: 'ยังไม่ได้ติดตั้ง คำสั่งติดตั้งอยู่ที่บรรทัดแรกของ yolo-backend\\requirements.txt' }
  const { main, face } = report
  const packages = main.wrong.length === 0
    ? { label: 'pip packages', ok: true, detail: `ตรงกับ requirements.txt ครบ ${main.pinned} ตัว` }
    : {
        label: 'pip packages',
        ok: false,
        detail: `ไม่ตรงกับ requirements.txt ${main.wrong.length} ตัว เช่น ${main.wrong.slice(0, 3).map(describe).join(', ')}`,
        repair: runPipInstall,
      }
  // จดจำใบหน้าเป็นส่วนเสริม: ขาดไป yolo-backend ยังเปิดได้ แต่ไม่ขึ้นชื่อคน และวัดระยะจอ/ความล้าไม่ได้
  const faceProblems = [
    ...face.wrong.map(describe),
    ...(report.ortGpu ? [] : ['onnxruntime-gpu ไม่ได้ติดตั้ง']),
    ...(report.ortCpu ? [`มี onnxruntime ${report.ortCpu} (รุ่น CPU) ซ้อนกับรุ่น GPU`] : []),
  ]
  const faces = faceProblems.length === 0
    ? { label: 'face packages', ok: true, optional: true, detail: `ตรงกับ requirements-face.txt และมี onnxruntime-gpu ${report.ortGpu}` }
    : {
        label: 'face packages',
        ok: false,
        optional: true,
        detail: `${faceProblems.slice(0, 3).join(', ')} (จดจำใบหน้าจะไม่ทำงาน)`,
        repair: runFaceInstall,
      }
  return [{ label: '.venv', ok: true, detail: `มี Python ${report.python}` }, torch, packages, faces]
}

function runFaceInstall() {
  console.log('\n[..] yolo-backend: กำลังติดตั้งชุดจดจำใบหน้า (requirements-face.txt + onnxruntime-gpu)')
  const pip = (...args) => spawnSync(yoloPython, ['-m', 'pip', ...args, '--disable-pip-version-check'], { stdio: 'inherit' }).status === 0
  // insightface ดึง onnxruntime รุ่น CPU มาด้วย ต้องถอดออกแล้วลงรุ่น GPU ที่เข้ากับ torch cu128 แทน
  const ok =
    pip('install', '--quiet', '-r', faceRequirements) &&
    pip('uninstall', '-y', 'onnxruntime', 'onnxruntime-gpu') &&
    pip('install', '--quiet', ONNXRUNTIME_GPU)
  const after = inspectVenv().find((check) => check.label === 'face packages')
  const how = ok ? 'ติดตั้งแล้ว' : 'ติดตั้งแล้วแต่ล้มเหลว ดู error ด้านบน'
  return { ...after, detail: `${how} ตอนนี้${after.detail}`, repair: undefined }
}

function runPipInstall() {
  console.log('\n[..] yolo-backend: กำลังรัน pip install -r requirements.txt')
  const pip = spawnSync(yoloPython, ['-m', 'pip', 'install', '--quiet', '--disable-pip-version-check', '-r', requirements], {
    stdio: 'inherit',
  })
  const after = inspectVenv().find((check) => check.label === 'pip packages')
  const how = pip.status === 0 ? 'รัน pip install แล้ว' : 'รัน pip install แล้วแต่ล้มเหลว ดู error ด้านบน'
  return { ...after, detail: `${how} ตอนนี้${after.detail}`, repair: undefined }
}

function listeningPids() {
  const pids = new Map()
  for (const line of execSync('netstat -ano', { encoding: 'utf8' }).split('\n')) {
    const [, local, , state, pid] = line.trim().split(/\s+/)
    if (state === 'LISTENING') pids.set(Number(local.split(':').pop()), Number(pid))
  }
  return pids
}

function processName(pid) {
  const row = execSync(`tasklist /fi "PID eq ${pid}" /fo csv /nh`, { encoding: 'utf8' })
  return row.startsWith('"') ? row.split('","')[0].slice(1) : 'โปรแกรมที่หาชื่อไม่เจอ อาจเพิ่งปิดไป'
}

function openWindow({ name, dir, command }) {
  spawnSync('cmd', ['/d', '/s', '/c', `"start "camWell ${name}" /d "${dir}" cmd /k "${command}""`], {
    windowsVerbatimArguments: true,
    stdio: 'ignore',
  })
}

const withNote = (check, note) => ({ ...check, detail: `${check.detail} (${note})` })

function runService(service, pids) {
  const pid = pids.get(service.port)
  const inspected = service.inspect()

  if (pid) {
    const port = { label: `port ${service.port}`, ok: false, warn: true, detail: `ถูกใช้อยู่โดย ${processName(pid)} (pid ${pid})` }
    const checks = inspected.map((check) => (check.ok || !check.repair ? check : withNote(check, 'ยังไม่ซ่อม เพราะตัวนี้กำลังรันอยู่')))
    return { service, checks: [port, ...checks], started: false, outcome: 'ข้าม ไม่เปิดซ้ำเพราะพอร์ตถูกใช้อยู่ ถ้าเป็นตัวเดิมที่เปิดค้างไว้ก็ใช้ต่อได้เลย' }
  }

  const port = { label: `port ${service.port}`, ok: true, detail: 'ว่าง' }
  const failing = inspected.filter((check) => !check.ok && !check.optional)
  const canRepairAll = failing.every((check) => check.repair)
  const checks = inspected.map((check) => {
    if (check.ok || !check.repair) return check
    return canRepairAll ? check.repair() : withNote(check, 'ยังไม่ซ่อม เพราะต้องแก้ข้ออื่นก่อน')
  }).map((check) => (check.optional && !check.ok ? { ...check, warn: true } : check))

  const blocking = checks.filter((check) => !check.ok && !check.optional).map((check) => check.label)
  if (blocking.length > 0) {
    return { service, checks: [port, ...checks], started: false, outcome: `ข้าม เพราะ ${blocking.join(', ')} ไม่ผ่าน` }
  }
  openWindow(service)
  return { service, checks: [port, ...checks], started: true, outcome: `เปิดหน้าต่างแล้ว ${service.url}` }
}

const pids = listeningPids()
const results = SERVICES.map((service) => runService(service, pids))

const mark = (check) => (check.ok ? '[ok]' : check.warn ? '[!] ' : '[x] ')
console.log('')
for (const { service, checks, outcome } of results) {
  console.log(`== ${service.name} (${service.url}) ==`)
  for (const check of checks) console.log(`  ${mark(check)} ${check.label.padEnd(13)} ${check.detail}`)
  console.log(`  ผล: ${outcome}`)
  console.log('')
}
const startedCount = results.filter(({ started }) => started).length
console.log(`สรุป เปิดใหม่ ${startedCount} ตัว ข้าม ${results.length - startedCount} ตัว หน้าเว็บอยู่ที่ http://localhost:5173`)
process.exit(startedCount === results.length ? ALL_STARTED : NEEDS_ATTENTION)
