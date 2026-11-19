// ประเมินความเสี่ยงพฤติกรรมที่อาจนำไปสู่ Office Syndrome จากข้อมูลหน้ากล้องรายวัน
// เป็นการคัดกรองความเสี่ยงเชิงพฤติกรรมเบื้องต้น (Behavioral Risk Screening) ไม่ใช่การวินิจฉัยโรคทางการแพทย์

export type OfficeSyndromeRiskLevel = 'low' | 'moderate' | 'high'

export interface OfficeSyndromeRiskBreakdown {
  /** คะแนนด้านการนั่งนานและนั่งต่อเนื่อง (0-30) */
  sedentary: number
  /** คะแนนด้านท่านั่งผิดปกติ คอ/บ่า/หลัง (0-45) */
  posture: number
  /** คะแนนด้านระยะห่างจอและความล้าทางสายตา (0-25) */
  visualFatigue: number
}

export interface OfficeSyndromeRisk {
  /** คะแนนความเสี่ยงพฤติกรรมรวม (0-100) */
  score: number
  level: OfficeSyndromeRiskLevel
  breakdown: OfficeSyndromeRiskBreakdown
  /** ช่วงเวลาที่นั่งต่อเนื่องยาวที่สุดในวันนั้น (ms) */
  longestSessionMs: number
  /** จำนวนช่วงที่นั่งต่อเนื่อง >= 45 นาทีโดยไม่ลุกพัก */
  prolongedSessionCount: number
  /** ปัจจัยเสี่ยงเด่นที่ตรวจพบในวันนั้น */
  factors: string[]
  /** คำแนะนำเชิงป้องกันเบื้องต้นตามปัจจัยที่พบ */
  recommendations: string[]
}

export interface OfficeSyndromeWeeklyTrend {
  /** จำนวนวันที่มีข้อมูลในรอบ 7 วันล่าสุด (นับถึงวันที่เลือก) */
  activeDays: number
  /** จำนวนวันที่มีความเสี่ยงระดับปานกลางขึ้นไป (moderate หรือ high) */
  elevatedRiskDays: number
  /** จำนวนวันที่มีความเสี่ยงระดับสูง (high) */
  highRiskDays: number
  /** คะแนนความเสี่ยงเฉลี่ยในช่วงวันที่มีข้อมูล (0-100) */
  averageScore: number
  /** true เมื่อพบความเสี่ยงปานกลาง-สูงสะสม >= 3 วันในรอบ 7 วัน */
  chronicPattern: boolean
}

export interface OfficeSyndromeRiskInput {
  presenceDurationMs: number
  longestSessionMs: number
  prolongedSessionCount: number
  postureCount: number
  postureDurationMs: number
  fatigueCount: number
  fatigueDurationMs: number
  distanceCount: number
  distanceDurationMs: number
  byType: Record<string, number>
}

export const PROLONGED_SESSION_THRESHOLD_MS = 45 * 60_000
const DAILY_SITTING_TARGET_MS = 6 * 60 * 60_000 // เกณฑ์นั่งทำงาน 6 ชม./วัน
const MIN_DENOMINATOR_MS = 30 * 60_000 // กันค่าสัดส่วนกระโดดในช่วงทดสอบสั้นๆ
const FALLBACK_ALERT_MS = 10_000 // เผื่อเหตุการณ์ที่ยังไม่ปิด (endedAt = null)
const MS_PER_HOUR = 60 * 60_000

function clamp01(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0
  return Math.min(1, value)
}

function nonNeg(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0
}

export function classifyRiskLevel(score: number): OfficeSyndromeRiskLevel {
  if (score >= 65) return 'high'
  if (score >= 35) return 'moderate'
  return 'low'
}

