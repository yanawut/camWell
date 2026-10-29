// วาดตัวละคร pixel art (SVG rect ทีละพิกเซล) — ข้อมูล sprite และการเลือกหน้าตาอยู่ใน pixelLook.ts

import type { ReactNode } from 'react'
import { BODY, HAIR_STYLES, SPRITE_HEIGHT, SPRITE_WIDTH, colorFor, type CharacterLook } from './pixelLook'

/** วาดตัวละคร 12×16 พิกเซล มุมซ้ายบนอยู่ที่ (0,0) ของ <g> ที่ครอบ */
export function PixelCharacter({ look }: { look: CharacterLook }) {
  const hair = HAIR_STYLES[look.hairStyle]
  const pixels: ReactNode[] = []
  for (let y = 0; y < SPRITE_HEIGHT; y++) {
    for (let x = 0; x < SPRITE_WIDTH; x++) {
      const hairCode = hair[y]?.[x]
      const code = hairCode === 'H' ? 'H' : BODY[y][x]
      const fill = colorFor(code, look)
      if (fill) pixels.push(<rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={fill} />)
    }
  }
  return <g shapeRendering="crispEdges">{pixels}</g>
}
