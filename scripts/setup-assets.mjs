// scripts/setup-assets.mjs
//
// รันอัตโนมัติหลัง `npm install` (ดู "postinstall" ใน package.json)
// เตรียมไฟล์ที่ทำให้ AI ทั้งหมดในแอปรันแบบ "local" ล้วนๆ (ไม่พึ่ง CDN ภายนอกตอนรันจริง):
//
//   1. คัดลอกไฟล์ WASM runtime จาก node_modules/@mediapipe/tasks-vision/wasm -> public/wasm
//   2. ดาวน์โหลดไฟล์โมเดล pose_landmarker_lite.task (~5-6MB) มาเก็บไว้ที่ public/models
//      (ตรวจจับท่านั่ง — จาก storage.googleapis.com)
//   3. ดาวน์โหลดไฟล์โมเดลของ @vladmandic/face-api (~6.8MB รวม) มาเก็บที่ public/models/face-api
//      (ตรวจจับความเหนื่อยล้า/ระยะห่างจากจอ/face recognition — จาก raw.githubusercontent.com)
//
// หมายเหตุเรื่องเครือข่าย: บางเครือข่ายองค์กรบล็อก storage.googleapis.com (ของ Google Cloud Storage)
// แต่มักไม่บล็อก raw.githubusercontent.com (ของ GitHub) ถ้าดาวน์โหลดโมเดลใดไม่สำเร็จ สคริปต์จะบอกลิงก์
// ให้ไปดาวน์โหลดเองแล้ววางไฟล์ตามพาธที่แจ้งไว้

import { existsSync, mkdirSync, copyFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

const wasmSrcDir = join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm')
const wasmDestDir = join(root, 'public', 'wasm')
const modelsDir = join(root, 'public', 'models')
const poseModelPath = join(modelsDir, 'pose_landmarker_lite.task')
const faceApiDir = join(modelsDir, 'face-api')

// URL ทางการของ Google สำหรับโมเดล Pose Landmarker (lite = เร็ว/เบาที่สุด เหมาะ real-time)
// รุ่นอื่น: pose_landmarker_full, pose_landmarker_heavy (แม่นยำขึ้นแต่ช้าลง) - แก้ URL ด้านล่างได้ตามต้องการ
const POSE_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task'

// ไฟล์โมเดลของ @vladmandic/face-api (MIT License) - ใช้สำหรับ fatigue / distance / face recognition
const FACE_API_BASE = 'https://raw.githubusercontent.com/vladmandic/face-api/master/model'
const FACE_API_FILES = [
  'tiny_face_detector_model-weights_manifest.json',
  'tiny_face_detector_model.bin',
  'face_landmark_68_model-weights_manifest.json',
  'face_landmark_68_model.bin',
  'face_recognition_model-weights_manifest.json',
  'face_recognition_model.bin',
]

function copyWasm() {
  if (!existsSync(wasmSrcDir)) {
    console.warn('[setup-assets] ไม่พบ @mediapipe/tasks-vision/wasm ใน node_modules - ข้าม step คัดลอก WASM')
    return
  }
  mkdirSync(wasmDestDir, { recursive: true })
  const files = readdirSync(wasmSrcDir)
  for (const f of files) {
    copyFileSync(join(wasmSrcDir, f), join(wasmDestDir, f))
  }
  console.log(`[setup-assets] คัดลอก WASM runtime ${files.length} ไฟล์ -> public/wasm/`)
}

async function downloadFile(url, destPath, label) {
  if (existsSync(destPath)) {
    console.log(`[setup-assets] พบไฟล์อยู่แล้ว: ${label} - ข้าม`)
    return true
  }
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const buf = Buffer.from(await res.arrayBuffer())
    writeFileSync(destPath, buf)
    console.log(`[setup-assets] ดาวน์โหลดสำเร็จ: ${label} (${(buf.length / 1024 / 1024).toFixed(2)} MB)`)
    return true
  } catch (err) {
    console.warn(`[setup-assets] ดาวน์โหลด ${label} ไม่สำเร็จ: ${err.message}`)
    console.warn(`  ลิงก์: ${url}`)
    console.warn(`  กรุณาดาวน์โหลดเองแล้ววางไว้ที่: ${destPath}`)
    return false
  }
}

async function downloadPoseModel() {
  mkdirSync(modelsDir, { recursive: true })
  await downloadFile(POSE_MODEL_URL, poseModelPath, 'pose_landmarker_lite.task (ตรวจจับท่านั่ง)')
}

async function downloadFaceApiModels() {
  mkdirSync(faceApiDir, { recursive: true })
  for (const file of FACE_API_FILES) {
    await downloadFile(`${FACE_API_BASE}/${file}`, join(faceApiDir, file), `face-api/${file}`)
  }
}

copyWasm()
await downloadPoseModel()
await downloadFaceApiModels()
