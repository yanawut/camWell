// ตรรกะคำนวณรายงานประจำวัน (Daily Report) — แยกออกมาเป็น pure function เพื่อให้อ่านง่ายและตรวจสอบได้

import {
  assessOfficeSyndromeRisk,
  PROLONGED_SESSION_THRESHOLD_MS,
  summarizeWeeklyRiskTrend,
  type OfficeSyndromeRisk,
  type OfficeSyndromeWeeklyTrend,
} from './officeSyndromeRisk.js'

export interface DailyReportAlertInput {
  id: string
  category: string
  type: string
  employeeId: string | null
  personName: string | null
  cameraId: string | null
  cameraLabel: string | null
  startedAt: number
  endedAt: number | null
}

export interface DailyReportSessionInput {
  id: string
  employeeId: string | null
  personName: string
  cameraId: string
  cameraLabel: string
  startedAt: number
  endedAt: number | null
}

export interface CategoryCounts {
  posture: number
  fatigue: number
  distance: number
  fall: number
}

export interface DailyReportHourlyBucket {
  hour: number
  total: number
  byCategory: CategoryCounts
}

export interface DailyReportPerson {
  key: string
  employeeId: string | null
  personName: string
  cameras: string[]
  firstSeenAt: number | null
  lastSeenAt: number | null
  presenceDurationMs: number
  sessionCount: number
  totalAlerts: number
  alertDurationMs: number
  byCategory: CategoryCounts
  byType: Record<string, number>
  officeSyndromeRisk: OfficeSyndromeRisk
  riskTrend7d: OfficeSyndromeWeeklyTrend
}

export interface DailyReportRiskSummary {
  high: number
  moderate: number
  low: number
  chronicRiskPeople: number
}

export interface DailyReportCamera {
  cameraId: string
  cameraLabel: string
  sessionCount: number
  totalAlerts: number
  byCategory: CategoryCounts
}

export interface DailyReport {
  date: string
  startMs: number
  endMs: number
  generatedAt: number
  summary: {
    totalPeople: number
    totalSessions: number
    totalPresenceMs: number
    totalAlerts: number
    totalAlertDurationMs: number
    byCategory: CategoryCounts
    byType: Record<string, number>
    riskSummary: DailyReportRiskSummary
  }
  hourly: DailyReportHourlyBucket[]
  people: DailyReportPerson[]
  cameras: DailyReportCamera[]
}

const MS_PER_DAY = 24 * 60 * 60 * 1000
const MS_PER_HOUR = 60 * 60 * 1000
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

function emptyCategories(): CategoryCounts {
  return { posture: 0, fatigue: 0, distance: 0, fall: 0 }
}

function incrementCategory(counts: CategoryCounts, category: string) {
  if (category === 'posture' || category === 'fatigue' || category === 'distance' || category === 'fall') {
    counts[category] += 1
  }
}

/**
 * แปลงวันที่ YYYY-MM-DD + tzOffset (นาทีตาม Date.getTimezoneOffset()) เป็นช่วง [startMs, endMs) ใน UTC epoch ms
 * คืน null ถ้ารูปแบบวันที่ไม่ถูกต้อง
 */
export function parseLocalDayRange(
  dateStr: string,
  tzOffsetMinutes: number,
): { date: string; startMs: number; endMs: number } | null {
  const match = DATE_RE.exec(dateStr.trim())
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const utcMidnight = Date.UTC(year, month - 1, day)
  const check = new Date(utcMidnight)
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
    return null
  }
  // Date.getTimezoneOffset() คืนค่า (UTC - local) เป็นนาที เช่น UTC+7 = -420
  // เที่ยงคืน local ใน UTC epoch = utcMidnight + tzOffsetMinutes * 60_000
  const startMs = utcMidnight + tzOffsetMinutes * 60_000
  return { date: dateStr.trim(), startMs, endMs: startMs + MS_PER_DAY }
}

