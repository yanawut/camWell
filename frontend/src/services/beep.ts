// เสียงแจ้งเตือนสั้นๆ ด้วย Web Audio API — ไม่ต้องพึ่งไฟล์เสียงภายนอกเลย ทำให้ทั้งแอปรันแบบ local ได้ 100%

let audioCtx: AudioContext | null = null

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
  }
  return audioCtx
}

/** เล่นเสียงบี๊บสั้นๆ 1 ครั้ง เรียกตอน alert เริ่ม (ต้องมี user gesture มาก่อนอย่างน้อย 1 ครั้งตามข้อจำกัดเบราว์เซอร์) */
export function playAlertBeep() {
  try {
    const ctx = getAudioContext()
    const oscillator = ctx.createOscillator()
    const gain = ctx.createGain()
    oscillator.type = 'sine'
    oscillator.frequency.value = 880
    gain.gain.setValueAtTime(0.0001, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35)
    oscillator.connect(gain)
    gain.connect(ctx.destination)
    oscillator.start()
    oscillator.stop(ctx.currentTime + 0.4)
  } catch (err) {
    console.warn('[beep] เล่นเสียงแจ้งเตือนไม่สำเร็จ:', err)
  }
}

/**
 * เสียงแจ้งเตือนฉุกเฉิน (หกล้ม/ตกจากเก้าอี้) — โทนสองเสียงสลับกันซ้ำหลายรอบ เสียงแหลมกว่าและยาวกว่า
 * playAlertBeep() ปกติอย่างชัดเจน เพื่อให้แยกออกได้ทันทีว่าเป็นเหตุฉุกเฉิน ไม่ใช่แค่เตือนท่านั่ง/ความเหนื่อยล้าทั่วไป
 */
export function playFallAlarm() {
  try {
    const ctx = getAudioContext()
    const startAt = ctx.currentTime
    const toneDurationS = 0.25
    const repeats = 4
    for (let i = 0; i < repeats; i++) {
      const toneStart = startAt + i * toneDurationS * 2
      const freq = i % 2 === 0 ? 1046 : 784 // สลับโทนสูง-ต่ำ ให้ฟังออกว่าต่างจากบี๊บเตือนปกติ
      const oscillator = ctx.createOscillator()
      const gain = ctx.createGain()
      oscillator.type = 'square'
      oscillator.frequency.value = freq
      gain.gain.setValueAtTime(0.0001, toneStart)
      gain.gain.exponentialRampToValueAtTime(0.25, toneStart + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, toneStart + toneDurationS - 0.02)
      oscillator.connect(gain)
      gain.connect(ctx.destination)
      oscillator.start(toneStart)
      oscillator.stop(toneStart + toneDurationS)
    }
  } catch (err) {
    console.warn('[beep] เล่นเสียงแจ้งเตือนฉุกเฉินไม่สำเร็จ:', err)
  }
}
