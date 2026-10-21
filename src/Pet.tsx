// 一只桌宠：两张 3×3 图（9 个朝向、9 个表情），按鼠标方向换格子，戳一下做表情。
// 转头和戳的逻辑改自 page-mascot（MIT，Kamran Ahmed，github.com/nilbuild/page-mascot），
// 区别：鼠标位置由外面传进来（Electron 里是全屏的系统鼠标），外面也能直接让它做表情；去掉了戳时的挤压缩放（人 10-21：看着怪）。
import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'

const DIRECTIONS = ['up-left', 'up', 'up-right', 'left', 'center', 'right', 'down-left', 'down', 'down-right'] as const
export const REACTIONS = ['blink', 'heart', 'sparkle', 'surprised', 'wink', 'bashful', 'sleepy', 'dizzy', 'delighted'] as const
type Direction = (typeof DIRECTIONS)[number]
export type Reaction = (typeof REACTIONS)[number]

// 从正右顺时针，和 y 向下的 atan2 一致
const CLOCKWISE: Direction[] = ['right', 'down-right', 'down', 'down-left', 'left', 'up-left', 'up', 'up-right']
const SECTOR = (Math.PI * 2) / CLOCKWISE.length
const HYSTERESIS = 0.12
const DEAD_ZONE = 60

const PAYOFFS: Reaction[] = ['heart', 'sparkle', 'delighted']
const BOOP_PAYOFF = 120, BOOP_END = 560
const DIZZY_AFTER = 4, DIZZY_WINDOW = 1600, DIZZY_END = 1100
const SHOW_MS = 1400   // 外面触发的表情停留多久


const cell = (i: number): CSSProperties => ({ backgroundPosition: `${(i % 3) * 50}% ${Math.floor(i / 3) * 50}%` })
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))
const layer: CSSProperties = { position: 'absolute', inset: 0, backgroundSize: '300% 300%', backgroundRepeat: 'no-repeat' }

export type PetProps = {
  src: { directions: string; reactions: string }   // 两张九宫格的地址
  size?: number
  pointer: { x: number; y: number } | null
  cue?: { kind: Reaction; at: number }    // 外面让它做的表情（at 变了就做一次）
  sleepy?: boolean                        // 很久没动鼠标：打瞌睡
  boopRef?: React.MutableRefObject<(() => void) | null>
}

export function Pet({ src, size = 104, pointer, cue, sleepy, boopRef }: PetProps) {
  const boxRef = useRef<HTMLSpanElement>(null)
  const timers = useRef<number[]>([])
  const boops = useRef({ count: 0, at: 0 })
  const sector = useRef(-1)
  const [direction, setDirection] = useState<Direction>('center')
  const [reaction, setReaction] = useState<Reaction | null>(null)

  useEffect(() => {
    const box = boxRef.current
    if (!box || !pointer) return
    const r = box.getBoundingClientRect()
    const dx = pointer.x - (r.left + r.width / 2), dy = pointer.y - (r.top + r.height / 2)
    if (Math.hypot(dx, dy) < DEAD_ZONE) { sector.current = -1; setDirection('center'); return }
    const angle = Math.atan2(dy, dx)
    if (sector.current !== -1 && Math.abs(wrap(angle - sector.current * SECTOR)) < SECTOR / 2 + HYSTERESIS) return
    sector.current = (Math.round(angle / SECTOR) + CLOCKWISE.length) % CLOCKWISE.length
    setDirection(CLOCKWISE[sector.current])
  }, [pointer])

  useEffect(() => () => timers.current.forEach(window.clearTimeout), [])

  const clear = () => { timers.current.forEach(window.clearTimeout); timers.current = [] }
  const later = (ms: number, next: Reaction | null) => { timers.current.push(window.setTimeout(() => setReaction(next), ms)) }

  const boop = () => {
    clear()
    const now = Date.now(), b = boops.current
    b.count = now - b.at < DIZZY_WINDOW ? b.count + 1 : 1
    b.at = now
    if (b.count >= DIZZY_AFTER) { b.count = 0; setReaction('dizzy'); later(DIZZY_END, null) }
    else { setReaction('blink'); later(BOOP_PAYOFF, PAYOFFS[(b.count - 1) % PAYOFFS.length]); later(BOOP_END, null) }
  }
  if (boopRef) boopRef.current = boop

  useEffect(() => {
    if (!cue) return
    clear(); setReaction('blink'); later(BOOP_PAYOFF, cue.kind); later(SHOW_MS, null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cue?.at])

  const shown = reaction ?? (sleepy ? 'sleepy' : null)
  return (
    <span ref={boxRef} style={{ position: 'relative', display: 'block', width: size, height: size }}>
      <span style={{ position: 'relative', display: 'block', width: '100%', height: '100%' }}>
        <span style={{ ...layer, backgroundImage: `url("${src.directions}")`, ...cell(DIRECTIONS.indexOf(direction)), opacity: shown ? 0 : 1 }} />
        <span style={{ ...layer, backgroundImage: `url("${src.reactions}")`, ...cell(REACTIONS.indexOf(shown ?? 'blink')), opacity: shown ? 1 : 0 }} />
      </span>
    </span>
  )
}