/** คืนวันที่ YYYY-MM-DD ตาม tzOffsetMinutes */
export function formatLocalDate(epochMs: number, tzOffsetMinutes: number): string {
  const local = new Date(epochMs - tzOffsetMinutes * 60_000)
  const y = local.getUTCFullYear()
  const m = String(local.getUTCMonth() + 1).padStart(2, '0')
  const d = String(local.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function clampDurationMs(startedAt: number, endedAt: number | null, startMs: number, endMs: number, nowMs: number): number {
  const effectiveEnd = endedAt ?? Math.min(nowMs, endMs)
  const from = Math.max(startedAt, startMs)
  const to = Math.min(effectiveEnd, endMs)
  return to > from ? to - from : 0
}

export function buildDailyReport(params: {
  date: string
  startMs: number
  endMs: number
  nowMs?: number
  alerts: DailyReportAlertInput[]
  sessions: DailyReportSessionInput[]
}): DailyReport {
  const { date, startMs, endMs, alerts, sessions } = params
  const nowMs = params.nowMs ?? Date.now()

  const summaryByCategory = emptyCategories()
  const byType: Record<string, number> = {}
  let totalAlertDurationMs = 0
  let totalPresenceMs = 0

  const hourly: DailyReportHourlyBucket[] = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    total: 0,
    byCategory: emptyCategories(),
  }))

  interface PersonAccumulator extends Omit<DailyReportPerson, 'officeSyndromeRisk' | 'riskTrend7d'> {
    cameraSet: Set<string>
    longestSessionMs: number
    prolongedSessionCount: number
    durationByCategory: CategoryCounts
  }

  const peopleMap = new Map<string, PersonAccumulator>()
  const cameraMap = new Map<string, DailyReportCamera>()

  const getPersonEntry = (employeeId: string | null, personName: string | null) => {
    const cleanName = personName?.trim() || 'ไม่ทราบตัวตน'
    const key = employeeId ? `emp:${employeeId}` : `anon:${cleanName}`
    let entry = peopleMap.get(key)
    if (!entry) {
      entry = {
        key,
        employeeId,
        personName: cleanName,
        cameras: [],
        cameraSet: new Set<string>(),
        firstSeenAt: null,
        lastSeenAt: null,
        presenceDurationMs: 0,
        sessionCount: 0,
        totalAlerts: 0,
        alertDurationMs: 0,
        byCategory: emptyCategories(),
        longestSessionMs: 0,
        prolongedSessionCount: 0,
        durationByCategory: emptyCategories(),
        byType: {},
      }
      peopleMap.set(key, entry)
    }
    return entry
  }

  const getCameraEntry = (cameraId: string | null, cameraLabel: string | null) => {
    const id = cameraId?.trim() || 'unknown-camera'
    const label = cameraLabel?.trim() || id
    let entry = cameraMap.get(id)
    if (!entry) {
      entry = {
        cameraId: id,
        cameraLabel: label,
        sessionCount: 0,
        totalAlerts: 0,
        byCategory: emptyCategories(),
      }
      cameraMap.set(id, entry)
    }
    return entry
  }

  for (const session of sessions) {
    const duration = clampDurationMs(session.startedAt, session.endedAt, startMs, endMs, nowMs)
    if (duration === 0 && (session.startedAt >= endMs || (session.endedAt !== null && session.endedAt <= startMs))) {
      continue
    }
    totalPresenceMs += duration

    const person = getPersonEntry(session.employeeId, session.personName)
    person.sessionCount += 1
    person.presenceDurationMs += duration
    person.longestSessionMs = Math.max(person.longestSessionMs, duration)
    if (duration >= PROLONGED_SESSION_THRESHOLD_MS) {
      person.prolongedSessionCount += 1
    }
    person.cameraSet.add(session.cameraLabel || session.cameraId)

    const clampedStart = Math.max(session.startedAt, startMs)
    const effectiveEnd = Math.min(session.endedAt ?? Math.min(nowMs, endMs), endMs)
    person.firstSeenAt = person.firstSeenAt === null ? clampedStart : Math.min(person.firstSeenAt, clampedStart)
    person.lastSeenAt = person.lastSeenAt === null ? effectiveEnd : Math.max(person.lastSeenAt, effectiveEnd)

    const cam = getCameraEntry(session.cameraId, session.cameraLabel)
    cam.sessionCount += 1
  }

  let totalAlerts = 0
  for (const alert of alerts) {
    if (alert.startedAt < startMs || alert.startedAt >= endMs) continue
    totalAlerts += 1
    incrementCategory(summaryByCategory, alert.category)
    byType[alert.type] = (byType[alert.type] ?? 0) + 1

    const alertDuration = alert.endedAt !== null ? clampDurationMs(alert.startedAt, alert.endedAt, startMs, endMs, nowMs) : 0
    totalAlertDurationMs += alertDuration

    const hourIdx = Math.min(23, Math.max(0, Math.floor((alert.startedAt - startMs) / MS_PER_HOUR)))
    hourly[hourIdx].total += 1
    incrementCategory(hourly[hourIdx].byCategory, alert.category)

    const person = getPersonEntry(alert.employeeId, alert.personName)
    person.totalAlerts += 1
    person.alertDurationMs += alertDuration
    incrementCategory(person.byCategory, alert.category)
    if (
      alert.category === 'posture' ||
      alert.category === 'fatigue' ||
      alert.category === 'distance' ||
      alert.category === 'fall'
    ) {
      person.durationByCategory[alert.category] += alertDuration
    }
    person.byType[alert.type] = (person.byType[alert.type] ?? 0) + 1
    if (alert.cameraLabel || alert.cameraId) {
      person.cameraSet.add(alert.cameraLabel || alert.cameraId || '')
    }
    person.firstSeenAt = person.firstSeenAt === null ? alert.startedAt : Math.min(person.firstSeenAt, alert.startedAt)
    const alertEnd = Math.min(alert.endedAt ?? alert.startedAt, endMs)
    person.lastSeenAt = person.lastSeenAt === null ? alertEnd : Math.max(person.lastSeenAt, alertEnd)

    if (alert.cameraId || alert.cameraLabel) {
      const cam = getCameraEntry(alert.cameraId, alert.cameraLabel)
      cam.totalAlerts += 1
      incrementCategory(cam.byCategory, alert.category)
    }
  }

  const people: DailyReportPerson[] = [...peopleMap.values()]
    .map(({ cameraSet, longestSessionMs, prolongedSessionCount, durationByCategory, ...rest }) => {
      const officeSyndromeRisk = assessOfficeSyndromeRisk({
        presenceDurationMs: rest.presenceDurationMs,
        longestSessionMs,
        prolongedSessionCount,
        postureCount: rest.byCategory.posture,
        postureDurationMs: durationByCategory.posture,
        fatigueCount: rest.byCategory.fatigue,
        fatigueDurationMs: durationByCategory.fatigue,
        distanceCount: rest.byCategory.distance,
        distanceDurationMs: durationByCategory.distance,
        byType: rest.byType,
      })
      return {
        ...rest,
        cameras: [...cameraSet].filter(Boolean),
        officeSyndromeRisk,
        riskTrend7d: summarizeWeeklyRiskTrend([{ score: officeSyndromeRisk.score, level: officeSyndromeRisk.level }]),
      }
    })
    .sort((a, b) => b.totalAlerts - a.totalAlerts || b.presenceDurationMs - a.presenceDurationMs)

  const riskSummary = summarizeRiskCounts(people)

  const cameras: DailyReportCamera[] = [...cameraMap.values()].sort(
    (a, b) => b.totalAlerts - a.totalAlerts || b.sessionCount - a.sessionCount,
  )

  return {
    date,
    startMs,
    endMs,
    generatedAt: nowMs,
    summary: {
      totalPeople: people.length,
      totalSessions: sessions.length,
      totalPresenceMs,
      totalAlerts,
      totalAlertDurationMs,
      byCategory: summaryByCategory,
      byType,
      riskSummary,
    },
    hourly,
    people,
    cameras,
  }
}

