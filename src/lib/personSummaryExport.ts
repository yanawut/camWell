// สร้างและส่งออกการ์ดสรุปผลสุขภาพรายบุคคลประจำวัน (สไตล์ 2: แผนภาพจุดอาการ) เป็นรูป PNG และข้อความ LINE

import type { DailyReportPerson, OfficeSyndromeRiskLevel } from '../services/dailyReport'
import {
  formatDateThai,
  formatDurationMs,
  formatTimeShort,
  RISK_LEVEL_LABELS_TH,
} from './dailyReportExport'
import { extractPersonDailySymptoms, extractPotentialConditions, type ZoneSeverity } from './personSymptoms'

const RISK_THEME: Record<
  OfficeSyndromeRiskLevel,
  { accent: string; badgeBg: string; badgeText: string; surfaceBg: string }
> = {
  low: {
    accent: '#10b981',
    badgeBg: '#d1fae5',
    badgeText: '#047857',
    surfaceBg: '#ecfdf5',
  },
  moderate: {
    accent: '#f59e0b',
    badgeBg: '#fef3c7',
    badgeText: '#b45309',
    surfaceBg: '#fffbeb',
  },
  high: {
    accent: '#ef4444',
    badgeBg: '#fee2e2',
    badgeText: '#b91c1c',
    surfaceBg: '#fef2f2',
  },
}

const ZONE_COLOR: Record<ZoneSeverity, string> = {
  none: '#cbd5e1',
  low: '#10b981',
  moderate: '#f59e0b',
  high: '#ef4444',
}

const FONT_FAMILY = "'Sarabun', 'Noto Sans Thai', 'Segoe UI', system-ui, sans-serif"

export function buildLineSummaryText(person: DailyReportPerson, date: string): string {
  const risk = person.officeSyndromeRisk
  const trend = person.riskTrend7d
  const { symptoms } = extractPersonDailySymptoms(person)
  const conditions = extractPotentialConditions(person)
  const levelLabel = RISK_LEVEL_LABELS_TH[risk.level]
  const cameras = person.cameras.length > 0 ? person.cameras.join(', ') : 'ไม่ระบุกล้อง'
  const timeRange = `${formatTimeShort(person.firstSeenAt)} – ${formatTimeShort(person.lastSeenAt)}`
  const presenceText = `${formatDurationMs(person.presenceDurationMs)} (${person.sessionCount} ช่วง)`
  const chronicNote = trend.chronicPattern ? ' [เสี่ยงสะสมต่อเนื่อง]' : ''

  const symptomLines = symptoms.map((s) => {
    const dot = s.severity === 'high' ? '🔴' : s.severity === 'moderate' ? '🟡' : s.severity === 'low' ? '🟢' : '⚪'
    return `${dot} ${s.label}: ${s.valueText}`
  })

  const conditionLines =
    conditions.length > 0
      ? conditions.map((c) => `• ${c.title} (${c.reason})`)
      : ['• ยังไม่พบแนวโน้มอาการป่วยเด่นจากพฤติกรรมวันนี้']

  const lines = [
    '📋 สรุปอาการประจำวัน — CamWell',
    `👤 ${person.personName} (${cameras})`,
    `📅 ${formatDateThai(date)}`,
    `🩺 ความเสี่ยง Office Syndrome: ${levelLabel} (${risk.score}/100)`,
    `📈 แนวโน้ม 7 วัน: เสี่ยงปานกลาง-สูง ${trend.elevatedRiskDays}/${trend.activeDays} วัน (เฉลี่ย ${trend.averageScore}/100)${chronicNote}`,
    `⏱ เข้า–ออก: ${timeRange} | อยู่หน้ากล้อง: ${presenceText}`,
    '',
    '🔎 อาการที่ตรวจพบวันนี้:',
    ...symptomLines,
    '',
    '⚠️ แนวโน้มอาการที่อาจเกิดขึ้นได้:',
    ...conditionLines,
  ]

  if (risk.recommendations.length > 0) {
    lines.push('', `💡 แนวทางดูแล: ${risk.recommendations[0]}`)
  }
  lines.push('*คัดกรองเบื้องต้นจากพฤติกรรมหน้ากล้อง ไม่ใช่การวินิจฉัยโรค*')

  return lines.join('\n')
}

export function buildLineShareUrl(text: string): string {
  return `https://line.me/R/share?text=${encodeURIComponent(text)}`
}

