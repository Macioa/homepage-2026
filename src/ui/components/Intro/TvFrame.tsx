import { useState, type CSSProperties, type ReactNode } from 'react'
import style from './intro.module.css'

// 80s/90s TV sets drawn over the video. Each set has its own screen hole; the player is clipped to
// that hole and sized to cover it at 16:9, so the bezel's rounded corners sit over the video.
// One is picked at random per page load; ?tv=a|b|c|d forces one.

// Rounded-rect subpath, used to punch the screen hole (fill-rule evenodd).
const rr = (x: number, y: number, w: number, h: number, r: number) =>
  `M${x + r},${y}h${w - 2 * r}a${r},${r} 0 0 1 ${r},${r}v${h - 2 * r}a${r},${r} 0 0 1 ${-r},${r}` +
  `h${2 * r - w}a${r},${r} 0 0 1 ${-r},${-r}v${2 * r - h}a${r},${r} 0 0 1 ${r},${-r}z`

type Hole = [number, number, number, number, number]

// Body with screen cut out, plus a dark inner lip so the glass looks recessed.
const Shell = ({ hole, fill, rx = 40, lip = '#111' }: { hole: Hole; fill: string; rx?: number; lip?: string }) => (
  <>
    <path fillRule='evenodd' fill={fill} d={rr(0, 0, 1600, 900, rx) + rr(...hole)} />
    <path fill='none' stroke={lip} strokeWidth={14} d={rr(...hole)} />
    <path fill='none' stroke='#fff' strokeOpacity={0.08} strokeWidth={3} d={rr(hole[0] - 12, hole[1] - 12, hole[2] + 24, hole[3] + 24, hole[4] + 12)} />
  </>
)

// Screen holes [x, y, w, h, radius] in viewBox units (body spans 0..1600 × 0..900).
const HOLES: Record<string, Hole> = {
  a: [70, 70, 1130, 760, 90],
  b: [110, 80, 1130, 640, 70],
  c: [150, 50, 1300, 720, 110],
  d: [120, 60, 1360, 650, 120],
}

// Antennas live above the body, in the viewBox's negative-y headroom.
const TOP = 340
const VIEW_W = 1600
const VIEW_H = 900 + TOP

// Rabbit ears: dome base on the lid, two telescopic rods in a V.
const RabbitEars = ({ base, c, baseFill, spread = 1 }: { base: number; c: string; baseFill: string; spread?: number }) => (
  <g>
    {[-1, 1].map(s => (
      <g key={s} stroke={c} strokeLinecap='round'>
        <line x1={base} y1={-50} x2={base + s * 230 * spread} y2={-310} strokeWidth={10} />
        <line x1={base} y1={-50} x2={base + s * 120 * spread} y2={-185} strokeWidth={16} />
        <circle cx={base + s * 230 * spread} cy={-310} r={11} fill={c} stroke='none' />
      </g>
    ))}
    <path d={`M${base - 120},10 Q${base - 110},-80 ${base},-80 Q${base + 110},-80 ${base + 120},10 z`} fill={baseFill} stroke='#000' strokeOpacity={0.4} strokeWidth={4} />
    <circle cx={base} cy={-40} r={14} fill='#999' />
  </g>
)

// Single telescopic whip on a swivel, leaning back like a portable's.
const Whip = ({ x, c }: { x: number; c: string }) => (
  <g stroke={c} strokeLinecap='round'>
    <line x1={x} y1={-20} x2={x + 260} y2={-320} strokeWidth={9} />
    <line x1={x} y1={-20} x2={x + 130} y2={-170} strokeWidth={15} />
    <circle cx={x + 260} cy={-320} r={11} fill={c} stroke='none' />
    <rect x={x - 30} y={-34} width={60} height={40} rx={10} fill='#2b2d31' stroke='none' />
  </g>
)

// Late-90s set-top antenna: UHF loop in front of rabbit ears on a flat base.
const LoopEars = ({ base }: { base: number }) => (
  <g>
    {[-1, 1].map(s => (
      <line key={s} x1={base} y1={-50} x2={base + s * 260} y2={-300} stroke='#bbb' strokeWidth={9} strokeLinecap='round' />
    ))}
    <circle cx={base} cy={-150} r={90} fill='none' stroke='#2a2b30' strokeWidth={14} />
    <rect x={base - 150} y={-60} width={300} height={70} rx={20} fill='#2a2b30' stroke='#000' strokeOpacity={0.4} strokeWidth={4} />
    <circle cx={base + 110} cy={-25} r={8} fill='#39ff6a' />
  </g>
)

