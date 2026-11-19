// แปลงข้อมูลรายบุคคลเป็น "อาการประจำวัน" และระดับสีของแผนภาพจุดอาการร่างกายส่วนบน (ใช้ร่วมกันทั้ง UI และ PNG)

import type { DailyReportPerson } from '../services/dailyReport'

export type ZoneSeverity = 'none' | 'low' | 'moderate' | 'high'

export interface DailySymptomItem {
  key: string
  label: string
  valueText: string
  severity: ZoneSeverity
}

export interface UpperBodyZones {
  head: ZoneSeverity
  neck: ZoneSeverity
  shoulders: ZoneSeverity
  back: ZoneSeverity
}

export interface PersonDailySymptomSummary {
  zones: UpperBodyZones
  symptoms: DailySymptomItem[]
}

export interface PotentialCondition {
  key: string
  title: string
  reason: string
  severity: Exclude<ZoneSeverity, 'none'>
}

export const NO_SYMPTOMS_TEXT = 'ไม่พบอาการผิดปกติวันนี้'

const SEVERITY_ORDER: Record<ZoneSeverity, number> = {
  none: 0,
  low: 1,
  moderate: 2,
  high: 3,
}

function maxSeverity(...levels: ZoneSeverity[]): ZoneSeverity {
  return levels.reduce<ZoneSeverity>(
    (best, cur) => (SEVERITY_ORDER[cur] > SEVERITY_ORDER[best] ? cur : best),
    'none',
  )
}

function severityFromCount(count: number, moderateAt = 3, highAt = 6): ZoneSeverity {
  if (count >= highAt) return 'high'
  if (count >= moderateAt) return 'moderate'
  if (count >= 1) return 'low'
  return 'none'
}

export function extractPersonDailySymptoms(person: DailyReportPerson): PersonDailySymptomSummary {
  const byType = person.byType ?? {}
  const hasTypeBreakdown = Object.keys(byType).length > 0

  const forwardHead = byType.forward_head ?? 0
  const slouching = byType.slouching ?? 0
  const leaning = byType.leaning ?? 0
  const tooClose = byType.too_close ?? person.byCategory.distance
  const fatigue = person.byCategory.fatigue
  const postureTotal = person.byCategory.posture
  const longestMin = Math.round(person.officeSyndromeRisk.longestSessionMs / 60_000)
  const prolongedCount = person.officeSyndromeRisk.prolongedSessionCount

  const headSev = maxSeverity(severityFromCount(tooClose, 2, 5), severityFromCount(fatigue, 2, 5))
  const neckSev = hasTypeBreakdown
    ? severityFromCount(forwardHead, 3, 6)
    : severityFromCount(postureTotal, 3, 6)
  const shouldersSev = hasTypeBreakdown
    ? maxSeverity(severityFromCount(leaning, 2, 5), severityFromCount(forwardHead, 4, 8))
    : severityFromCount(postureTotal, 4, 8)
  const prolongedSev: ZoneSeverity =
    longestMin >= 60 || prolongedCount >= 2 ? 'high' : longestMin >= 45 || prolongedCount >= 1 ? 'moderate' : 'none'
  const backSev = maxSeverity(
    hasTypeBreakdown ? severityFromCount(slouching, 3, 6) : severityFromCount(postureTotal, 3, 6),
    prolongedSev,
  )

  // แสดงเฉพาะอาการที่ตรวจพบจริง — รายการที่ปกติ (0 ครั้ง / 0 นาที) ไม่ต้องแสดง
  const symptoms: DailySymptomItem[] = []

  if (hasTypeBreakdown || postureTotal === 0) {
    if (forwardHead > 0) {
      symptoms.push({
        key: 'forward_head',
        label: 'ก้มคอ/ยื่นคอ',
        valueText: `${forwardHead} ครั้ง`,
        severity: severityFromCount(forwardHead, 3, 6),
      })
    }
    if (slouching > 0) {
      symptoms.push({
        key: 'slouching',
        label: 'หลังค่อม/โน้มตัว',
        valueText: `${slouching} ครั้ง`,
        severity: severityFromCount(slouching, 3, 6),
      })
    }
    if (leaning > 0) {
      symptoms.push({
        key: 'leaning',
        label: 'นั่งเอียงข้าง',
        valueText: `${leaning} ครั้ง`,
        severity: severityFromCount(leaning, 2, 5),
      })
    }
  } else {
    symptoms.push({
      key: 'posture_total',
      label: 'ท่าทางไม่เหมาะสม',
      valueText: `${postureTotal} ครั้ง`,
      severity: severityFromCount(postureTotal, 3, 6),
    })
  }

  const eyeTotal = tooClose + fatigue
  if (eyeTotal > 0) {
    symptoms.push({
      key: 'eye_fatigue',
      label: 'ใกล้จอ / ตาล้า',
      valueText: `${eyeTotal} ครั้ง`,
      severity: headSev,
    })
  }

  if (longestMin > 0) {
    symptoms.push({
      key: 'prolonged_sitting',
      label: 'นั่งต่อเนื่องนานสุด',
      valueText: `${longestMin} นาที`,
      severity: prolongedSev,
    })
  }

  if (person.byCategory.fall > 0) {
    symptoms.push({
      key: 'fall',
      label: 'ตรวจพบหกล้ม/หลุดเฟรม',
      valueText: `${person.byCategory.fall} ครั้ง`,
      severity: 'high',
    })
  }

  return {
    zones: {
      head: headSev,
      neck: neckSev,
      shoulders: shouldersSev,
      back: backSev,
    },
    symptoms,
  }
}