function summarizeRiskCounts(people: DailyReportPerson[]): DailyReportRiskSummary {
  const counts: DailyReportRiskSummary = { high: 0, moderate: 0, low: 0, chronicRiskPeople: 0 }
  for (const person of people) {
    counts[person.officeSyndromeRisk.level] += 1
    if (person.riskTrend7d.chronicPattern) {
      counts.chronicRiskPeople += 1
    }
  }
  return counts
}

/**
 * เติมแนวโน้มความเสี่ยง Office Syndrome ย้อนหลัง 7 วัน (รวมวันที่เลือก) ให้กับทุกคนในรายงาน
 */
export function attachWeeklyRiskTrends(params: {
  report: DailyReport
  alerts: DailyReportAlertInput[]
  sessions: DailyReportSessionInput[]
  nowMs?: number
}): DailyReport {
  const { report, alerts, sessions, nowMs } = params
  const perPersonDays = new Map<string, Array<{ score: number; level: OfficeSyndromeRisk['level'] }>>()

  for (let offset = 6; offset >= 0; offset -= 1) {
    const dayStartMs = report.startMs - offset * MS_PER_DAY
    const dayEndMs = dayStartMs + MS_PER_DAY
    const dayReport =
      offset === 0
        ? report
        : buildDailyReport({
            date: report.date,
            startMs: dayStartMs,
            endMs: dayEndMs,
            nowMs,
            alerts,
            sessions,
          })

    for (const person of dayReport.people) {
      const list = perPersonDays.get(person.key) ?? []
      list.push({
        score: person.officeSyndromeRisk.score,
        level: person.officeSyndromeRisk.level,
      })
      perPersonDays.set(person.key, list)
    }
  }

  const people = report.people.map((person) => {
    const history = perPersonDays.get(person.key) ?? [
      { score: person.officeSyndromeRisk.score, level: person.officeSyndromeRisk.level },
    ]
    const riskTrend7d = summarizeWeeklyRiskTrend(history)
    const recommendations = [...person.officeSyndromeRisk.recommendations]
    if (riskTrend7d.chronicPattern && person.officeSyndromeRisk.level !== 'high') {
      recommendations.push('พบความเสี่ยงต่อเนื่องหลายวันในรอบสัปดาห์ ควรปรับสภาพแวดล้อมการทำงานและยืดเหยียดสม่ำเสมอ')
    }
    return {
      ...person,
      officeSyndromeRisk: {
        ...person.officeSyndromeRisk,
        recommendations,
      },
      riskTrend7d,
    }
  })

  return {
    ...report,
    summary: {
      ...report.summary,
      riskSummary: summarizeRiskCounts(people),
    },
    people,
  }
}