function sanitizeFileSegment(name: string): string {
  const cleaned = name.trim().replace(/[\\/:*?"<>|\s]+/g, '-').replace(/-+/g, '-')
  return cleaned.replace(/^-|-$/g, '') || 'person'
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

function wrapTextLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  if (!text) return []
  const words = text.split(' ')
  const lines: string[] = []
  let current = ''

  const pushCharWrapped = (token: string) => {
    for (const ch of token) {
      const candidate = current + ch
      if (ctx.measureText(candidate).width > maxWidth && current) {
        lines.push(current)
        current = ch
      } else {
        current = candidate
      }
    }
  }

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate
    } else if (ctx.measureText(word).width > maxWidth) {
      if (current) {
        lines.push(current)
        current = ''
      }
      pushCharWrapped(word)
    } else {
      if (current) lines.push(current)
      current = word
    }
  }
  if (current) lines.push(current)
  return lines
}

function drawUpperBodySymptomMap(
  ctx: CanvasRenderingContext2D,
  boxX: number,
  boxY: number,
  boxW: number,
  boxH: number,
  zones: { head: ZoneSeverity; neck: ZoneSeverity; shoulders: ZoneSeverity; back: ZoneSeverity },
) {
  drawRoundedRect(ctx, boxX, boxY, boxW, boxH, 14)
  ctx.fillStyle = '#f8fafc'
  ctx.fill()
  ctx.lineWidth = 1
  ctx.strokeStyle = '#e2e8f0'
  ctx.stroke()

  const cx = boxX + boxW / 2
  const topY = boxY + 26

  // ศีรษะ
  ctx.beginPath()
  ctx.arc(cx, topY + 26, 22, 0, Math.PI * 2)
  ctx.strokeStyle = '#64748b'
  ctx.lineWidth = 3
  ctx.stroke()

  // จุดสายตา/ศีรษะ
  ctx.beginPath()
  ctx.arc(cx, topY + 23, 7, 0, Math.PI * 2)
  ctx.fillStyle = ZONE_COLOR[zones.head]
  ctx.fill()

  // คอ
  ctx.beginPath()
  ctx.moveTo(cx, topY + 49)
  ctx.lineTo(cx, topY + 72)
  ctx.strokeStyle = ZONE_COLOR[zones.neck]
  ctx.lineWidth = 10
  ctx.lineCap = 'round'
  ctx.stroke()

  // บ่า/ไหล่
  ctx.beginPath()
  ctx.moveTo(cx - 52, topY + 86)
  ctx.quadraticCurveTo(cx, topY + 66, cx + 52, topY + 86)
  ctx.strokeStyle = ZONE_COLOR[zones.shoulders]
  ctx.lineWidth = 11
  ctx.lineCap = 'round'
  ctx.stroke()

  // ลำตัว/หลัง
  drawRoundedRect(ctx, cx - 25, topY + 88, 50, 74, 14)
  ctx.strokeStyle = ZONE_COLOR[zones.back]
  ctx.lineWidth = 5
  ctx.stroke()

  ctx.save()
  ctx.setLineDash([6, 4])
  ctx.beginPath()
  ctx.moveTo(cx, topY + 95)
  ctx.lineTo(cx, topY + 155)
  ctx.strokeStyle = ZONE_COLOR[zones.back]
  ctx.lineWidth = 5
  ctx.stroke()
  ctx.restore()

  ctx.fillStyle = '#64748b'
  ctx.font = `600 13px ${FONT_FAMILY}`
  ctx.textAlign = 'center'
  ctx.fillText('จุดเฝ้าระวังหลัก', cx, boxY + boxH - 18)
  ctx.textAlign = 'left'
}