// Box for the 16:9 player that covers a hole, as % of the hole (overflow is clipped).
const coverStyle = ([, , w, h]: Hole) => {
  const pw = Math.max(w, (h * 16) / 9)
  const ph = (pw * 9) / 16
  return {
    width: `${(pw / w) * 100}%`,
    height: `${(ph / h) * 100}%`,
    left: `${((w - pw) / 2 / w) * 100}%`,
    top: `${((h - ph) / 2 / h) * 100}%`,
  }
}

// Screen window over the hole, as % of the whole set (antenna headroom included).
const screenStyle = ([x, y, w, h, r]: Hole) => ({
  left: `${(x / VIEW_W) * 100}%`,
  top: `${((y + TOP) / VIEW_H) * 100}%`,
  width: `${(w / VIEW_W) * 100}%`,
  height: `${(h / VIEW_H) * 100}%`,
  borderRadius: `${(r / w) * 100}% / ${(r / h) * 100}%`,
})

const Knob = ({ x, y, r, c = '#2a2a2a' }: { x: number; y: number; r: number; c?: string }) => (
  <g>
    <circle cx={x} cy={y} r={r} fill={c} stroke='#000' strokeOpacity={0.5} strokeWidth={4} />
    <circle cx={x} cy={y} r={r * 0.7} fill='#fff' fillOpacity={0.08} />
    <rect x={x - 3} y={y - r + 6} width={6} height={r * 0.6} fill='#ddd' />
  </g>
)

const Slots = ({ x, y, w, n, gap, h = 6, c = '#000', o = 0.45 }: { x: number; y: number; w: number; n: number; gap: number; h?: number; c?: string; o?: number }) => (
  <g fill={c} fillOpacity={o}>
    {Array.from({ length: n }, (_, i) => <rect key={i} x={x} y={y + i * gap} width={w} height={h} rx={h / 2} />)}
  </g>
)

