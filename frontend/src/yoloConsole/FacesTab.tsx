import { useCallback, useEffect, useRef, useState } from 'react'
import { invalidate, setRemote, toast, useRemote } from './store'
import { yoloService } from './yoloService'
import type { Box, FaceCaptureResult, FaceCheck, FaceList, FacePerson, FacePose } from './types'
import { describeRejects, POSE_TEXT } from './wellness'

const MAX_FILES = 20
const NEAR = 0.1 // คู่ที่ต่ำกว่า threshold ไม่เกินเท่านี้ควรดูให้ดี

const formatDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }) : '-'
const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err))

export default function FacesTab() {
  const faces = useRemote<FaceList>('faces', yoloService.listFaces)
  const check = useRemote<FaceCheck>(faces.data?.engine ? 'faces:check' : null, yoloService.checkFaces)
  const [formName, setFormName] = useState<string | null>(null) // null = ปิดฟอร์ม, '' = คนใหม่
  const [draft, setDraft] = useState<number | null>(null) // ค่าของแถบเลื่อนระหว่างที่ยังไม่ตรงกับค่าที่บันทึก
  const saved = faces.data?.threshold ?? null
  const threshold = draft ?? saved

  return (
    <div className="dc-stack">
      <div className="yc-toolbar">
        <button type="button" className="dc-btn yc-btn-primary yc-push" onClick={() => setFormName('')} disabled={formName !== null}>
          + เพิ่มคน
        </button>
      </div>

      {faces.error && <p className="yc-error">{faces.error}</p>}
      {faces.data && !faces.data.engine && (
        <p className="yc-callout is-warn">
          ยังไม่ได้ติดตั้งโมเดลใบหน้า ระบบบันทึกรูปไว้ได้ แต่ยังตรวจรูปและจดจำใบหน้าไม่ได้ ดูหัวข้อ "จดจำใบหน้า" ใน README
        </p>
      )}

      {faces.data?.engine && threshold !== null && (
        <AccuracyCard
          data={faces.data}
          check={check.data}
          threshold={threshold}
          onDraft={(v) => setDraft(v === saved ? null : v)}
          onSaved={() => setDraft(null)}
        />
      )}

      <div className={`yc-faces-grid ${formName === null ? 'is-single' : ''}`}>
        {formName !== null && faces.data && (
          <EnrolForm key={formName} initialName={formName} data={faces.data} onClose={() => setFormName(null)} />
        )}
        <PeopleCard
          data={faces.data}
          check={check.data}
          threshold={threshold}
          loading={faces.loading}
          onAddPhotos={(name) => setFormName(name)}
        />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- accuracy

function pairLevel(score: number, threshold: number) {
  if (score >= threshold) return { text: 'เสี่ยงจำสลับ', tone: 'is-bad' }
  if (score >= threshold - NEAR) return { text: 'ใกล้เกณฑ์', tone: 'is-near' }
  return { text: 'แยกกันได้', tone: 'is-ok' }
}

function AccuracyCard({
  data,
  check,
  threshold,
  onDraft,
  onSaved,
}: {
  data: FaceList
  check?: FaceCheck
  threshold: number
  onDraft: (v: number) => void
  onSaved: () => void
}) {
  const [showAll, setShowAll] = useState(false)
  const [saving, setSaving] = useState(false)
  const def = data.defaultThreshold ?? threshold
  const dirty = threshold !== data.threshold
  const pairs = check?.pairs ?? []
  const risky = pairs.filter((p) => p.score >= threshold - NEAR)
  const top = pairs[0]?.score
  const suggested = top === undefined ? def : Math.min(0.85, Math.max(def, Math.round((top + NEAR) * 100) / 100))

  const save = async () => {
    setSaving(true)
    try {
      const res = await yoloService.putFaceThreshold(Math.abs(threshold - def) < 1e-9 ? null : threshold)
      toast.success(`ใช้ threshold ${res.threshold.toFixed(2)} แล้ว`)
      setRemote<FaceList>('faces', { ...data, threshold: res.threshold })
      onSaved()
    } catch (err) {
      toast.error(errorText(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="dc-card dc-pad">
      <div className="dc-card-head dc-col yc-stack-head">
        <h2 className="dc-h2">ความแม่นยำ</h2>
        <span className="dc-muted-12">คะแนนความเหมือน 0–1 ถ้าหน้าในกล้องได้คะแนนกับใครถึง threshold ระบบจึงบอกว่าเป็นคนนั้น</span>
      </div>
      <div className="yc-accuracy">
        <div className="yc-fields">
          <div className="yc-row yc-tight yc-baseline">
            <label htmlFor="face-threshold" className="dc-w500">Threshold</label>
            <span className="dc-stat-value">{threshold.toFixed(2)}</span>
            <span className="dc-muted-12">ค่าเริ่มต้น {def.toFixed(2)}</span>
            {dirty && <span className="yc-push yc-warn-text">ยังไม่ได้บันทึก</span>}
          </div>
          <input
            id="face-threshold"
            type="range"
            min={0.15}
            max={0.85}
            step={0.01}
            value={threshold}
            onChange={(e) => onDraft(Number(e.target.value))}
            className="yc-range"
          />
          <div className="yc-range-ends dc-muted-12">
            <span>← จำง่าย แต่เสี่ยงจำผิดคน</span>
            <span>เข้มงวด แต่ขึ้น unknown บ่อย →</span>
          </div>
          <p className="dc-muted-12 yc-tight-p">
            ควรตั้งให้สูงกว่าคู่ที่หน้าคล้ายกันที่สุดอย่างน้อย {NEAR.toFixed(2)} แล้วลองกับกล้องจริง
            ถ้าคนที่ลงทะเบียนขึ้น unknown บ่อย ให้เพิ่มรูปจากกล้องก่อนลด threshold
          </p>
          <div className="yc-row yc-tight">
            <button type="button" className="dc-btn yc-btn-primary" onClick={() => void save()} disabled={!dirty || saving}>บันทึก</button>
            {Math.abs(suggested - threshold) > 1e-9 && (
              <button type="button" className="dc-btn" onClick={() => onDraft(suggested)}>ใช้ค่าแนะนำ {suggested.toFixed(2)}</button>
            )}
            {Math.abs(def - threshold) > 1e-9 && (
              <button type="button" className="dc-btn" onClick={() => onDraft(def)}>คืนค่าเริ่มต้น</button>
            )}
          </div>
        </div>

        <div className="yc-fields">
          <div className="yc-row yc-tight">
            <span className="dc-w500">คู่ที่หน้าคล้ายกันที่สุด</span>
            {pairs.length > 0 &&
              (risky.length ? (
                <span className="yc-warn-text">! {risky.length} คู่ต้องระวัง</span>
              ) : (
                <span className="yc-ok">✓ ทุกคู่แยกกันได้</span>
              ))}
          </div>
          {pairs.length === 0 && <p className="dc-muted-12 yc-tight-p">ต้องมีอย่างน้อย 2 คนจึงจะเทียบได้</p>}
          {(showAll ? pairs : pairs.slice(0, 5)).map((p) => {
            const level = pairLevel(p.score, threshold)
            return (
              <div key={`${p.a}|${p.b}`} className="yc-pair">
                <span className="yc-truncate yc-pair-name">{p.a} ↔ {p.b}</span>
                <div className="yc-pair-track">
                  <i className={level.tone} style={{ width: `${Math.max(0, p.score) * 100}%` }} />
                  <b style={{ left: `${threshold * 100}%` }} />
                </div>
                <span className="dc-mono">{p.score.toFixed(2)}</span>
                <span className={`yc-pair-level ${level.tone}`}>{level.text}</span>
              </div>
            )
          })}
          {pairs.length > 5 && (
            <button type="button" className="yc-link" onClick={() => setShowAll((v) => !v)}>
              {showAll ? 'ย่อ' : `ดูทั้งหมด ${pairs.length} คู่`}
            </button>
          )}
          <p className="dc-muted-12 yc-tight-p">
            เส้นตั้งคือ threshold ถ้าคู่ไหนเกินเส้น ระบบอาจเรียกคนหนึ่งเป็นอีกคน ให้เพิ่มรูปของทั้งสองคนหรือเพิ่ม threshold
          </p>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- form

interface Picked {
  file: File
  url: string
  camera?: FacePose // ถ่ายจากกล้องหน้านี้: ถ่ายใหม่จะแทนชุดเดิม
}

function EnrolForm({ initialName, data, onClose }: { initialName: string; data: FaceList; onClose: () => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [name, setName] = useState(initialName)
  const [picked, setPicked] = useState<Picked[]>([])
  const [consent, setConsent] = useState(false)
  const [camera, setCamera] = useState(false)
  const [captured, setCaptured] = useState<FaceCaptureResult | null>(null)
  const [saving, setSaving] = useState(false)
  const existing = data.people.some((p) => p.name === name.trim())

  const urls = useRef<string[]>([])
  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), [])

  const pick = (files: FileList | null) => {
    if (!files) return
    const added = [...files].map((file) => {
      const url = URL.createObjectURL(file)
      urls.current.push(url)
      return { file, url }
    })
    const next = [...picked, ...added]
    if (next.length > MAX_FILES) toast.warning(`เลือกได้ครั้งละไม่เกิน ${MAX_FILES} รูป`)
    setPicked(next.slice(0, MAX_FILES))
  }

  const takeCaptured = (files: File[], res: FaceCaptureResult) => {
    const added = files.map((file, i) => {
      const url = URL.createObjectURL(file)
      urls.current.push(url)
      return { file, url, camera: res.selected[i].pose }
    })
    setPicked((prev) => [...prev.filter((p) => !p.camera), ...added].slice(0, MAX_FILES))
    setCaptured(res)
    setCamera(false)
  }

  const save = async () => {
    setSaving(true)
    try {
      const res = await yoloService.addFaces(name.trim(), picked.map((p) => p.file), consent)
      toast.success(`บันทึก ${res.added} รูปของ ${res.name} แล้ว`)
      for (const problem of res.problems) toast.warning(problem)
      invalidate('faces')
      onClose()
    } catch (err) {
      toast.error(errorText(err))
    } finally {
      setSaving(false)
    }
  }

  const ready = name.trim() !== '' && picked.length > 0 && consent && !saving && !camera

  return (
    <div className="dc-card dc-pad">
      <div className="dc-card-head dc-col yc-stack-head">
        <h2 className="dc-h2">{initialName ? `เพิ่มรูปให้ ${initialName}` : 'เพิ่มคน'}</h2>
        <span className="dc-muted-12">แนะนำ 3–5 รูป หน้าตรง เห็นหน้าคนเดียว แสงหลายแบบ</span>
      </div>
      <div className="yc-fields yc-gap-lg">
        <label className="yc-field">
          <span className="dc-w500">ชื่อ</span>
          <input
            className="yc-input"
            value={name}
            maxLength={60}
            placeholder="เช่น สมชาย ใจดี"
            onChange={(e) => setName(e.target.value)}
            disabled={!!initialName}
          />
          {existing && !initialName && <span className="dc-muted-12">มีชื่อนี้แล้ว รูปจะถูกเพิ่มให้คนเดิม</span>}
        </label>

        <div className="yc-fields">
          <div className="yc-row yc-tight">
            <span className="dc-w500">รูป</span>
            <span className="dc-muted-12">เลือกแล้ว {picked.length} รูป</span>
            <button
              type="button"
              className="dc-btn yc-push"
              onClick={() => setCamera(true)}
              disabled={camera || !data.engine}
              title={data.engine ? undefined : 'ต้องติดตั้งโมเดลใบหน้าก่อน'}
            >
              ถ่ายจากกล้อง
            </button>
            <button type="button" className="dc-btn" onClick={() => input.current?.click()}>+ เลือกรูป</button>
            <input
              ref={input}
              type="file"
              accept="image/jpeg,image/png,image/bmp,image/webp"
              multiple
              hidden
              onChange={(e) => {
                pick(e.target.files)
                e.target.value = '' // ลบรูปแล้วเลือกไฟล์เดิมซ้ำได้
              }}
            />
          </div>
          {camera && <FaceCapture onDone={takeCaptured} onClose={() => setCamera(false)} />}
          {captured && !camera && (
            <div className="yc-fields dc-muted-12">
              <div className="yc-row yc-tight">
                <span>จากกล้อง {captured.selected.length} ภาพ:</span>
                {(Object.keys(POSE_TEXT) as FacePose[]).map((pose) => (
                  <span key={pose} className={`yc-pose ${captured.coverage[pose] ? 'is-on' : ''}`}>{POSE_TEXT[pose]}</span>
                ))}
              </div>
              <span>ใช้ได้ {captured.usable}/{captured.total} ภาพ · {describeRejects(captured)}</span>
              {captured.selected.length < 3 && <span className="yc-warn-text">ได้น้อยกว่า 3 ภาพ ควรถ่ายใหม่</span>}
            </div>
          )}
          {picked.length > 0 ? (
            <div className="yc-thumbs">
              {picked.map((p, i) => (
                <div key={p.url} className="yc-thumb">
                  <img src={p.url} alt={p.file.name} />
                  {p.camera && <span className="yc-thumb-tag">{POSE_TEXT[p.camera]}</span>}
                  <button
                    type="button"
                    aria-label={`เอา ${p.file.name} ออก`}
                    className="yc-thumb-x"
                    onClick={() => setPicked((prev) => prev.filter((_, j) => j !== i))}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          ) : (
            !camera && (
              <button type="button" onClick={() => input.current?.click()} className="yc-dropzone">
                กดเพื่อเลือกรูป หรือกด "ถ่ายจากกล้อง" ให้ระบบเลือกภาพจากหลายมุม
              </button>
            )
          )}
        </div>

        <div className="yc-box">
          <span className="dc-w500">ความยินยอมตาม PDPA</span>
          <p className="dc-muted-12 yc-consent-text">{data.consent.text}</p>
          <label className="yc-check">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span>เจ้าของใบหน้าได้อ่านและยินยอมตามข้อความข้างต้น</span>
          </label>
        </div>

        <div className="yc-row yc-tight">
          <button type="button" className="dc-btn yc-btn-primary" onClick={() => void save()} disabled={!ready}>
            {saving ? 'กำลังบันทึก...' : 'อัปเดต'}
          </button>
          <button type="button" className="dc-btn" onClick={onClose} disabled={saving}>ยกเลิก</button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- list

function PeopleCard({
  data,
  check,
  threshold,
  loading,
  onAddPhotos,
}: {
  data?: FaceList
  check?: FaceCheck
  threshold: number | null
  loading: boolean
  onAddPhotos: (name: string) => void
}) {
  const people = data?.people ?? []
  const photos = people.reduce((n, p) => n + p.photos.length, 0)
  return (
    <div className="dc-card dc-pad">
      <div className="dc-card-head dc-col yc-stack-head">
        <h2 className="dc-h2">คนที่ลงทะเบียน ({people.length})</h2>
        <span className="dc-muted-12">{photos} รูป{data?.engine ? ` · โมเดล ${data.engine}` : ''}</span>
      </div>
      {loading && <p className="dc-muted-12">กำลังโหลด...</p>}
      {!loading && people.length === 0 && (
        <p className="dc-empty dc-empty-pad">ยังไม่มีใครลงทะเบียน กด "เพิ่มคน" เพื่อเริ่ม</p>
      )}
      <div className="yc-face-people">
        {people.map((p) => (
          <PersonRow
            key={p.name}
            person={p}
            closest={check?.closest[p.name]}
            photoScores={check?.photos[p.name]}
            threshold={threshold}
            onAddPhotos={() => onAddPhotos(p.name)}
          />
        ))}
      </div>
    </div>
  )
}

function PersonRow({
  person,
  closest,
  photoScores,
  threshold,
  onAddPhotos,
}: {
  person: FacePerson
  closest?: { name: string; score: number }
  photoScores?: Record<string, number | null>
  threshold: number | null
  onAddPhotos: () => void
}) {
  const odd = (photo: string) => {
    const score = photoScores?.[photo]
    return threshold !== null && score !== undefined && score !== null && score < threshold ? score : null
  }
  const oddCount = person.photos.filter((ph) => odd(ph) !== null).length
  const level = closest && threshold !== null ? pairLevel(closest.score, threshold) : null
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!confirming) return
    const t = setTimeout(() => setConfirming(false), 4000)
    return () => clearTimeout(t)
  }, [confirming])

  const run = async (job: () => Promise<unknown>, message: string) => {
    setBusy(true)
    try {
      await job()
      toast.success(message)
      invalidate('faces')
    } catch (err) {
      toast.error(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="yc-face-person">
      <div className="yc-row yc-tight">
        <span className="dc-w500">{person.name}</span>
        <span className="dc-muted-12">{person.photos.length} รูป · ยินยอมเมื่อ {formatDate(person.consentAt)}</span>
        {closest && level && (
          <span className={`yc-pair-level ${level.tone}`} title="คนที่หน้าคล้ายที่สุดในรายชื่อ">
            · คล้าย {closest.name} {closest.score.toFixed(2)}
          </span>
        )}
        {oddCount > 0 && <span className="yc-bad dc-muted-12">! รูปไม่เข้าพวก {oddCount}</span>}
        <div className="yc-push yc-row yc-tight">
          <button type="button" className="dc-btn" onClick={onAddPhotos}>+ เพิ่มรูป</button>
          <button
            type="button"
            className="dc-btn yc-btn-danger"
            disabled={busy}
            onClick={() =>
              confirming
                ? void run(() => yoloService.deleteFace(person.name), `ลบ ${person.name} และรูปทั้งหมดแล้ว`)
                : setConfirming(true)
            }
          >
            {confirming ? 'กดอีกครั้งเพื่อลบ' : 'ลบ'}
          </button>
        </div>
      </div>
      <div className="yc-face-photos">
        {person.photos.map((photo) => (
          <div
            key={photo}
            className={`yc-thumb yc-thumb-sm ${odd(photo) !== null ? 'is-odd' : ''}`}
            title={
              odd(photo) !== null
                ? `ไม่ค่อยเหมือนรูปอื่นของ ${person.name} (${odd(photo)!.toFixed(2)}) อาจเบลอ หันข้าง หรือเป็นคนอื่น`
                : undefined
            }
          >
            <img src={yoloService.facePhotoUrl(person.name, photo)} alt="" loading="lazy" />
            <button
              type="button"
              aria-label="ลบรูปนี้"
              className="yc-thumb-x yc-on-hover"
              disabled={busy}
              onClick={() => void run(() => yoloService.deleteFacePhoto(person.name, photo), 'ลบรูปแล้ว')}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- camera capture

const STEPS: { text: string; ms: number }[] = [
  { text: 'มองตรงที่กล้อง', ms: 2000 },
  { text: 'หันซ้ายช้าๆ', ms: 2200 },
  { text: 'หันขวาช้าๆ', ms: 2200 },
  { text: 'เงยหน้าเล็กน้อย', ms: 1800 },
  { text: 'ก้มหน้าเล็กน้อย', ms: 1800 },
]
const TOTAL_MS = STEPS.reduce((n, s) => n + s.ms, 0)
const EVERY_MS = 250

type Phase = 'opening' | 'ready' | 'recording' | 'selecting' | 'error'

/** ตัดเป็นสี่เหลี่ยมจัตุรัสรอบหน้า: รูปย่อดูดี และเก็บภาพห้องไว้น้อยลง */
async function cropFace(frame: Blob, box: Box, name: string): Promise<File> {
  const bitmap = await createImageBitmap(frame)
  const [x1, y1, x2, y2] = box
  const side = Math.min(Math.max(x2 - x1, y2 - y1) * 2, bitmap.width, bitmap.height)
  const cx = (x1 + x2) / 2
  const cy = (y1 + y2) / 2
  const sx = Math.min(Math.max(0, cx - side / 2), bitmap.width - side)
  const sy = Math.min(Math.max(0, cy - side / 2), bitmap.height - side)
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = Math.round(side)
  canvas.getContext('2d')!.drawImage(bitmap, sx, sy, side, side, 0, 0, side, side)
  bitmap.close()
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('crop failed'))), 'image/jpeg', 0.92),
  )
  return new File([blob], name, { type: 'image/jpeg' })
}

function FaceCapture({ onDone, onClose }: { onDone: (files: File[], result: FaceCaptureResult) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const stream = useRef<MediaStream | null>(null)
  const [phase, setPhase] = useState<Phase>('opening')
  const [error, setError] = useState('')
  const [elapsed, setElapsed] = useState(0)
  const [count, setCount] = useState(0)
  const [result, setResult] = useState<FaceCaptureResult | null>(null)
  const cancelled = useRef(false)

  const stop = useCallback(() => {
    stream.current?.getTracks().forEach((t) => t.stop())
    stream.current = null
  }, [])

  const open = useCallback(() => {
    const start = async () => {
      if (!navigator.mediaDevices) throw new Error('เบราว์เซอร์อนุญาตกล้องเฉพาะเมื่อเปิดผ่าน localhost หรือ https')
      stream.current = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        audio: false,
      })
      if (video.current) {
        video.current.srcObject = stream.current
        await video.current.play()
      }
    }
    return start().then(
      () => setPhase('ready'),
      (e: unknown) => {
        const name = (e as DOMException).name
        setError(name === 'NotAllowedError' ? 'ไม่ได้รับอนุญาตให้ใช้กล้อง' : name === 'NotFoundError' ? 'ไม่พบกล้องในเครื่องนี้' : (e as Error).message)
        setPhase('error')
      },
    )
  }, [])

  useEffect(() => {
    cancelled.current = false
    void open()
    return () => {
      cancelled.current = true
      stop()
    }
  }, [open, stop])

  const record = async () => {
    const v = video.current
    if (!v || !v.videoWidth) return
    setPhase('recording')
    setResult(null)
    setCount(0)
    const canvas = document.createElement('canvas')
    canvas.width = v.videoWidth
    canvas.height = v.videoHeight
    const ctx = canvas.getContext('2d')!
    const shots: Promise<Blob | null>[] = []
    const started = performance.now()
    await new Promise<void>((resolve) => {
      const timer = setInterval(() => {
        const t = performance.now() - started
        setElapsed(t)
        if (cancelled.current || t >= TOTAL_MS) {
          clearInterval(timer)
          resolve()
          return
        }
        ctx.drawImage(v, 0, 0) // ไม่กลับซ้ายขวา ตามที่ backend คาด
        shots.push(new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.85)))
        setCount((n) => n + 1)
      }, EVERY_MS)
    })
    if (cancelled.current) return
    setPhase('selecting')
    const frames = (await Promise.all(shots)).filter((b): b is Blob => !!b)
    try {
      const res = await yoloService.captureFaces(frames)
      const files = await Promise.all(res.selected.map((s, i) => cropFace(frames[s.index], s.box, `camera-${i + 1}-${s.pose}.jpg`)))
      if (cancelled.current) return
      setResult(res)
      if (files.length) {
        stop()
        onDone(files, res)
      } else {
        setPhase('ready')
      }
    } catch (e) {
      setError((e as Error).message)
      setPhase('error')
    }
  }

  const stepAt = (t: number) => {
    let acc = 0
    for (const [i, s] of STEPS.entries()) {
      acc += s.ms
      if (t < acc) return i
    }
    return STEPS.length - 1
  }
  const step = phase === 'recording' ? stepAt(elapsed) : -1

  return (
    <div className="yc-box">
      <div className="yc-capture">
        <video ref={video} muted playsInline />
        <div className="yc-capture-oval" aria-hidden="true" />
        {phase === 'recording' && <div className="yc-capture-step">{STEPS[step].text}</div>}
        {phase === 'recording' && (
          <div className="yc-capture-progress"><i style={{ width: `${Math.min(100, (elapsed / TOTAL_MS) * 100)}%` }} /></div>
        )}
        {(phase === 'opening' || phase === 'selecting') && (
          <div className="yc-capture-cover">{phase === 'opening' ? 'กำลังเปิดกล้อง...' : `กำลังเลือกภาพที่ดีที่สุดจาก ${count} ภาพ...`}</div>
        )}
        {phase === 'error' && <div className="yc-capture-cover is-error">{error}</div>}
      </div>

      {phase === 'ready' && !result && (
        <p className="dc-muted-12 yc-tight-p">
          ยืนคนเดียวให้หน้าอยู่ในวงรี กดเริ่มบันทึกแล้วทำตามคำบอกบนจอ ราว {Math.round(TOTAL_MS / 1000)} วินาที หันช้าๆ จะได้ภาพไม่เบลอ
        </p>
      )}
      {phase === 'ready' && result && result.selected.length === 0 && (
        <p className="yc-error">ไม่ได้ภาพที่ใช้ได้เลย ({describeRejects(result)}) ลองใหม่โดยยืนใกล้ขึ้นและแสงสว่างพอ</p>
      )}

      <div className="yc-row yc-tight">
        {phase === 'ready' && <button type="button" className="dc-btn yc-btn-primary" onClick={() => void record()}>● เริ่มบันทึก</button>}
        {phase === 'error' && (
          <button
            type="button"
            className="dc-btn"
            onClick={() => {
              setPhase('opening')
              setError('')
              void open()
            }}
          >
            ↻ ลองเปิดกล้องอีกครั้ง
          </button>
        )}
        <button type="button" className="dc-btn" onClick={onClose} disabled={phase === 'selecting'}>× ปิดกล้อง</button>
      </div>
    </div>
  )
}
