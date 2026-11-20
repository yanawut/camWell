// ข้อมูล/หน้าตาตัวละคร pixel art สำหรับ Dashboard ห้องทำงาน — วาดเป็น SVG rect ทีละพิกเซลจากแผนที่ตัวอักษร (sprite map)
// หน้าตา (ทรงผม/สีผม/สีผิว/สีเสื้อ) สุ่มแบบคงที่จาก seed (employeeId ถ้ารู้ตัวตน ไม่งั้น trackId) — คนเดิมจึง
// ได้หน้าตาเดิมทุกครั้งที่กลับเข้ามาในเฟรม

export const SPRITE_WIDTH = 12
export const SPRITE_HEIGHT = 16

// แต่ละแถว 12 ตัวอักษร: '.' = โปร่งใส, H = ผม, S = ผิว, E = ตา, M = ปาก, T = เสื้อ, D = เงาเสื้อ, P = กางเกง
export const BODY: string[] = [
  '............',
  '............',
  '............',
  '..SSSSSSSS..',
  '..SSESSESS..',
  '..SSSSSSSS..',
  '...SSMMSS...',
  '....SSSS....',
  '..TTTTTTTT..',
  '.TTTTDDTTTT.',
  'STTTTDDTTTTS',
  'STTTTTTTTTTS',
  '.TTTTTTTTTT.',
  '..PPPPPPPP..',
  '..PPP..PPP..',
  '..PP....PP..',
]

// ทรงผมวาดทับบน BODY (เฉพาะช่องที่เป็น H)
export const HAIR_STYLES: string[][] = [
  // สั้น
  ['....HHHH....', '...HHHHHH...', '..HHHHHHHH..', '..HH....HH..'],
  // ยาวประบ่า
  ['...HHHHHH...', '..HHHHHHHH..', '.HHHHHHHHHH.', '.HH......HH.', '.HH......HH.', '.H........H.', '.H........H.'],
  // มวยผม
  ['.....HH.....', '....HHHH....', '..HHHHHHHH..', '..HHHHHHHH..'],
  // หัวเกรียน/ผมบาง
  ['............', '............', '...HHHHHH...', '..H......H..'],
]

const HAIR_COLORS = ['#2b1d14', '#5a3a22', '#c58b3a', '#1c1c1c', '#8a4b2a', '#6b6b6b']
const SKIN_COLORS = ['#f5d0a9', '#e8b88a', '#c68a5a', '#8d5a3b']
const SHIRT_COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#64748b']
const PANTS_COLORS = ['#334155', '#1e3a8a', '#3f3f46', '#78350f']

export interface CharacterLook {
  hairStyle: number
  hair: string
  skin: string
  shirt: string
  shirtShade: string
  pants: string
}

/** hash สตริงเป็นเลขจำนวนเต็มบวกแบบคงที่ (FNV-1a) — ใช้เลือกหน้าตาตัวละคร */
function hashString(value: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** ทำสีเข้มขึ้นตามสัดส่วน (0-1) ใช้สร้างเงาเสื้อ */
function darken(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16)
  const scale = (c: number) => Math.round(c * (1 - amount))
  const r = scale((n >> 16) & 0xff)
  const g = scale((n >> 8) & 0xff)
  const b = scale(n & 0xff)
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}

export function lookFromSeed(seed: string): CharacterLook {
  const h = hashString(seed)
  // ใช้คนละช่วงบิตของ hash เลือกแต่ละส่วน ให้ส่วนต่างๆ ไม่ผูกกันเป็นชุดเดียว
  const pick = <T>(list: T[], shift: number) => list[(h >>> shift) % list.length]
  const shirt = pick(SHIRT_COLORS, 0)
  return {
    hairStyle: (h >>> 4) % HAIR_STYLES.length,
    hair: pick(HAIR_COLORS, 8),
    skin: pick(SKIN_COLORS, 12),
    shirt,
    shirtShade: darken(shirt, 0.25),
    pants: pick(PANTS_COLORS, 16),
  }
}

export function colorFor(code: string, look: CharacterLook): string | null {
  switch (code) {
    case 'H':
      return look.hair
    case 'S':
      return look.skin
    case 'E':
      return '#1f2430'
    case 'M':
      return darken(look.skin, 0.3)
    case 'T':
      return look.shirt
    case 'D':
      return look.shirtShade
    case 'P':
      return look.pants
    default:
      return null
  }
}
