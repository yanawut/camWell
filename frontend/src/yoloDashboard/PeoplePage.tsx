import { useEffect, useRef, useState, type DragEvent } from 'react'
import { invalidate, setRemote, toast, useRemote } from '../yoloConsole/store'
import type { FaceCaptureResult, FaceCheck, FaceList, FacePerson, FacePose } from '../yoloConsole/types'
import { describeRejects, POSE_TEXT } from '../yoloConsole/wellness'
import { yoloService } from '../yoloConsole/yoloService'
import { Mark, Phrases, WarnGlyph } from './marks'
import { YOLO_PAGES } from './pages'
import PeopleFaceCapture from './PeopleFaceCapture'
import {
  consentCounts,
  ENROL_GAP_TEXT,
  enrolGaps,
  isPhotoFile,
  markPhotos,
  MAX_PHOTOS,
  NEAR,
  PAIR_LEVEL_TEXT,
  pairLevel,
  PHOTO_EXTS_TEXT,
  sameThreshold,
  suggestedThreshold,
  THRESHOLD_MAX,
  THRESHOLD_MIN,
  withCameraShots,
  type PairLevel,
} from './people'
import { errorText } from './errorText'
import { LedgerCell, PageHead, PrintedCheckbox } from './ui'
import './yd-people.css'

// ?yolo-dashboard=people — ลงทะเบียนใบหน้ากับ yolo-backend ข้อมูลชุดเดียวกับแท็บ "ใบหน้า" ของ /?yolo-console

const formatDate = (iso: string) => new Date(iso).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })

const LEVEL_CLASS: Record<PairLevel, string> = {
  risky: 'yd-level is-high',
  near: 'yd-level yd-people-level-near',
  apart: 'yd-level',
}

function LevelTag({ level }: { level: PairLevel }) {
  return <span className={`${LEVEL_CLASS[level]} yd-people-level`}>{PAIR_LEVEL_TEXT[level]}</span>
}

export default function PeoplePage() {
  const faces = useRemote<FaceList>('faces', yoloService.listFaces)
  const check = useRemote<FaceCheck>(faces.data?.engine ? 'faces:check' : null, yoloService.checkFaces)
  const [formName, setFormName] = useState<string | null>(null) // null = ปิดฟอร์ม, '' = คนใหม่
  const [draft, setDraft] = useState<number | null>(null) // ค่าของแถบเลื่อนระหว่างที่ยังไม่ตรงกับค่าที่บันทึก
  const saved = faces.data?.threshold ?? null
  const threshold = draft ?? saved
  const counts = faces.data ? consentCounts(faces.data.people) : null

  return (
    <>
      <PageHead
        title={YOLO_PAGES.people}
        lead="คนที่ลงทะเบียนใบหน้าจะขึ้นชื่อบนผังห้องและในรายงาน ระบบที่กำลังวิเคราะห์อยู่ใช้รายชื่อใหม่ทันที ต้องได้รับความยินยอมจากเจ้าตัวก่อนลงทะเบียน"
      >
        <button type="button" className="yd-btn" onClick={() => setFormName('')} disabled={formName !== null || !faces.data}>
          เพิ่มคน
        </button>
      </PageHead>

      <div className="yd-ledger" role="group" aria-label="สรุปการลงทะเบียน">
        <LedgerCell value={counts?.total ?? '–'} label="ลงทะเบียนทั้งหมด" />
        <LedgerCell value={counts?.consented ?? '–'} label="ยืนยันความยินยอมแล้ว" />
        <LedgerCell value={counts?.missing ?? '–'} label="ยังไม่มีบันทึกความยินยอม" alert={!!counts?.missing} />
      </div>

      {faces.error && (
        <p className="yd-callout is-warn" role="alert">
          โหลดรายชื่อไม่สำเร็จ {faces.error}
        </p>
      )}
      {faces.data && !faces.data.engine && (
        <p className="yd-callout is-warn">
          ยังไม่ได้ติดตั้งโมเดลใบหน้า ระบบบันทึกรูปไว้ได้ แต่ยังตรวจรูปและจดจำใบหน้าไม่ได้ ให้ผู้ดูแลระบบลงชุดจดจำใบหน้าตามหัวข้อ
          "ติดตั้ง yolo-backend" ใน README แล้วเปิด yolo-backend ใหม่
        </p>
      )}

      {formName !== null && faces.data && (
        <EnrolForm key={formName} initialName={formName} data={faces.data} onClose={() => setFormName(null)} />
      )}

      <PeoplePanel
        data={faces.data}
        failed={!!faces.error}
        check={check.data}
        threshold={threshold}
        onAddPhotos={(name) => setFormName(name)}
      />

      {faces.data?.engine && threshold !== null && (
        <AccuracyPanel
          data={faces.data}
          check={check.data}
          checkError={check.error}
          threshold={threshold}
          onDraft={(v) => setDraft(v === saved ? null : v)}
          onSaved={() => setDraft(null)}
        />
      )}

      <p className="yd-pdpa">
        <WarnGlyph />
        รูปใบหน้าและค่าที่ระบบคำนวณจากใบหน้าเป็นข้อมูลชีวภาพตาม PDPA เก็บไว้ที่ yolo-backend บนเครื่องนี้ที่เดียว ไม่ส่งออกนอกเครื่อง
        ลงทะเบียนได้เมื่อเจ้าตัวยินยอมแล้วเท่านั้น ถ้าเจ้าตัวขอถอนความยินยอม ให้กด "ลบ" ที่ชื่อของคนนั้น ระบบจะลบรูปและบันทึกความยินยอมของคนนั้นทั้งหมดถาวร
      </p>
    </>
  )
}

