import * as THREE from 'three'
import * as CANNON from 'cannon-es'
import { FontLoader, type Font } from 'three/examples/jsm/loaders/FontLoader.js'
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js'

const FONT_URL = '/fonts/droid_sans_mono_regular.typeface.json'
const SIZE = 1
const DEPTH = 0.18
const NEON = new THREE.Color('#ff2d95')
const CORE = new THREE.Color('#ffe6f2')
const FOV = 30
const TUBE = 0.035
const LETTER_SPACING = 1.3
// Glow without post-processing: additive halo tubes around the core ([radius, opacity]).
const HALOS: [number, number][] = [
  [0.07, 0.2],
  [0.14, 0.063],
  [0.26, 0.028]
]

// Letter physics: each glyph is a cannon body pulled to its home slot by a spring, so it flies in,
// wobbles, then settles into the name.
const SPRING_K = 60
const SPRING_DAMP = 7
const UPRIGHT_K = 28

// Loose letter: every 13s one letter on the sign wobbles a little, 2s later wobbles more, 2s after
// that comes loose and falls down the page, piling up on the bottom of the viewport.
const LOOSE_EVERY_MS = 13_000
const LOOSE_STEP_MS = 2_000
const HOVER_SPEEDUP = 3
const WOBBLE_HZ = 3
const WOBBLE_SMALL = 0.08 // radians
const WOBBLE_BIG = 0.25
const GRAVITY = 16
// Lights out on a dropped letter: sputter for a moment, then stay dark (faint dead tube).
const SPUTTER_MS = 700
const DEAD_GLOW = 0.06
// Letters that have reached the floor shatter into glass shards when any falling letter hits them.
const SHARDS = 18
const SHARD_LIFE_MS = 1400

type Stage = 'sign' | 'wobble' | 'shake' | 'fallen'
type Glow = { core: THREE.MeshBasicMaterial; halos: THREE.MeshBasicMaterial[] }
type Letter = {
  mesh: THREE.Mesh
  body: CANNON.Body
  slot: number // x offset from the sign's center, in letter units
  home: CANNON.Vec3
  glow: Glow
  stage: Stage
  stageAt: number
  settled?: boolean
  shatter?: boolean
}
type Shard = { mesh: THREE.Mesh; vel: THREE.Vector3; spin: THREE.Vector3; born: number }

const haloMaterial = (opacity: number) =>
  new THREE.MeshBasicMaterial({ color: NEON, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false })

// Sets a letter's brightness (1 = normal, near 0 = tube flickering off).
const setGlow = ({ core, halos }: Glow, level: number) => {
  core.color.copy(NEON).lerp(CORE, Math.min(level, 1) * 0.42).multiplyScalar(Math.min(level, 1))
  halos.forEach((m, i) => (m.opacity = HALOS[i][1] * level))
}

// Unlit tube once the sputter ends: dark purple glass, lit only by the scene lights.
const DEAD_TUBE = new THREE.MeshPhysicalMaterial({
  color: 0x2a0d3d, roughness: 0.12, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.08, transparent: true, opacity: 0.8,
})

// Hides the letter's solid backing while its child tubes still render.
const NO_BACKING = new THREE.MeshBasicMaterial({ visible: false })

// Swaps a letter's glowing tubes for plain glass and hides the additive halos (no fuzz).
const goDark = (mesh: THREE.Mesh, { core, halos }: Glow) => {
  mesh.userData.dark = true
  mesh.material = NO_BACKING
  mesh.children.forEach(c => {
    const tube = c as THREE.Mesh
    if (tube.material === core) tube.material = DEAD_TUBE
    else if (halos.includes(tube.material as THREE.MeshBasicMaterial)) tube.visible = false
  })
}

const backing = new THREE.MeshStandardMaterial({ color: 0x140b10, roughness: 0.6, metalness: 0.3 })

// One letter: dark extruded body (the sign's backing) with neon tubes traced along its outlines.
const buildLetter = (font: Font, ch: string, glow: Glow) => {
  const geometry = new TextGeometry(ch, { font, size: SIZE, depth: DEPTH, curveSegments: 6, bevelEnabled: false })
  geometry.computeBoundingBox()
  const center = geometry.boundingBox!.getCenter(new THREE.Vector3())
  geometry.translate(-center.x, -center.y, -center.z)
  const mesh = new THREE.Mesh(geometry, backing)
  for (const shape of font.generateShapes(ch, SIZE)) {
    for (const path of [shape, ...shape.holes]) {
      const pts = path.getSpacedPoints(48).map(p => new THREE.Vector3(p.x - center.x, p.y - center.y, DEPTH / 2 + TUBE))
      const curve = new THREE.CatmullRomCurve3(pts, true)
      mesh.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 96, TUBE, 6, true), glow.core))
      HALOS.forEach(([radius], i) => mesh.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 96, radius, 8, true), glow.halos[i])))
    }
  }
  return { mesh, size: geometry.boundingBox!.getSize(new THREE.Vector3()) }
}