export function assessOfficeSyndromeRisk(input: OfficeSyndromeRiskInput): OfficeSyndromeRisk {
  const presenceMs = nonNeg(input.presenceDurationMs)
  const longestSessionMs = nonNeg(input.longestSessionMs)
  const prolongedSessionCount = nonNeg(input.prolongedSessionCount)
  const postureCount = nonNeg(input.postureCount)
  const fatigueCount = nonNeg(input.fatigueCount)
  const distanceCount = nonNeg(input.distanceCount)

  const postureDurationMs =
    nonNeg(input.postureDurationMs) > 0 ? nonNeg(input.postureDurationMs) : postureCount * FALLBACK_ALERT_MS
  const visualRawDurationMs = nonNeg(input.distanceDurationMs) + nonNeg(input.fatigueDurationMs)
  const visualCount = distanceCount + fatigueCount
  const visualDurationMs = visualRawDurationMs > 0 ? visualRawDurationMs : visualCount * FALLBACK_ALERT_MS

  const presenceHoursForRate = Math.max(1, presenceMs / MS_PER_HOUR)
  const shareDenomMs = Math.max(presenceMs, MIN_DENOMINATOR_MS)

  // 1) Sedentary (0-30): นั่งสะสมทั้งวัน (0-20) + นั่งต่อเนื่องไม่ลุกพัก >= 45 นาที (0-10)
  const dailySittingPts = clamp01(presenceMs / DAILY_SITTING_TARGET_MS) * 20
  const prolongedPts =
    longestSessionMs > 0
      ? Math.min(10, (longestSessionMs / PROLONGED_SESSION_THRESHOLD_MS) * 7 + prolongedSessionCount * 1.5)
      : 0
  const sedentary = Math.min(30, Math.round(dailySittingPts + prolongedPts))

  // 2) Posture (0-45): สัดส่วนเวลาที่ท่าผิดปกติ (0-25) + ความถี่ต่อชั่วโมง (0-20)
  const postureShare = postureDurationMs / shareDenomMs
  const postureMinutes = postureDurationMs / 60_000
  const postureDurPts =
    postureCount > 0 || postureDurationMs > 0
      ? Math.min(25, Math.max(postureShare / 0.12, postureMinutes / 45) * 25)
      : 0
  const postureRatePerHr = postureCount / presenceHoursForRate
  const postureFreqPts = clamp01(postureRatePerHr / 4) * 20
  const posture = Math.min(45, Math.round(postureDurPts + postureFreqPts))

  // 3) Visual & Fatigue (0-25): ความถี่ระยะใกล้จอ/เหนื่อยล้า (0-15) + สัดส่วนเวลา (0-10)
  const visualRatePerHr = visualCount / presenceHoursForRate
  const visualFreqPts = clamp01(visualRatePerHr / 3) * 15
  const visualShare = visualDurationMs / shareDenomMs
  const visualMinutes = visualDurationMs / 60_000
  const visualDurPts =
    visualCount > 0 || visualDurationMs > 0
      ? Math.min(10, Math.max(visualShare / 0.08, visualMinutes / 25) * 10)
      : 0
  const visualFatigue = Math.min(25, Math.round(visualFreqPts + visualDurPts))

  const score = Math.min(100, sedentary + posture + visualFatigue)
  const level = classifyRiskLevel(score)

  const factors: string[] = []
  const recommendations: string[] = []

  const hasSedentaryRisk = presenceMs >= DAILY_SITTING_TARGET_MS || longestSessionMs >= PROLONGED_SESSION_THRESHOLD_MS
  if (presenceMs >= DAILY_SITTING_TARGET_MS) {
    factors.push('นั่งทำงานสะสม ≥ 6 ชม./วัน')
  }
  if (longestSessionMs >= PROLONGED_SESSION_THRESHOLD_MS) {
    factors.push(`นั่งต่อเนื่องนานสุด ${Math.round(longestSessionMs / 60_000)} นาที`)
  }
  if (hasSedentaryRisk) {
    recommendations.push('ลุกขึ้นเปลี่ยนอิริยาบถหรือเดินพัก 3–5 นาที ทุก 45 นาที')
  }

  const forwardHead = nonNeg(input.byType.forward_head ?? 0)
  const slouching = nonNeg(input.byType.slouching ?? 0)
  const leaning = nonNeg(input.byType.leaning ?? 0)
  let addedPostureFactor = false

  if (forwardHead >= 3) {
    factors.push(`ก้มคอ/ยื่นคอ (${forwardHead} ครั้ง)`)
    addedPostureFactor = true
  }
  if (slouching >= 3) {
    factors.push(`หลังค่อม/โน้มตัว (${slouching} ครั้ง)`)
    addedPostureFactor = true
  }
  if (leaning >= 3) {
    factors.push(`นั่งเอียงข้าง (${leaning} ครั้ง)`)
    addedPostureFactor = true
  }
  if (!addedPostureFactor && posture >= 15) {
    factors.push('อยู่ในท่าทางไม่เหมาะสมสะสม')
    addedPostureFactor = true
  }
  if (addedPostureFactor || posture >= 15) {
    recommendations.push('ปรับจอให้อยู่ระดับสายตา ดึงคางเข้า และยืดกล้ามเนื้อคอ-บ่า-ไหล่')
  }

  const tooClose = nonNeg(input.byType.too_close ?? 0)
  if (tooClose >= 2 || distanceCount >= 2) {
    factors.push(`นั่งใกล้จอเกินไป (${Math.max(tooClose, distanceCount)} ครั้ง)`)
  }
  if (fatigueCount >= 2) {
    factors.push(`มีสัญญาณล้า/ง่วง/หาวถี่ (${fatigueCount} ครั้ง)`)
  }
  if (tooClose >= 2 || distanceCount >= 2 || fatigueCount >= 2 || visualFatigue >= 10) {
    recommendations.push('เว้นระยะห่างจากจอ 50–70 ซม. และพักสายตาทุก 20–30 นาที')
  }

  if (level === 'high') {
    recommendations.push('หากมีอาการปวดตึงเรื้อรัง ชา หรืออ่อนแรง ควรปรึกษาแพทย์หรือนักกายภาพบำบัด')
  }

  if (recommendations.length === 0) {
    recommendations.push('พฤติกรรมการนั่งอยู่ในเกณฑ์ดี รักษาจังหวะการพักสายตาและยืดเหยียดต่อไป')
  }

  return {
    score,
    level,
    breakdown: {
      sedentary,
      posture,
      visualFatigue,
    },
    longestSessionMs,
    prolongedSessionCount,
    factors,
    recommendations,
  }
}

export function summarizeWeeklyRiskTrend(
  dailyScores: Array<{ score: number; level: OfficeSyndromeRiskLevel }>,
): OfficeSyndromeWeeklyTrend {
  const activeDays = dailyScores.length
  if (activeDays === 0) {
    return {
      activeDays: 0,
      elevatedRiskDays: 0,
      highRiskDays: 0,
      averageScore: 0,
      chronicPattern: false,
    }
  }

  let elevatedRiskDays = 0
  let highRiskDays = 0
  let sum = 0
  for (const day of dailyScores) {
    sum += day.score
    if (day.level === 'moderate' || day.level === 'high') {
      elevatedRiskDays += 1
    }
    if (day.level === 'high') {
      highRiskDays += 1
    }
  }

  return {
    activeDays,
    elevatedRiskDays,
    highRiskDays,
    averageScore: Math.round(sum / activeDays),
    chronicPattern: elevatedRiskDays >= 3,
  }
}
