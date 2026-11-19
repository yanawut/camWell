import { describe, expect, it } from 'vitest'
import { buildDailyReportCsv, formatDurationMs } from './dailyReportExport'
import { getTodayDateInputValue, shiftDateInputValue, type DailyReport } from '../services/dailyReport'

describe('dailyReportExport', () => {
  it('formats durations in Thai', () => {
    expect(formatDurationMs(0)).toBe('0 วิ')
    expect(formatDurationMs(45_000)).toBe('45 วิ')
    expect(formatDurationMs(125_000)).toBe('2 นาที 5 วิ')
    expect(formatDurationMs(3_600_000)).toBe('1 ชม.')
    expect(formatDurationMs(5_400_000)).toBe('1 ชม. 30 นาที')
  })

  it('builds CSV rows with escaped quotes and person breakdown', () => {
    const report: DailyReport = {
      date: '2026-11-13',
      startMs: 1_700_000_000_000,
      endMs: 1_700_086_400_000,
      generatedAt: 1_700_010_000_000,
      summary: {
        totalPeople: 1,
        totalSessions: 2,
        totalPresenceMs: 3_600_000,
        totalAlerts: 4,
        totalAlertDurationMs: 90_000,
        byCategory: { posture: 2, fatigue: 1, distance: 1, fall: 0 },
        byType: { slouching: 2, drowsy: 1, too_close: 1 },
        riskSummary: { high: 0, moderate: 1, low: 0, chronicRiskPeople: 0 },
      },
      hourly: [],
      people: [
        {
          key: 'emp:e1',
          employeeId: 'e1',
          personName: 'สมชาย "จ๊อบ"',
          cameras: ['กล้อง 1', 'กล้อง 2'],
          firstSeenAt: null,
          lastSeenAt: null,
          presenceDurationMs: 3_600_000,
          sessionCount: 2,
          totalAlerts: 4,
          alertDurationMs: 90_000,
          byCategory: { posture: 2, fatigue: 1, distance: 1, fall: 0 },
          officeSyndromeRisk: {
            score: 42,
            level: 'moderate',
            breakdown: { sedentary: 10, posture: 20, visualFatigue: 12 },
            longestSessionMs: 1_800_000,
            prolongedSessionCount: 0,
            factors: ['หลังค่อม/โน้มตัว'],
            recommendations: ['ปรับจอให้อยู่ระดับสายตา'],
          },
          riskTrend7d: {
            activeDays: 3,
            elevatedRiskDays: 2,
            highRiskDays: 0,
            averageScore: 38,
            chronicPattern: false,
          },
        },
      ],
      cameras: [],
    }

    const csv = buildDailyReportCsv(report)
    const lines = csv.split('\r\n')
    expect(lines).toHaveLength(2)
    expect(lines[0]).toContain('"วันที่","บุคคล"')
    expect(lines[0]).toContain('"คะแนนความเสี่ยง Office Syndrome","ระดับความเสี่ยง"')
    expect(lines[1]).toContain('"2026-11-13","สมชาย ""จ๊อบ""","e1","กล้อง 1 / กล้อง 2"')
    expect(lines[1]).toContain('"60","2","4","2","1","1","0","90","42","ปานกลาง","2/3","หลังค่อม/โน้มตัว"')
  })

  it('shifts and formats YYYY-MM-DD dates', () => {
    expect(shiftDateInputValue('2026-11-13', -1)).toBe('2026-11-12')
    expect(shiftDateInputValue('2026-11-13', 1)).toBe('2026-11-14')
    expect(getTodayDateInputValue(new Date(2026, 0, 5))).toBe('2026-01-05')
  })
})