export async function renderPersonCardPngBlob(person: DailyReportPerson, date: string): Promise<Blob> {
  if (document.fonts?.ready) {
    await document.fonts.ready
  }

  const width = 900
  const pad = 36
  const innerW = width - pad * 2
  const risk = person.officeSyndromeRisk
  const trend = person.riskTrend7d
  const theme = RISK_THEME[risk.level]
  const { zones, symptoms } = extractPersonDailySymptoms(person)
  const conditions = extractPotentialConditions(person)

  // วัดบรรทัดข้อความแนวโน้มอาการและคำแนะนำก่อนกำหนดความสูง
  const measureCanvas = document.createElement('canvas')
  const mCtx = measureCanvas.getContext('2d')
  if (!mCtx) {
    throw new Error('เบราว์เซอร์ไม่รองรับ Canvas 2D')
  }
  mCtx.font = `500 14px ${FONT_FAMILY}`
  const conditionWrapped =
    conditions.length > 0
      ? conditions.flatMap((c) => wrapTextLines(mCtx, `• ${c.title} (${c.reason})`, innerW - 36))
      : ['• ยังไม่พบแนวโน้มอาการป่วยเด่นจากพฤติกรรมวันนี้']

  mCtx.font = `500 15px ${FONT_FAMILY}`
  const recText =
    risk.recommendations.length > 0
      ? `แนวทางดูแล: ${risk.recommendations[0]}`
      : 'แนวทางดูแล: รักษาจังหวะการนั่งพักและยืดเหยียดต่อไป'
  const recLines = wrapTextLines(mCtx, recText, innerW - 36)

  const bodySectionH = Math.max(230, 52 + symptoms.length * 40)
  const conditionBoxH = 44 + conditionWrapped.length * 21 + 10
  const recBoxH = 22 + recLines.length * 22 + 14
  const height = 176 + bodySectionH + 16 + conditionBoxH + 14 + recBoxH + 50

  const scale = 2
  const canvas = document.createElement('canvas')
  canvas.width = width * scale
  canvas.height = height * scale
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('เบราว์เซอร์ไม่รองรับการสร้างรูปภาพ')
  }
  ctx.scale(scale, scale)

  // พื้นหลังการ์ด
  ctx.fillStyle = '#f8fafc'
  ctx.fillRect(0, 0, width, height)

  drawRoundedRect(ctx, 16, 16, width - 32, height - 32, 20)
  ctx.fillStyle = '#ffffff'
  ctx.fill()
  ctx.lineWidth = 2
  ctx.strokeStyle = '#cbd5e1'
  ctx.stroke()

  // แถบสีด้านบน
  ctx.save()
  drawRoundedRect(ctx, 16, 16, width - 32, height - 32, 20)
  ctx.clip()
  ctx.fillStyle = theme.accent
  ctx.fillRect(16, 16, width - 32, 8)
  ctx.restore()

  // Header: ชื่อบุคคล + ป้ายความเสี่ยง
  const headerTop = 56
  ctx.fillStyle = '#0f172a'
  ctx.font = `700 28px ${FONT_FAMILY}`
  ctx.fillText(person.personName, pad, headerTop)

  const cameraText = person.cameras.length > 0 ? person.cameras.join(', ') : 'ไม่ระบุกล้อง'
  const metaLine = `รายงานอาการรายวัน · ${formatDateThai(date)} · ${cameraText} · อยู่หน้ากล้อง ${formatDurationMs(person.presenceDurationMs)}`
  ctx.fillStyle = '#475569'
  ctx.font = `500 14px ${FONT_FAMILY}`
  ctx.fillText(metaLine, pad, headerTop + 26)

  const timeMeta = `เข้า–ออก ${formatTimeShort(person.firstSeenAt)} – ${formatTimeShort(person.lastSeenAt)} · แจ้งเตือนรวม ${person.totalAlerts} ครั้ง (${formatDurationMs(person.alertDurationMs)})`
  ctx.fillStyle = '#64748b'
  ctx.font = `400 13px ${FONT_FAMILY}`
  ctx.fillText(timeMeta, pad, headerTop + 48)

  // กล่องสรุปความเสี่ยง + แนวโน้ม 7 วัน ด้านขวาบน
  const scoreBoxW = 248
  const scoreBoxH = 64
  const scoreBoxX = width - pad - scoreBoxW
  const scoreBoxY = 38
  drawRoundedRect(ctx, scoreBoxX, scoreBoxY, scoreBoxW, scoreBoxH, 14)
  ctx.fillStyle = theme.badgeBg
  ctx.fill()

  ctx.textAlign = 'right'
  ctx.fillStyle = theme.badgeText
  ctx.font = `700 18px ${FONT_FAMILY}`
  ctx.fillText(`${RISK_LEVEL_LABELS_TH[risk.level]} · ${risk.score}/100`, scoreBoxX + scoreBoxW - 16, scoreBoxY + 28)

  ctx.fillStyle = '#334155'
  ctx.font = `600 12px ${FONT_FAMILY}`
  ctx.fillText(
    `7 วัน: เสี่ยง ${trend.elevatedRiskDays}/${trend.activeDays} วัน${trend.chronicPattern ? ' · สะสม' : ''}`,
    scoreBoxX + scoreBoxW - 16,
    scoreBoxY + 50,
  )
  ctx.textAlign = 'left'

  // เส้นคั่น Header
  const dividerY = 128
  ctx.beginPath()
  ctx.moveTo(pad, dividerY)
  ctx.lineTo(width - pad, dividerY)
  ctx.strokeStyle = '#e2e8f0'
  ctx.lineWidth = 1
  ctx.stroke()

  // ส่วนกลาง: แผนภาพจุดอาการ (ซ้าย) + รายการอาการประจำวัน (ขวา)
  const contentY = 148
  const mapW = 240
  drawUpperBodySymptomMap(ctx, pad, contentY, mapW, bodySectionH, zones)

  const listX = pad + mapW + 24
  const listW = innerW - mapW - 24
  ctx.fillStyle = '#475569'
  ctx.font = `700 14px ${FONT_FAMILY}`
  ctx.fillText('อาการที่ตรวจพบวันนี้', listX, contentY + 20)

  let rowY = contentY + 46
  symptoms.forEach((item, idx) => {
    const dotColor = ZONE_COLOR[item.severity]
    const textColor =
      item.severity === 'high'
        ? '#b91c1c'
        : item.severity === 'moderate'
          ? '#b45309'
          : item.severity === 'low'
            ? '#047857'
            : '#64748b'

    ctx.beginPath()
    ctx.arc(listX + 8, rowY + 6, 5, 0, Math.PI * 2)
    ctx.fillStyle = dotColor
    ctx.fill()

    ctx.fillStyle = '#0f172a'
    ctx.font = `600 15px ${FONT_FAMILY}`
    ctx.fillText(item.label, listX + 24, rowY + 11)

    ctx.textAlign = 'right'
    ctx.fillStyle = textColor
    ctx.font = `700 15px ${FONT_FAMILY}`
    ctx.fillText(item.valueText, listX + listW, rowY + 11)
    ctx.textAlign = 'left'

    if (idx < symptoms.length - 1) {
      ctx.beginPath()
      ctx.moveTo(listX, rowY + 24)
      ctx.lineTo(listX + listW, rowY + 24)
      ctx.strokeStyle = '#e2e8f0'
      ctx.lineWidth = 1
      ctx.stroke()
    }
    rowY += 40
  })

  // กล่องแนวโน้มอาการป่วยที่อาจเกิดขึ้นได้
  const condY = contentY + bodySectionH + 16
  drawRoundedRect(ctx, pad, condY, innerW, conditionBoxH, 12)
  ctx.fillStyle = '#f8fafc'
  ctx.fill()
  ctx.lineWidth = 1
  ctx.strokeStyle = '#e2e8f0'
  ctx.stroke()

  ctx.fillStyle = '#334155'
  ctx.font = `700 14px ${FONT_FAMILY}`
  ctx.fillText('แนวโน้มอาการที่อาจเกิดขึ้นได้ (จากพฤติกรรม)', pad + 18, condY + 26)

  let cy = condY + 50
  ctx.fillStyle = '#0f172a'
  ctx.font = `500 14px ${FONT_FAMILY}`
  for (const line of conditionWrapped) {
    ctx.fillText(line, pad + 18, cy)
    cy += 21
  }

  // กล่องแนวทางดูแล
  const recY = condY + conditionBoxH + 14
  drawRoundedRect(ctx, pad, recY, innerW, recBoxH, 12)
  ctx.fillStyle = theme.surfaceBg
  ctx.fill()
  ctx.lineWidth = 1
  ctx.strokeStyle = '#e2e8f0'
  ctx.stroke()

  let ry = recY + 25
  ctx.fillStyle = '#0f172a'
  ctx.font = `600 15px ${FONT_FAMILY}`
  for (const line of recLines) {
    ctx.fillText(line, pad + 18, ry)
    ry += 22
  }

  // Footer
  ctx.fillStyle = '#94a3b8'
  ctx.font = `400 12px ${FONT_FAMILY}`
  ctx.fillText(
    'หมายเหตุ: เป็นการคัดกรองความเสี่ยงเบื้องต้นจากพฤติกรรมหน้ากล้อง ไม่ใช่การวินิจฉัยโรคทางการแพทย์',
    pad,
    height - 26,
  )

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('ไม่สามารถสร้างไฟล์รูป PNG ได้'))
        return
      }
      resolve(blob)
    }, 'image/png')
  })
}

export async function downloadPersonCardPng(person: DailyReportPerson, date: string): Promise<void> {
  const blob = await renderPersonCardPngBlob(person, date)
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `camwell-summary-${sanitizeFileSegment(person.personName)}-${date}.png`
  anchor.click()
  URL.revokeObjectURL(url)
}

export async function copyPersonCardImage(person: DailyReportPerson, date: string): Promise<boolean> {
  if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
    return false
  }
  const blob = await renderPersonCardPngBlob(person, date)
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
  return true
}
