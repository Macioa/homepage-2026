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
// wobbles, and can be knocked by the pointer, then settles back into the name.
const SPRING_K = 60
const SPRING_DAMP = 7
const UPRIGHT_K = 28

type Glow = { core: THREE.MeshBasicMaterial; halos: THREE.MeshBasicMaterial[] }
type Letter = { mesh: THREE.Mesh; body: CANNON.Body; home: CANNON.Vec3; glow: Glow }

const haloMaterial = (opacity: number) =>
  new THREE.MeshBasicMaterial({ color: NEON, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false })

// Sets a letter's brightness (1 = normal, near 0 = tube flickering off).
const setGlow = ({ core, halos }: Glow, level: number) => {
  core.color.copy(NEON).lerp(CORE, Math.min(level, 1) * 0.42)
  halos.forEach((m, i) => (m.opacity = HALOS[i][1] * level))
}

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

const backing = new THREE.MeshStandardMaterial({ color: 0x140b10, roughness: 0.6, metalness: 0.3 })

// Mounts an extruded neon rendering of `text` into `host`, refit to the host on resize. Returns cleanup.
export const mountNeonName = (host: HTMLElement, text: string) => {
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setClearColor(0x000000, 1)
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
  renderer.domElement.setAttribute('aria-hidden', 'true')
  host.appendChild(renderer.domElement)

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 200)
  scene.add(new THREE.AmbientLight(0xffffff, 0.2))
  const fill = new THREE.PointLight(0xff3399, 6, 30)
  fill.position.set(0, 0, 4)
  scene.add(fill)

  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, 0, 0) })
  const letters: Letter[] = []
  let textWidth = 1

  const fit = () => {
    const w = host.clientWidth
    const h = host.clientHeight
    if (!w || !h) return
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    const half = Math.tan(THREE.MathUtils.degToRad(FOV / 2))
    const byWidth = (textWidth * 0.52) / (half * camera.aspect)
    const byHeight = (SIZE * 0.75) / half
    camera.position.set(0, 0, Math.max(byWidth, byHeight) + DEPTH)
    camera.updateProjectionMatrix()
  }
  const resize = new ResizeObserver(fit)
  resize.observe(host)

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

      const home = new CANNON.Vec3(-textWidth / 2 + advance * (i + 0.5), 0, 0)
      const body = new CANNON.Body({ mass: 1, linearDamping: 0.2, angularDamping: 0.5 })
      body.addShape(new CANNON.Box(new CANNON.Vec3(size.x / 2, size.y / 2, size.z / 2)))
      if (reducedMotion) body.position.copy(home)
      else {
        body.position.set(home.x + (Math.random() - 0.5) * 3, home.y + 4 + Math.random() * 6, (Math.random() - 0.5) * 4)
        body.quaternion.setFromEuler(Math.random() * 3, Math.random() * 3, Math.random() * 3)
      }
      world.addBody(body)
      letters.push({ mesh, body, home, glow })
    })
    fit()
  })

  // Pointer knocks the letter under it along the view ray (harder on click/tap).
  const ray = new THREE.Raycaster()
  const ndc = new THREE.Vector2()
  const onPointer = (e: PointerEvent) => {
    if (reducedMotion) return
    const r = renderer.domElement.getBoundingClientRect()
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
    ray.setFromCamera(ndc, camera)
    const hit = ray.intersectObjects(letters.map(l => l.mesh), false)[0]
    const letter = hit && letters.find(l => l.mesh === hit.object)
    if (!letter) return
    const strength = e.type === 'pointerdown' ? 6 : 1.5
    const d = ray.ray.direction
    letter.body.applyImpulse(
      new CANNON.Vec3(d.x * strength, d.y * strength + strength * 0.3, d.z * strength),
      new CANNON.Vec3(hit.point.x, hit.point.y, hit.point.z)
    )
  }
  renderer.domElement.addEventListener('pointermove', onPointer)
  renderer.domElement.addEventListener('pointerdown', onPointer)

  const toHome = new CANNON.Vec3()
  const axis = new CANNON.Vec3()
  const step = (dt: number, t: number) => {
    for (const { body, home } of letters) {
      home.vsub(body.position, toHome)
      body.applyForce(toHome.scale(SPRING_K).vsub(body.velocity.scale(SPRING_DAMP)))
      // Upright torque toward identity rotation.
      const q = body.quaternion
      const sign = q.w < 0 ? -1 : 1
      axis.set(q.x * sign, q.y * sign, q.z * sign)
      body.torque.vadd(axis.scale(-UPRIGHT_K).vsub(body.angularVelocity.scale(1.5)), body.torque)
    }
    world.step(1 / 60, dt, 3)
    for (const { mesh, body, glow } of letters) {
      mesh.position.set(body.position.x, body.position.y, body.position.z)
      mesh.quaternion.set(body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w)
      // Neon tube hum, with a rare brief flicker per letter.
      setGlow(glow, !reducedMotion && Math.random() < 0.002 ? 0.15 : 1 + Math.sin(t * 3 + body.id) * 0.06)
    }
  }

  let last = performance.now()
  renderer.setAnimationLoop(now => {
    const dt = Math.min((now - last) / 1000, 0.1)
    last = now
    step(dt, now / 1000)
    renderer.render(scene, camera)
  })

  return () => {
    disposed = true
    renderer.setAnimationLoop(null)
    resize.disconnect()
    for (const { mesh, glow } of letters) {
      mesh.traverse(o => (o as THREE.Mesh).geometry?.dispose())
      glow.core.dispose()
      glow.halos.forEach(m => m.dispose())
    }
    renderer.dispose()
    renderer.domElement.remove()
  }
}