// ---------------------------------------------------------------- ฟอร์มเพิ่มคน / เพิ่มรูป

interface Picked {
  file: File
  url: string
  /** ถ่ายจากกล้องในท่านี้ — ถ่ายใหม่จะแทนชุดเดิม */
  pose?: FacePose
}

function EnrolForm({ initialName, data, onClose }: { initialName: string; data: FaceList; onClose: () => void }) {
  const panel = useRef<HTMLElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const nameInput = useRef<HTMLInputElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const [name, setName] = useState(initialName)
  const [picked, setPicked] = useState<Picked[]>([])
  const [consent, setConsent] = useState(false)
  const [camera, setCamera] = useState(false)
  const [captured, setCaptured] = useState<FaceCaptureResult | null>(null)
  const [saving, setSaving] = useState(false)
  const existing = !initialName && data.people.some((p) => p.name === name.trim())
  const gaps = enrolGaps({ name, consent, photos: picked.length, cameraOpen: camera })

  const urls = useRef<string[]>([])
  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), [])

  // "เพิ่มรูป" ของคนท้ายรายชื่อเปิดฟอร์มนี้ไว้เหนือจอ จึงเลื่อนมาให้เห็นและย้ายโฟกัสมาที่ฟอร์ม
  useEffect(() => {
    const el = panel.current
    if (!el) return
    const top = el.getBoundingClientRect().top
    if (top < 0 || top > window.innerHeight / 2) {
      const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      el.scrollIntoView({ block: 'start', behavior: still ? 'auto' : 'smooth' })
    }
    ;(initialName ? heading.current : nameInput.current)?.focus({ preventScroll: true })
  }, [initialName])

  const track = (file: File) => {
    const url = URL.createObjectURL(file)
    urls.current.push(url)
    return url
  }

  const pick = (files: File[]) => {
    const skipped = files.filter((f) => !isPhotoFile(f.name))
    if (skipped.length) toast.warning(`ข้าม ${skipped.map((f) => f.name).join(', ')} เพราะรับเฉพาะไฟล์ ${PHOTO_EXTS_TEXT}`)
    const added = files.filter((f) => isPhotoFile(f.name)).map((file) => ({ file, url: track(file) }))
    if (!added.length) return
    const next = [...picked, ...added]
    if (next.length > MAX_PHOTOS) toast.warning(`เลือกได้ครั้งละไม่เกิน ${MAX_PHOTOS} รูป`)
    setPicked(next.slice(0, MAX_PHOTOS))
  }

  const takeCaptured = (files: File[], res: FaceCaptureResult) => {
    const shots = files.map((file, i) => ({ file, url: track(file), pose: res.selected[i].pose }))
    setPicked((prev) => withCameraShots(prev, shots))
    setCaptured(res)
    setCamera(false)
  }

  // ไฟล์ที่ปล่อยลงหน้าเว็บโดยไม่มีใครรับ เบราว์เซอร์จะเปิดไฟล์นั้นแทนหน้านี้ จึงรับทุกครั้งที่ลากไฟล์มา
  const allowDrop = (e: DragEvent) => {
    if (e.dataTransfer.types.includes('Files')) e.preventDefault()
  }
  const drop = (e: DragEvent) => {
    e.preventDefault()
    pick([...e.dataTransfer.files])
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

  return (
    <section ref={panel} className="yd-panel yd-people-enrol" aria-labelledby="yd-people-enrol-title">
      <header className="yd-panel-head">
        <h2 id="yd-people-enrol-title" ref={heading} tabIndex={-1}>
          {initialName ? `เพิ่มรูปให้ ${initialName}` : 'เพิ่มคน'}
        </h2>
        <span className="yd-fine">แนะนำ 3–5 รูป หน้าตรง เห็นหน้าคนเดียว แสงหลายแบบ</span>
      </header>
      <div className="yd-panel-body">
        <div className="yd-people-form">
          <div className="yd-people-col">
            <div className="yd-people-name">
              <label htmlFor="yd-people-name">ชื่อ</label>
              <input
                id="yd-people-name"
                ref={nameInput}
                className="yd-input"
                value={name}
                maxLength={60}
                placeholder="เช่น สมชาย ใจดี"
                onChange={(e) => setName(e.target.value)}
                disabled={!!initialName}
                aria-describedby={existing ? 'yd-people-name-note' : undefined}
              />
              {existing && (
                <p id="yd-people-name-note" className="yd-fine">
                  มีชื่อนี้แล้ว รูปจะถูกเพิ่มให้คนเดิม
                </p>
              )}
            </div>

            <div className="yd-people-consent">
              <h3 className="yd-people-h3">ความยินยอมตาม PDPA</h3>
              <p className="yd-people-consent-text">{data.consent.text}</p>
              <PrintedCheckbox checked={consent} onChange={setConsent}>
                เจ้าของใบหน้าได้อ่านและยินยอมตามข้อความข้างต้น
              </PrintedCheckbox>
            </div>
          </div>

          <div className="yd-people-col" onDragOver={allowDrop} onDrop={drop}>
            <div className="yd-people-photos-head">
              <h3 className="yd-people-h3">รูป</h3>
              <span className="yd-fine">เลือกแล้ว {picked.length} รูป</span>
              <div className="yd-actions yd-people-push">
                <button
                  type="button"
                  className="yd-btn-line is-small"
                  onClick={() => setCamera(true)}
                  disabled={camera || !data.engine}
                  title={data.engine ? undefined : 'ต้องติดตั้งโมเดลใบหน้าก่อน'}
                >
                  ถ่ายจากกล้อง
                </button>
                <button type="button" className="yd-btn-line is-small" onClick={() => fileInput.current?.click()}>
                  เลือกรูป
                </button>
              </div>
              <input
                ref={fileInput}
                type="file"
                accept="image/jpeg,image/png,image/bmp,image/webp"
                multiple
                hidden
                onChange={(e) => {
                  pick([...(e.target.files ?? [])])
                  e.target.value = '' // ลบรูปแล้วเลือกไฟล์เดิมซ้ำได้
                }}
              />
            </div>

            {camera && <PeopleFaceCapture onDone={takeCaptured} onClose={() => setCamera(false)} />}
            {captured && !camera && <CaptureSummary result={captured} />}

            {picked.length > 0 ? (
              <ul className="yd-people-tiles" aria-label="รูปที่เลือก">
                {picked.map((p, i) => (
                  <li key={p.url} className="yd-people-tile">
                    <span className="yd-people-tile-img">
                      <img src={p.url} alt={p.file.name} />
                      {p.pose && <span className="yd-people-tile-tag">{POSE_TEXT[p.pose]}</span>}
                    </span>
                    <button
                      type="button"
                      className="yd-people-tile-btn"
                      aria-label={`เอาออก ${p.file.name}`}
                      onClick={() => setPicked((prev) => prev.filter((_, j) => j !== i))}
                    >
                      เอาออก
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              !camera && (
                <button type="button" className="yd-people-dropzone" onClick={() => fileInput.current?.click()}>
                  <Phrases text='กดเพื่อเลือกรูป หรือลากไฟล์รูปมาวางที่นี่ หรือกด "ถ่ายจากกล้อง" ให้ระบบเลือกภาพจากหลายมุม' />
                </button>
              )
            )}
          </div>
        </div>

        <div className="yd-people-form-foot">
          <div className="yd-actions">
            <button type="button" className="yd-btn" onClick={() => void save()} disabled={gaps.length > 0 || saving}>
              {saving ? 'กำลังบันทึก...' : 'บันทึก'}
            </button>
            <button type="button" className="yd-btn-line" onClick={onClose} disabled={saving}>
              ยกเลิก
            </button>
          </div>
          {gaps.length > 0 && <p className="yd-fine">ก่อนบันทึก ให้{gaps.map((gap) => ENROL_GAP_TEXT[gap]).join(', ')}</p>}
        </div>
      </div>
    </section>
  )
}

function CaptureSummary({ result }: { result: FaceCaptureResult }) {
  return (
    <div className="yd-people-captured">
      <div className="yd-people-poses">
        <span>จากกล้อง {result.selected.length} ภาพ</span>
        <ul aria-label="มุมที่ได้ภาพ">
          {(Object.keys(POSE_TEXT) as FacePose[]).map((pose) => (
            <li key={pose}>
              <Mark state={result.coverage[pose] ? 'tick' : 'empty'} small label={result.coverage[pose] ? 'ได้ภาพแล้ว' : 'ยังไม่ได้ภาพ'} />
              {POSE_TEXT[pose]}
            </li>
          ))}
        </ul>
      </div>
      <p className="yd-fine">
        ใช้ได้ {result.usable} จาก {result.total} ภาพ · {describeRejects(result)}
      </p>
      {result.selected.length < 3 && <p className="yd-error">ได้น้อยกว่า 3 ภาพ ควรถ่ายใหม่</p>}
    </div>
  )
}

// ---------------------------------------------------------------- รายชื่อ

function PeoplePanel({
  data,
  failed,
  check,
  threshold,
  onAddPhotos,
}: {
  data?: FaceList
  failed: boolean
  check?: FaceCheck
  threshold: number | null
  onAddPhotos: (name: string) => void
}) {
  const people = data?.people ?? []
  const photos = people.reduce((n, p) => n + p.photos.length, 0)
  return (
    <section className="yd-panel" aria-labelledby="yd-people-list-title">
      <header className="yd-panel-head">
        <h2 id="yd-people-list-title">คนที่ลงทะเบียน{data ? ` (${people.length})` : ''}</h2>
        {data && (
          <span className="yd-fine">
            {photos} รูป{data.engine ? ` · โมเดลใบหน้า ${data.engine}` : ''}
          </span>
        )}
      </header>
      <div className="yd-panel-body">
        {!data && <p className="yd-fine">{failed ? 'ยังโหลดรายชื่อไม่ได้' : 'กำลังโหลด...'}</p>}
        {data && people.length === 0 && <p className="yd-empty">ยังไม่มีใครลงทะเบียน กด "เพิ่มคน" เพื่อเริ่ม</p>}
        {check && people.length > 0 && (
          <p className="yd-fine">
            ตัวเลขใต้รูปคือความเหมือนกับรูปอื่นของคนเดียวกัน รูปที่ต่ำกว่าเกณฑ์จะขึ้นว่าไม่เข้าพวก ควรลบแล้วเพิ่มรูปที่ชัดกว่า
          </p>
        )}
        {people.length > 0 && (
          <ul className="yd-people-list">
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
          </ul>
        )}
      </div>
    </section>
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
  const marks = markPhotos(person.photos, photoScores, threshold)
  const oddCount = marks.filter((m) => m.odd).length
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
    <li className="yd-people-person">
      <div className="yd-people-person-head">
        <div className="yd-people-who">
          <h3>{person.name}</h3>
          <p className="yd-people-meta">
            {person.consentAt ? (
              <span>ยินยอมเมื่อ {formatDate(person.consentAt)}</span>
            ) : (
              <span className="yd-people-alert">
                <WarnGlyph size={16} />
                ยังไม่มีบันทึกความยินยอม
              </span>
            )}
            <span>{person.photos.length} รูป</span>
          </p>
          {closest && level && (
            <p className="yd-people-meta" title="คนที่หน้าคล้ายที่สุดในรายชื่อ">
              <span>
                หน้าคล้ายที่สุด {closest.name} <span className="yd-people-num">{closest.score.toFixed(2)}</span>
              </span>
              <LevelTag level={level} />
            </p>
          )}
          {oddCount > 0 && (
            <p className="yd-people-meta yd-people-alert">
              <span>
                <WarnGlyph size={16} />
                รูปไม่เข้าพวก {oddCount} รูป
              </span>
            </p>
          )}
        </div>
        <div className="yd-actions">
          <button type="button" className="yd-btn-line is-small" onClick={onAddPhotos}>
            เพิ่มรูป
          </button>
          <button
            type="button"
            className="yd-btn-line is-small is-danger"
            disabled={busy}
            aria-label={`${confirming ? 'กดอีกครั้งเพื่อลบ' : 'ลบ'} ${person.name}`}
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
      {confirming && (
        <p className="yd-people-confirm" role="status">
          รูปทั้งหมดและบันทึกความยินยอมของ {person.name} จะถูกลบถาวร กู้คืนไม่ได้
        </p>
      )}
      <ul className="yd-people-tiles" aria-label={`รูปของ ${person.name}`}>
        {marks.map((m, i) => (
          <li
            key={m.photo}
            className={`yd-people-tile${m.odd ? ' is-odd' : ''}`}
            title={
              m.odd && m.score !== null
                ? `ไม่ค่อยเหมือนรูปอื่นของ ${person.name} (${m.score.toFixed(2)}) อาจเบลอ หันข้าง หรือเป็นคนอื่น`
                : undefined
            }
          >
            <span className="yd-people-tile-img">
              <img src={yoloService.facePhotoUrl(person.name, m.photo)} alt={`รูปที่ ${i + 1} ของ ${person.name}`} loading="lazy" />
            </span>
            {m.score !== null && (
              <span className="yd-people-tile-score">{m.odd ? `ไม่เข้าพวก ${m.score.toFixed(2)}` : m.score.toFixed(2)}</span>
            )}
            <button
              type="button"
              className="yd-people-tile-btn"
              disabled={busy}
              aria-label={`ลบรูปนี้ รูปที่ ${i + 1} ของ ${person.name}`}
              onClick={() => void run(() => yoloService.deleteFacePhoto(person.name, m.photo), 'ลบรูปแล้ว')}
            >
              ลบรูปนี้
            </button>
          </li>
        ))}
      </ul>
    </li>
  )
}

// ---------------------------------------------------------------- ความแม่นยำ

function AccuracyPanel({
  data,
  check,
  checkError,
  threshold,
  onDraft,
  onSaved,
}: {
  data: FaceList
  check?: FaceCheck
  checkError: string | null
  threshold: number
  onDraft: (v: number) => void
  onSaved: () => void
}) {
  const [showAll, setShowAll] = useState(false)
  const [saving, setSaving] = useState(false)
  const def = data.defaultThreshold ?? threshold
  const dirty = threshold !== data.threshold
  const pairs = check?.pairs ?? []
  const risky = pairs.filter((p) => pairLevel(p.score, threshold) !== 'apart').length
  const suggested = suggestedThreshold(pairs, def)

  const save = async () => {
    setSaving(true)
    try {
      // บันทึกค่าเริ่มต้น = ล้างค่าที่ตั้งเอง ถ้า yolo-backend เปลี่ยนค่าเริ่มต้นภายหลังจะได้ใช้ค่าใหม่
      const res = await yoloService.putFaceThreshold(sameThreshold(threshold, def) ? null : threshold)
      toast.success(`ใช้เกณฑ์จำหน้า ${res.threshold.toFixed(2)} แล้ว`)
      setRemote<FaceList>('faces', { ...data, threshold: res.threshold })
      onSaved()
    } catch (err) {
      toast.error(errorText(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="yd-panel" aria-labelledby="yd-people-accuracy-title">
      <header className="yd-panel-head">
        <h2 id="yd-people-accuracy-title">ความแม่นยำ</h2>
        <span className="yd-fine">คะแนนความเหมือน 0–1 ถ้าหน้าในกล้องได้คะแนนกับใครถึงเกณฑ์ ระบบจึงบอกว่าเป็นคนนั้น</span>
      </header>
      <div className="yd-panel-body yd-people-accuracy">
        <div className="yd-people-col">
          <div className="yd-people-threshold-head">
            <label htmlFor="yd-people-threshold">เกณฑ์จำหน้า</label>
            <output htmlFor="yd-people-threshold" className="yd-hand">
              {threshold.toFixed(2)}
            </output>
            <span className="yd-fine">ค่าเริ่มต้น {def.toFixed(2)}</span>
            {dirty && <span className="yd-people-alert">ยังไม่ได้บันทึก</span>}
          </div>
          <input
            id="yd-people-threshold"
            type="range"
            min={THRESHOLD_MIN}
            max={THRESHOLD_MAX}
            step={0.01}
            value={threshold}
            onChange={(e) => onDraft(Number(e.target.value))}
            className="yd-people-range"
            aria-describedby="yd-people-threshold-ends"
          />
          <div id="yd-people-threshold-ends" className="yd-people-range-ends">
            <span>
              <Phrases text="จำง่าย แต่เสี่ยงจำผิดคน" />
            </span>
            <span>
              <Phrases text="เข้มงวด แต่จำคนที่ลงทะเบียนไม่ได้บ่อย" />
            </span>
          </div>
          <p className="yd-fine">
            ควรตั้งให้สูงกว่าคู่ที่หน้าคล้ายกันที่สุดอย่างน้อย {NEAR.toFixed(2)} แล้วลองกับกล้องจริง
            ถ้าระบบจำคนที่ลงทะเบียนไม่ได้บ่อย ให้เพิ่มรูปจากกล้องก่อนลดเกณฑ์
          </p>
          <div className="yd-actions">
            <button type="button" className="yd-btn" onClick={() => void save()} disabled={!dirty || saving}>
              บันทึก
            </button>
            {!sameThreshold(suggested, threshold) && (
              <button type="button" className="yd-btn-line" onClick={() => onDraft(suggested)}>
                ใช้ค่าแนะนำ {suggested.toFixed(2)}
              </button>
            )}
            {!sameThreshold(def, threshold) && (
              <button type="button" className="yd-btn-line" onClick={() => onDraft(def)}>
                คืนค่าเริ่มต้น
              </button>
            )}
          </div>
        </div>

        <div className="yd-people-col yd-people-pairs">
          <div className="yd-people-pairs-head">
            <h3 className="yd-people-h3">คู่ที่หน้าคล้ายกันที่สุด</h3>
            {pairs.length > 0 &&
              (risky ? (
                <span className="yd-people-alert">
                  <WarnGlyph size={16} />
                  {risky} คู่ต้องระวัง
                </span>
              ) : (
                <span className="yd-people-good">
                  <Mark state="tick" small label="" />
                  ทุกคู่แยกกันได้
                </span>
              ))}
          </div>
          {checkError && <p className="yd-error">เทียบใบหน้าไม่สำเร็จ {checkError}</p>}
          {!check && !checkError && <p className="yd-fine">กำลังเทียบใบหน้า...</p>}
          {check && pairs.length === 0 && <p className="yd-fine">ต้องมีอย่างน้อย 2 คนจึงจะเทียบได้</p>}
          {pairs.length > 0 && (
            <ul className="yd-people-pair-list">
              {(showAll ? pairs : pairs.slice(0, 5)).map((p) => (
                <li key={`${p.a}|${p.b}`} className="yd-people-pair">
                  <span className="yd-people-pair-names">
                    {p.a} กับ {p.b}
                  </span>
                  <span className="yd-people-pair-track" aria-hidden="true">
                    <i style={{ width: `${Math.max(0, p.score) * 100}%` }} />
                    <b style={{ left: `${threshold * 100}%` }} />
                  </span>
                  <span className="yd-people-num yd-people-pair-score">{p.score.toFixed(2)}</span>
                  <LevelTag level={pairLevel(p.score, threshold)} />
                </li>
              ))}
            </ul>
          )}
          {pairs.length > 5 && (
            <button type="button" className="yd-linkbtn yd-people-more" aria-expanded={showAll} onClick={() => setShowAll((v) => !v)}>
              {showAll ? 'ย่อ' : `ดูทั้งหมด ${pairs.length} คู่`}
            </button>
          )}
          <p className="yd-fine">
            เส้นตั้งบนแถบคือเกณฑ์ ถ้าคู่ไหนเกินเส้น ระบบอาจเรียกคนหนึ่งเป็นอีกคน ให้เพิ่มรูปของทั้งสองคนหรือขยับเกณฑ์ขึ้น
          </p>
        </div>
      </div>
    </section>
  )
}