const MODELS: Record<string, () => ReactNode> = {
  // early-80s woodgrain console: wide right control panel with dials and a speaker grille
  a: () => {
    const hole = HOLES.a
    return (
      <>
        <defs>
          <linearGradient id='tv-wood' x1='0' y1='0' x2='1' y2='0.3'>
            <stop offset='0' stopColor='#6b3d1f' /><stop offset='0.5' stopColor='#8a5129' /><stop offset='1' stopColor='#5a3118' />
          </linearGradient>
          <pattern id='tv-grain' width='1600' height='14' patternUnits='userSpaceOnUse'>
            <path d='M0 7 Q400 2 800 8 T1600 6' stroke='#000' strokeOpacity='0.12' strokeWidth='2' fill='none' />
          </pattern>
        </defs>
        <RabbitEars base={700} c='#c8c8c8' baseFill='#3a2414' />
        <Shell hole={hole} fill='url(#tv-wood)' rx={30} />
        <path fillRule='evenodd' fill='url(#tv-grain)' d={rr(0, 0, 1600, 900, 30) + rr(...hole)} />
        <rect x={1250} y={60} width={300} height={780} rx={14} fill='#c9c2b2' stroke='#3a2414' strokeWidth={6} />
        <rect x={1275} y={90} width={250} height={60} rx={6} fill='#222' />
        <text x={1400} y={132} textAnchor='middle' fill='#e8c66a' fontFamily='monospace' fontSize={34} letterSpacing={4}>VHF · UHF</text>
        <Knob x={1400} y={260} r={80} />
        <Knob x={1400} y={430} r={58} />
        <Slots x={1285} y={540} w={230} n={14} gap={20} h={8} />
        <rect x={1290} y={830 - 40} width={100} height={26} rx={6} fill='#333' />
        <circle cx={1490} cy={803} r={9} fill='#ff4030' />
      </>
    )
  },
  // mid-80s silver portable: chrome trim, top-right tuner buttons, speaker slots below the screen
  b: () => {
    const hole = HOLES.b
    return (
      <>
        <defs>
          <linearGradient id='tv-silver' x1='0' y1='0' x2='0' y2='1'>
            <stop offset='0' stopColor='#d8dadc' /><stop offset='0.55' stopColor='#a9adb2' /><stop offset='1' stopColor='#7c8086' />
          </linearGradient>
        </defs>
        <Whip x={1200} c='#d0d3d7' />
        <Shell hole={hole} fill='url(#tv-silver)' rx={60} lip='#1a1a1a' />
        <rect x={1290} y={80} width={250} height={640} rx={20} fill='#2b2d31' />
        {Array.from({ length: 8 }, (_, i) => (
          <rect key={i} x={1310 + (i % 2) * 115} y={110 + Math.floor(i / 2) * 70} width={95} height={48} rx={6} fill={i === 0 ? '#e8b440' : '#cfd2d6'} />
        ))}
        <Knob x={1415} y={480} r={55} c='#555' />
        <Knob x={1415} y={630} r={40} c='#555' />
        <Slots x={140} y={760} w={600} n={5} gap={22} h={9} />
        <text x={1240} y={810} textAnchor='end' fill='#333' fontFamily='sans-serif' fontWeight={700} fontStyle='italic' fontSize={50}>COLOR 13</text>
        <circle cx={1500} cy={800} r={10} fill='#40ff70' />
      </>
    )
  },
  // early-90s black stereo set: thin bezel, chin strip with buttons, side speakers
  c: () => {
    const hole = HOLES.c
    return (
      <>
        <defs>
          <linearGradient id='tv-black' x1='0' y1='0' x2='0' y2='1'>
            <stop offset='0' stopColor='#2c2c2e' /><stop offset='1' stopColor='#0d0d0e' />
          </linearGradient>
        </defs>
        <RabbitEars base={800} c='#888' baseFill='#1a1a1c' spread={1.15} />
        <Shell hole={hole} fill='url(#tv-black)' rx={50} lip='#000' />
        <Slots x={40} y={140} w={70} n={26} gap={22} h={8} c='#000' o={0.8} />
        <Slots x={1490} y={140} w={70} n={26} gap={22} h={8} c='#000' o={0.8} />
        <rect x={150} y={800} width={1300} height={60} rx={10} fill='#000' fillOpacity={0.35} />
        <text x={180} y={845} fill='#bbb' fontFamily='sans-serif' fontSize={34} letterSpacing={8}>STEREO</text>
        {Array.from({ length: 6 }, (_, i) => <rect key={i} x={980 + i * 60} y={815} width={44} height={28} rx={5} fill='#3a3a3c' />)}
        <circle cx={1410} cy={830} r={9} fill='#ff2a2a' />
      </>
    )
  },
  // late-90s grey TV/VCR combo: curvy bezel, tape slot and transport buttons along the bottom
  d: () => {
    const hole = HOLES.d
    return (
      <>
        <defs>
          <linearGradient id='tv-grey' x1='0' y1='0' x2='0' y2='1'>
            <stop offset='0' stopColor='#6c6f75' /><stop offset='1' stopColor='#3e4046' />
          </linearGradient>
        </defs>
        <LoopEars base={800} />
        <Shell hole={hole} fill='url(#tv-grey)' rx={110} lip='#15161a' />
        <rect x={500} y={760} width={600} height={40} rx={8} fill='#111' />
        <rect x={510} y={770} width={580} height={10} rx={4} fill='#333' />
        {['⏮', '◀◀', '▶', '■', '▶▶', '⏏'].map((t, i) => (
          <g key={i}>
            <rect x={140 + i * 55} y={765} width={46} height={30} rx={6} fill='#2a2b30' />
            <text x={163 + i * 55} y={788} textAnchor='middle' fill='#aaa' fontSize={18}>{t}</text>
          </g>
        ))}
        <rect x={1160} y={762} width={220} height={40} rx={6} fill='#05140a' />
        <text x={1270} y={792} textAnchor='middle' fill='#39ff6a' fontFamily='monospace' fontSize={30}>12:00</text>
        <circle cx={1420} cy={782} r={10} fill='#39ff6a' />
      </>
    )
  },
}

const pickModel = () => {
  const forced = new URLSearchParams(location.search).get('tv')
  if (forced && MODELS[forced]) return forced
  const keys = Object.keys(MODELS)
  return keys[Math.floor(Math.random() * keys.length)]
}

// Wraps the player: the box takes the video's size rules and the TV sits on top of it.
export const TvFrame = ({ children }: { children: ReactNode }) => {
  const [model] = useState(pickModel)
  const Model = MODELS[model]
  const hole = HOLES[model]
  return (
    <div className={style.tv} data-tv={model} style={{ '--tv-aspect': VIEW_W / VIEW_H } as CSSProperties}>
      <div className={style.tvScreen} style={screenStyle(hole)}>
        <div style={{ position: 'absolute', ...coverStyle(hole) }}>{children}</div>
      </div>
      <svg className={style.tvSet} viewBox={`0 ${-TOP} ${VIEW_W} ${VIEW_H}`} aria-hidden='true'>
        <Model />
      </svg>
    </div>
  )
}