// Renders `text` as a neon sign on a transparent full-viewport overlay, placed over `slot` (the
// header's reserved space) so loose letters can fall down the whole page. Returns cleanup.
export const mountNeonName = (slot: HTMLElement, text: string) => {
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setClearColor(0x000000, 0)
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
  const canvas = renderer.domElement
  canvas.setAttribute('aria-hidden', 'true')
  Object.assign(canvas.style, { position: 'fixed', inset: '0', width: '100vw', height: '100dvh', pointerEvents: 'none', zIndex: '50' })
  // Inside the app container (its own stacking context) so the footer can sit above it.
  const layer = slot.offsetParent ?? document.body
  layer.appendChild(canvas)

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 500)
  scene.add(new THREE.AmbientLight(0xffffff, 0.2))
  const fill = new THREE.PointLight(0xff3399, 6, 0, 0)
  scene.add(fill)

  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, 0, 0) })
  // Floor at the bottom of the viewport plus side walls, so dropped letters pile up on screen.
  const bounds = (normal: CANNON.Vec3) => {
    const body = new CANNON.Body({ type: CANNON.Body.STATIC, shape: new CANNON.Plane() })
    body.quaternion.setFromVectors(new CANNON.Vec3(0, 0, 1), normal)
    world.addBody(body)
    return body
  }
  const floor = bounds(new CANNON.Vec3(0, 1, 0))
  const leftWall = bounds(new CANNON.Vec3(1, 0, 0))
  const rightWall = bounds(new CANNON.Vec3(-1, 0, 0))

  const letters: Letter[] = []
  const shards: Shard[] = []
  const shardMaterial = DEAD_TUBE.clone()
  shardMaterial.color.set(0x5a2a7a)
  let textWidth = 1

  // Camera framing: world units per CSS pixel chosen so the sign fills the header slot; the rest of
  // the viewport maps to the same scale so the floor sits at the bottom of the page.
  const fit = () => {
    const w = innerWidth
    const h = innerHeight
    const r = slot.getBoundingClientRect()
    if (!w || !h || !r.width || !r.height) return
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    const perPx = Math.max(textWidth / (r.width * 0.96), (SIZE * 1.5) / r.height)
    const distance = (perPx * h) / 2 / Math.tan(THREE.MathUtils.degToRad(FOV / 2))
    camera.position.set(0, 0, distance)
    camera.updateProjectionMatrix()
    fill.position.set(0, 0, distance * 0.3)

    const toWorld = (x: number, y: number) => [(x - w / 2) * perPx, -(y - h / 2) * perPx]
    const [cx, cy] = toWorld(r.left + r.width / 2, r.top + r.height / 2)
    for (const l of letters) l.home.set(cx + l.slot, cy, 0)
    floor.position.set(0, -(h / 2) * perPx, 0)
    leftWall.position.set(-(w / 2) * perPx, 0, 0)
    rightWall.position.set((w / 2) * perPx, 0, 0)
  }
  addEventListener('resize', fit)
  const resize = new ResizeObserver(fit)
  resize.observe(slot)

  let disposed = false
  new FontLoader().load(FONT_URL, font => {
    if (disposed) return
    const advance = ((font.data.glyphs['M']?.ha ?? 834) / font.data.resolution) * SIZE * LETTER_SPACING
    const glyphs = [...text.toUpperCase()]
    textWidth = advance * glyphs.length
    glyphs.forEach((ch, i) => {
      if (ch === ' ') return
      const glow: Glow = { core: new THREE.MeshBasicMaterial(), halos: HALOS.map(([, o]) => haloMaterial(o)) }
      setGlow(glow, 1)
      const { mesh, size } = buildLetter(font, ch, glow)
      scene.add(mesh)
      const body = new CANNON.Body({ mass: 1, linearDamping: 0.2, angularDamping: 0.5 })
      body.addShape(new CANNON.Box(new CANNON.Vec3(size.x / 2, size.y / 2, size.z / 2)))
      world.addBody(body)
      const letter: Letter = { mesh, body, slot: -textWidth / 2 + advance * (i + 0.5), home: new CANNON.Vec3(), glow, stage: 'sign', stageAt: 0 }
      letters.push(letter)
      // A letter on the floor hit by any still-falling letter is queued to shatter (after the step).
      body.addEventListener('collide', (e: { body: CANNON.Body }) => {
        if (letter.stage === 'fallen' && e.body === floor) letter.settled = true
        const other = letters.find(l => l.body === e.body)
        if (letter.settled && other && !other.settled && other.stage === 'fallen') letter.shatter = true
      })
    })
    fit()
    for (const { body, home } of letters) {
      if (reducedMotion) body.position.copy(home)
      else {
        body.position.set(home.x + (Math.random() - 0.5) * 3, home.y + 4 + Math.random() * 6, (Math.random() - 0.5) * 4)
        body.quaternion.setFromEuler(Math.random() * 3, Math.random() * 3, Math.random() * 3)
      }
    }
  })

  // Hovering a letter still on the sign starts its loosening sequence, or runs it faster if it has
  // already started. Fallen letters ignore the pointer. Listens on the window because the overlay
  // ignores pointer events so the page underneath stays usable.
  const ray = new THREE.Raycaster()
  const ndc = new THREE.Vector2()
  let hovered: Letter | undefined
  const onPointer = (e: PointerEvent) => {
    if (reducedMotion) return
    ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1)
    ray.setFromCamera(ndc, camera)
    const onSign = letters.filter(l => l.stage !== 'fallen')
    const hit = ray.intersectObjects(onSign.map(l => l.mesh), false)[0]
    hovered = hit && onSign.find(l => l.mesh === hit.object)
    if (hovered?.stage === 'sign') Object.assign(hovered, { stage: 'wobble', stageAt: elapsed })
  }
  const onLeave = () => (hovered = undefined)
  addEventListener('pointermove', onPointer)
  document.documentElement.addEventListener('pointerleave', onLeave)

  // Every LOOSE_EVERY_MS of animation time, start loosening a random letter still on the sign.
  // Runs on animation time so it pauses with rendering (e.g. hidden tab) instead of piling up.
  let elapsed = 0
  const loosen = (prev: number, now: number) => {
    if (reducedMotion || Math.floor(now / LOOSE_EVERY_MS) === Math.floor(prev / LOOSE_EVERY_MS)) return
    const onSign = letters.filter(l => l.stage === 'sign')
    const letter = onSign[Math.floor(Math.random() * onSign.length)]
    if (letter) Object.assign(letter, { stage: 'wobble', stageAt: now })
  }

  // Replaces a letter with small glass shards that burst out, fall, and fade.
  const shatter = (letter: Letter) => {
    letters.splice(letters.indexOf(letter), 1)
    world.removeBody(letter.body)
    scene.remove(letter.mesh)
    letter.mesh.traverse(o => (o as THREE.Mesh).geometry?.dispose())
    letter.glow.core.dispose()
    letter.glow.halos.forEach(m => m.dispose())
    const box = new THREE.Box3().setFromObject(letter.mesh)
    const size = box.getSize(new THREE.Vector3())
    for (let i = 0; i < SHARDS; i++) {
      const mesh = new THREE.Mesh(new THREE.TetrahedronGeometry(0.05 + Math.random() * 0.1), shardMaterial)
      mesh.position.set(
        letter.mesh.position.x + (Math.random() - 0.5) * size.x,
        letter.mesh.position.y + (Math.random() - 0.5) * size.y,
        (Math.random() - 0.5) * 0.2,
      )
      scene.add(mesh)
      const vel = new THREE.Vector3((Math.random() - 0.5) * 6, 2 + Math.random() * 5, (Math.random() - 0.5) * 2)
      const spin = new THREE.Vector3(Math.random(), Math.random(), Math.random()).multiplyScalar(12)
      shards.push({ mesh, vel, spin, born: elapsed })
    }
  }

  const stepShards = (dt: number) => {
    const floorY = floor.position.y
    for (let i = shards.length - 1; i >= 0; i--) {
      const s = shards[i]
      const age = elapsed - s.born
      if (age >= SHARD_LIFE_MS) {
        scene.remove(s.mesh)
        s.mesh.geometry.dispose()
        shards.splice(i, 1)
        continue
      }
      s.vel.y -= GRAVITY * dt
      s.mesh.position.addScaledVector(s.vel, dt)
      if (s.mesh.position.y < floorY) {
        s.mesh.position.y = floorY
        s.vel.y *= -0.3
        s.vel.x *= 0.6
      }
      s.mesh.rotation.x += s.spin.x * dt
      s.mesh.rotation.y += s.spin.y * dt
      s.mesh.rotation.z += s.spin.z * dt
      s.mesh.scale.setScalar(1 - Math.max(0, age - SHARD_LIFE_MS * 0.6) / (SHARD_LIFE_MS * 0.4))
    }
  }

  const toHome = new CANNON.Vec3()
  const axis = new CANNON.Vec3()
  const step = (dt: number, t: number) => {
    for (const letter of letters) {
      const { body, home } = letter
      // Hovered: the loosening sequence runs HOVER_SPEEDUP times faster.
      if (letter === hovered && (letter.stage === 'wobble' || letter.stage === 'shake')) letter.stageAt -= dt * 1000 * (HOVER_SPEEDUP - 1)
      const since = elapsed - letter.stageAt
      if (letter.stage === 'wobble' && since >= LOOSE_STEP_MS) Object.assign(letter, { stage: 'shake', stageAt: elapsed })
      else if (letter.stage === 'shake' && since >= LOOSE_STEP_MS) {
        Object.assign(letter, { stage: 'fallen', stageAt: elapsed })
        // Fall and pile in the page plane: slide in x/y, spin only around the view axis.
        body.linearFactor.set(1, 1, 0)
        body.angularFactor.set(0, 0, 1)
        body.velocity.z = 0
        body.position.z = 0
        body.angularVelocity.set(0, 0, body.angularVelocity.z + (Math.random() - 0.5) * 4)
      }

      if (letter.stage === 'fallen') {
        body.applyForce(new CANNON.Vec3(0, -GRAVITY * body.mass, 0))
        continue
      }
      home.vsub(body.position, toHome)
      body.applyForce(toHome.scale(SPRING_K).vsub(body.velocity.scale(SPRING_DAMP)))
      // Upright torque toward identity rotation.
      const q = body.quaternion
      const sign = q.w < 0 ? -1 : 1
      axis.set(q.x * sign, q.y * sign, q.z * sign)
      body.torque.vadd(axis.scale(-UPRIGHT_K).vsub(body.angularVelocity.scale(1.5)), body.torque)
      // Loose letter: rock around the view axis (angle amplitude = WOBBLE_*), overriding the upright pull.
      if (letter.stage !== 'sign') {
        const omega = 2 * Math.PI * WOBBLE_HZ
        const amp = letter.stage === 'wobble' ? WOBBLE_SMALL : WOBBLE_BIG
        body.angularVelocity.z = amp * omega * Math.cos((omega * (elapsed - letter.stageAt)) / 1000)
      }
    }
    world.step(1 / 60, dt, 3)
    for (const letter of letters.filter(l => l.shatter)) shatter(letter)
    stepShards(dt)
    for (const { mesh, body, glow, stage, stageAt } of letters) {
      mesh.position.set(body.position.x, body.position.y, body.position.z)
      mesh.quaternion.set(body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w)
      // Neon tube hum, with a rare brief flicker per letter.
      if (stage === 'fallen') {
        const since = elapsed - stageAt
        if (since >= SPUTTER_MS) {
          if (!mesh.userData.dark) goDark(mesh, glow)
        } else setGlow(glow, Math.random() < 0.5 ? 0.7 * (1 - since / SPUTTER_MS) : DEAD_GLOW)
      } else setGlow(glow, !reducedMotion && Math.random() < 0.002 ? 0.15 : 1 + Math.sin(t * 3 + body.id) * 0.06)
    }
  }

  let last = performance.now()
  renderer.setAnimationLoop(now => {
    const dt = Math.min((now - last) / 1000, 0.1)
    last = now
    const prev = elapsed
    elapsed += dt * 1000
    loosen(prev, elapsed)
    step(dt, now / 1000)
    renderer.render(scene, camera)
  })

  return () => {
    disposed = true
    renderer.setAnimationLoop(null)
    resize.disconnect()
    removeEventListener('resize', fit)
    removeEventListener('pointermove', onPointer)
    document.documentElement.removeEventListener('pointerleave', onLeave)
    for (const { mesh, glow } of letters) {
      mesh.traverse(o => (o as THREE.Mesh).geometry?.dispose())
      glow.core.dispose()
      glow.halos.forEach(m => m.dispose())
    }
    shards.forEach(s => s.mesh.geometry.dispose())
    shardMaterial.dispose()
    renderer.dispose()
    canvas.remove()
  }
}