/**
 * แปลงพฤติกรรมและแนวโน้ม 7 วันของผู้ใช้เป็น "แนวโน้มอาการ/ภาวะที่อาจเกิดขึ้นได้"
 * (เพื่อเฝ้าระวังเชิงป้องกัน ไม่ใช่การวินิจฉัยโรค)
 */
export function extractPotentialConditions(person: DailyReportPerson): PotentialCondition[] {
  const byType = person.byType ?? {}
  const forwardHead = byType.forward_head ?? 0
  const slouching = byType.slouching ?? 0
  const leaning = byType.leaning ?? 0
  const tooClose = byType.too_close ?? person.byCategory.distance
  const fatigue = person.byCategory.fatigue
  const postureTotal = person.byCategory.posture
  const longestMin = Math.round(person.officeSyndromeRisk.longestSessionMs / 60_000)
  const risk = person.officeSyndromeRisk
  const trend = person.riskTrend7d

  const conditions: PotentialCondition[] = []

  if (person.byCategory.fall > 0) {
    conditions.push({
      key: 'fall_injury',
      title: 'เสี่ยงบาดเจ็บเฉียบพลันจากการล้ม/เสียการทรงตัว',
      reason: `พบเหตุการณ์หกล้มหรือหลุดเฟรม ${person.byCategory.fall} ครั้ง`,
      severity: 'high',
    })
  }

  if (trend.chronicPattern || risk.level === 'high') {
    conditions.push({
      key: 'chronic_office_syndrome',
      title: 'แนวโน้มเข้าสู่ภาวะ Office Syndrome เรื้อรัง',
      reason: trend.chronicPattern
        ? `มีความเสี่ยงระดับปานกลาง–สูงต่อเนื่อง ${trend.elevatedRiskDays}/${trend.activeDays} วันในรอบสัปดาห์`
        : `คะแนนความเสี่ยงวันนี้สูง (${risk.score}/100)`,
      severity: 'high',
    })
  }

  if (forwardHead >= 2) {
    conditions.push({
      key: 'cervical_tension',
      title: 'กล้ามเนื้อคอ–บ่าตึง / ปวดศีรษะจากกล้ามเนื้อ (Tension-type)',
      reason: `ก้มคอหรือยื่นคอไปข้างหน้า ${forwardHead} ครั้ง`,
      severity: forwardHead >= 6 ? 'high' : forwardHead >= 3 ? 'moderate' : 'low',
    })
  }

  if (slouching >= 2 || longestMin >= 45) {
    const reasons: string[] = []
    if (slouching >= 2) reasons.push(`หลังค่อม/โน้มตัว ${slouching} ครั้ง`)
    if (longestMin >= 45) reasons.push(`นั่งต่อเนื่องนานสุด ${longestMin} นาที`)
    conditions.push({
      key: 'back_strain',
      title: 'ปวดหลัง–สะบัก / กล้ามเนื้อหลังล้าจากท่านั่ง (Myofascial Back Pain)',
      reason: reasons.join(' และ '),
      severity: slouching >= 6 || longestMin >= 60 ? 'high' : 'moderate',
    })
  }

  if (leaning >= 2) {
    conditions.push({
      key: 'muscle_imbalance',
      title: 'กล้ามเนื้อไหล่–ลำตัวตึงไม่สมดุล (ปวดบ่าหรือเอวข้างเดียว)',
      reason: `นั่งเอียงข้าง ${leaning} ครั้ง`,
      severity: leaning >= 5 ? 'high' : 'moderate',
    })
  }

  if (tooClose >= 2 || fatigue >= 2) {
    const reasons: string[] = []
    if (tooClose >= 2) reasons.push(`นั่งใกล้จอ ${tooClose} ครั้ง`)
    if (fatigue >= 2) reasons.push(`สัญญาณล้า/ง่วง/หาวถี่ ${fatigue} ครั้ง`)
    conditions.push({
      key: 'computer_vision_syndrome',
      title: 'ภาวะตาล้าจากหน้าจอ / ปวดกระบอกตา (Computer Vision Syndrome)',
      reason: reasons.join(' และ '),
      severity: tooClose >= 5 || fatigue >= 5 ? 'high' : 'moderate',
    })
  }

  // กรณีข้อมูลชนิดท่าย่อยยังไม่มี (หรือความเสี่ยงปานกลางจากระยะเวลาท่าทางรวม)
  if (conditions.length === 0 && (postureTotal >= 2 || risk.level !== 'low')) {
    conditions.push({
      key: 'general_myofascial',
      title: 'กล้ามเนื้อคอ–บ่า–หลังตึงตัวสะสม',
      reason: `แจ้งเตือนท่านั่ง ${postureTotal} ครั้ง (คะแนนความเสี่ยง ${risk.score}/100)`,
      severity: risk.level === 'high' ? 'high' : risk.level === 'moderate' ? 'moderate' : 'low',
    })
  }

  return conditions
}
