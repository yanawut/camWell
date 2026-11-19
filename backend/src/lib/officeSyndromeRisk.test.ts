import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { assessOfficeSyndromeRisk, summarizeWeeklyRiskTrend } from './officeSyndromeRisk.js'
import { attachWeeklyRiskTrends, buildDailyReport } from './dailyReport.js'

const MIN = 60_000
const HOUR = 60 * MIN

describe('officeSyndromeRisk', () => {
  it('classifies long sitting with proper breaks and few alerts as low risk', () => {
    const risk = assessOfficeSyndromeRisk({
      presenceDurationMs: 6 * HOUR,
      longestSessionMs: 35 * MIN,
      prolongedSessionCount: 0,
      postureCount: 2,
      postureDurationMs: 30_000,
      fatigueCount: 0,
      fatigueDurationMs: 0,
      distanceCount: 1,
      distanceDurationMs: 15_000,
      byType: { forward_head: 2, too_close: 1 },
    })

    assert.equal(risk.level, 'low')
    assert.ok(risk.score < 35, `expected score < 35, got ${risk.score}`)
    assert.equal(risk.score, risk.breakdown.sedentary + risk.breakdown.posture + risk.breakdown.visualFatigue)
  })

  it('classifies prolonged sitting plus frequent posture and distance issues as high risk', () => {
    const risk = assessOfficeSyndromeRisk({
      presenceDurationMs: 6.5 * HOUR,
      longestSessionMs: 75 * MIN,
      prolongedSessionCount: 2,
      postureCount: 18,
      postureDurationMs: 25 * MIN,
      fatigueCount: 2,
      fatigueDurationMs: 2 * MIN,
      distanceCount: 8,
      distanceDurationMs: 6 * MIN,
      byType: { forward_head: 12, slouching: 6, too_close: 8, drowsy: 2 },
    })

    assert.equal(risk.level, 'high')
    assert.ok(risk.score >= 65, `expected score >= 65, got ${risk.score}`)
    assert.ok(risk.factors.some((f) => f.includes('6 ชม.')))
    assert.ok(risk.factors.some((f) => f.includes('ก้มคอ/ยื่นคอ')))
    assert.ok(risk.factors.some((f) => f.includes('นั่งใกล้จอเกินไป')))
    assert.ok(risk.recommendations.length >= 3)
  })

  it('prevents brief 5-minute sessions with a single alert from spiking to high risk', () => {
    const risk = assessOfficeSyndromeRisk({
      presenceDurationMs: 5 * MIN,
      longestSessionMs: 5 * MIN,
      prolongedSessionCount: 0,
      postureCount: 1,
      postureDurationMs: 30_000,
      fatigueCount: 0,
      fatigueDurationMs: 0,
      distanceCount: 0,
      distanceDurationMs: 0,
      byType: { slouching: 1 },
    })

    assert.equal(risk.level, 'low')
    assert.ok(risk.score < 20, `expected score < 20, got ${risk.score}`)
  })

  it('detects chronic pattern when >= 3 days in 7-day window are moderate or high risk', () => {
    const trend = summarizeWeeklyRiskTrend([
      { score: 20, level: 'low' },
      { score: 45, level: 'moderate' },
      { score: 70, level: 'high' },
      { score: 50, level: 'moderate' },
    ])

    assert.equal(trend.activeDays, 4)
    assert.equal(trend.elevatedRiskDays, 3)
    assert.equal(trend.highRiskDays, 1)
    assert.equal(trend.averageScore, 46)
    assert.equal(trend.chronicPattern, true)
  })

  it('attaches 7-day trend and riskSummary in dailyReport', () => {
    const dayStart = Date.UTC(2026, 10, 19, 0, 0, 0)
    const dayMs = 24 * HOUR

    // สร้างข้อมูล 3 วัน (วันที่ 17, 18, 19) ที่มีความเสี่ยงระดับปานกลาง-สูง
    const sessions = [2, 1, 0].map((offset) => ({
      id: `s-${offset}`,
      employeeId: 'e1',
      personName: 'สมชาย',
      cameraId: 'cam-1',
      cameraLabel: 'กล้อง 1',
      startedAt: dayStart - offset * dayMs + 9 * HOUR,
      endedAt: dayStart - offset * dayMs + 15 * HOUR,
    }))

    const alerts = [2, 1, 0].flatMap((offset) =>
      Array.from({ length: 12 }, (_, idx) => ({
        id: `a-${offset}-${idx}`,
        category: 'posture',
        type: 'forward_head',
        employeeId: 'e1',
        personName: 'สมชาย',
        cameraId: 'cam-1',
        cameraLabel: 'กล้อง 1',
        startedAt: dayStart - offset * dayMs + 9 * HOUR + idx * 10 * MIN,
        endedAt: dayStart - offset * dayMs + 9 * HOUR + idx * 10 * MIN + 2 * MIN,
      })),
    )

    const base = buildDailyReport({
      date: '2026-11-19',
      startMs: dayStart,
      endMs: dayStart + dayMs,
      nowMs: dayStart + 18 * HOUR,
      alerts,
      sessions,
    })

    const enriched = attachWeeklyRiskTrends({
      report: base,
      alerts,
      sessions,
      nowMs: dayStart + 18 * HOUR,
    })

    assert.equal(enriched.people.length, 1)
    const person = enriched.people[0]
    assert.ok(person.officeSyndromeRisk.score >= 35)
    assert.equal(person.riskTrend7d.activeDays, 3)
    assert.equal(person.riskTrend7d.elevatedRiskDays, 3)
    assert.equal(person.riskTrend7d.chronicPattern, true)
    assert.equal(enriched.summary.riskSummary.chronicRiskPeople, 1)
  })
})
