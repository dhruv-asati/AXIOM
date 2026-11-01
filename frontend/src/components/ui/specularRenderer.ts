export type SpecularKind = 'button' | 'card'
export type SpecularOptions = {
  kind: SpecularKind
  shineSize?: number
  shineFade?: number
  thickness?: number
  glow?: number
  radius?: number
  tint?: string
  intensity?: number
}

type SurfaceRecord = { element: HTMLElement; options: SpecularOptions; visible: boolean; source: 'manual' | 'auto' }
type Uniforms = Record<string, WebGLUniformLocation | null>

const surfaces = new Map<HTMLElement, SurfaceRecord>()
const AUTO_SURFACE_SELECTOR = '.ops-stat, .ops-card, .ops-record-card, .workspace-card, .ops-toolbar, .ops-table-wrap, .ops-calendar-scroll, .ops-empty, .ops-message, .ops-callout, .section-placeholder, .ops-button, .button-primary, .login-submit'
const AUTO_CARD_SELECTOR = '.ops-stat, .ops-card, .ops-record-card, .workspace-card, .ops-toolbar, .ops-table-wrap, .ops-calendar-scroll, .ops-empty, .ops-message, .ops-callout, .section-placeholder'
const AUTO_BUTTON_SELECTOR = '.ops-button, .button-primary, .login-submit'
let canvasElement: HTMLCanvasElement | null = null
let context: WebGL2RenderingContext | null = null
let shaderProgram: WebGLProgram | null = null
let vertexBuffer: WebGLBuffer | null = null
let uniformLocations: Uniforms = {}
let intersectionObserver: IntersectionObserver | null = null
let resizeObserver: ResizeObserver | null = null
let animationFrame = 0
let pixelRatio = 1
let pointerX = -10000
let pointerY = -10000
let reducedMotion = false
let motionPreference: MediaQueryList | null = null

const vertexSource = `#version 300 es
in vec2 a_position;
void main() { gl_Position = vec4(a_position, 0.0, 1.0); }
`

const fragmentSource = `#version 300 es
precision highp float;
uniform vec4 u_rect;
uniform vec2 u_pointer;
uniform float u_radius;
uniform float u_thickness;
uniform float u_shine_size;
uniform float u_shine_fade;
uniform float u_glow;
uniform float u_proximity;
uniform float u_intensity;
uniform vec3 u_tint;
uniform float u_idle;
out vec4 outColor;
void main() {
  vec2 p = gl_FragCoord.xy - u_rect.xy;
  vec2 halfSize = u_rect.zw * 0.5;
  float radius = min(u_radius, min(halfSize.x, halfSize.y));
  vec2 q = abs(p - halfSize) - (halfSize - vec2(radius));
  float distanceToShape = length(max(q, vec2(0.0))) + min(max(q.x, q.y), 0.0) - radius;
  float edge = 1.0 - smoothstep(u_thickness - 0.7, u_thickness + 0.7, abs(distanceToShape));
  float fade = max(1.0, u_shine_fade);
  float edgeGlow = exp(-abs(distanceToShape) / fade) * u_glow;
  vec2 lightPoint = u_pointer;
  float dx = min(u_pointer.x, u_rect.z - u_pointer.x);
  float dy = min(u_pointer.y, u_rect.w - u_pointer.y);
  if (dx < dy) lightPoint.x = u_pointer.x < halfSize.x ? 0.0 : u_rect.z;
  else lightPoint.y = u_pointer.y < halfSize.y ? 0.0 : u_rect.w;
  float lightDistance = length(p - lightPoint);
  float highlight = exp(-pow(lightDistance / max(1.0, u_shine_size), 2.0) * 1.65);
  float alpha = edge * (u_idle + highlight * u_proximity * u_intensity) + edgeGlow * u_proximity * 0.075;
  alpha *= 1.0 - smoothstep(-0.5, 1.1, distanceToShape);
  outColor = vec4(u_tint, clamp(alpha, 0.0, 0.72));
}
`

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type)
  if (!shader) return null
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader)
    return null
  }
  return shader
}

function readTint(element: HTMLElement, tint?: string): [number, number, number] {
  const raw = (tint ?? getComputedStyle(element).getPropertyValue('--accent') ?? '#56616c').trim()
  const hex = raw.match(/^#([\da-f]{3}|[\da-f]{6})$/i)
  if (hex) {
    const digits = hex[1].length === 3 ? [...hex[1]].map((digit) => digit + digit).join('') : hex[1]
    return [0, 2, 4].map((offset) => Number.parseInt(digits.slice(offset, offset + 2), 16) / 255) as [number, number, number]
  }
  const rgb = raw.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i)
  if (rgb) return [Number(rgb[1]) / 255, Number(rgb[2]) / 255, Number(rgb[3]) / 255]
  return [0.34, 0.38, 0.42]
}

function markFallback(record: SurfaceRecord, enabled: boolean) {
  if (enabled) record.element.dataset.specularFallback = 'true'
  else delete record.element.dataset.specularFallback
}

function requestRender() {
  if (!context || animationFrame || document.hidden) return
  animationFrame = window.requestAnimationFrame(() => {
    try { render() } catch { activateCssFallback() }
  })
}

function resizeCanvas() {
  if (!canvasElement || !context) return
  pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5)
  const width = Math.max(1, Math.round(window.innerWidth * pixelRatio))
  const height = Math.max(1, Math.round(window.innerHeight * pixelRatio))
  if (canvasElement.width !== width || canvasElement.height !== height) {
    canvasElement.width = width
    canvasElement.height = height
  }
  canvasElement.style.width = `${window.innerWidth}px`
  canvasElement.style.height = `${window.innerHeight}px`
  context.viewport(0, 0, width, height)
  context.clearColor(0, 0, 0, 0)
  context.clear(context.COLOR_BUFFER_BIT)
  requestRender()
}

function rectDistance(x: number, y: number, rect: DOMRect) {
  const dx = Math.max(rect.left - x, 0, x - rect.right)
  const dy = Math.max(rect.top - y, 0, y - rect.bottom)
  return Math.hypot(dx, dy)
}

function render() {
  animationFrame = 0
  if (!context || !canvasElement || !shaderProgram || document.hidden) return
  const gl = context
  gl.clearColor(0, 0, 0, 0)
  gl.clear(gl.COLOR_BUFFER_BIT)
  gl.enable(gl.BLEND)
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
  gl.useProgram(shaderProgram)
  const position = gl.getAttribLocation(shaderProgram, 'a_position')
  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer)
  gl.enableVertexAttribArray(position)
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)
  const viewHeight = canvasElement.height
  const uniform = (name: string) => uniformLocations[name] ?? null

  for (const record of surfaces.values()) {
    if (!record.visible || !record.element.isConnected) continue
    const rect = record.element.getBoundingClientRect()
    if (rect.width < 2 || rect.height < 2 || rect.bottom < 0 || rect.top > innerHeight || rect.right < 0 || rect.left > innerWidth) continue
    const options = record.options
    const distance = rectDistance(pointerX, pointerY, rect)
    const shineSize = options.shineSize ?? (options.kind === 'button' ? 145 : 190)
    const proximity = Math.max(0, 1 - distance / shineSize)
    const localX = (pointerX - rect.left) * pixelRatio
    const localY = (rect.bottom - pointerY) * pixelRatio
    const radius = options.radius ?? (Number.parseFloat(getComputedStyle(record.element).borderTopLeftRadius) || 10)
    const scale = pixelRatio
    gl.uniform4f(uniform('u_rect'), rect.left * scale, viewHeight - rect.bottom * scale, rect.width * scale, rect.height * scale)
    gl.uniform2f(uniform('u_pointer'), localX, localY)
    gl.uniform1f(uniform('u_radius'), radius * scale)
    gl.uniform1f(uniform('u_thickness'), (options.thickness ?? (options.kind === 'button' ? 1.8 : 1.05)) * scale)
    gl.uniform1f(uniform('u_shine_size'), shineSize * scale)
    gl.uniform1f(uniform('u_shine_fade'), (options.shineFade ?? 22) * scale)
    gl.uniform1f(uniform('u_glow'), options.glow ?? (options.kind === 'button' ? 0.16 : 0.065))
    gl.uniform1f(uniform('u_proximity'), proximity)
    gl.uniform1f(uniform('u_intensity'), options.intensity ?? (options.kind === 'button' ? 0.48 : 0.2))
    gl.uniform3fv(uniform('u_tint'), readTint(record.element, options.tint))
    gl.uniform1f(uniform('u_idle'), reducedMotion ? 0.045 : (options.kind === 'button' ? 0.05 : 0.028))
    const x = Math.max(0, Math.floor(rect.left * scale))
    const y = Math.max(0, Math.floor(viewHeight - rect.bottom * scale))
    gl.enable(gl.SCISSOR_TEST)
    gl.scissor(x, y, Math.ceil(rect.width * scale), Math.ceil(rect.height * scale))
    gl.drawArrays(gl.TRIANGLES, 0, 6)
  }
  gl.disable(gl.SCISSOR_TEST)
  canvasElement.style.visibility = 'visible'
}

function onPointerMove(event: PointerEvent) {
  if (event.pointerType === 'touch') return
  pointerX = event.clientX
  pointerY = event.clientY
  for (const record of surfaces.values()) {
    const rect = record.element.getBoundingClientRect()
    const distance = rectDistance(pointerX, pointerY, rect)
    const near = distance <= (record.options.shineSize ?? 190)
    record.element.style.setProperty('--specular-x', `${Math.min(100, Math.max(0, (pointerX - rect.left) / Math.max(1, rect.width) * 100))}%`)
    record.element.style.setProperty('--specular-y', `${Math.min(100, Math.max(0, (pointerY - rect.top) / Math.max(1, rect.height) * 100))}%`)
    record.element.dataset.specularNear = near ? 'true' : 'false'
  }
  requestRender()
}

function onVisibilityChange() {
  if (document.hidden) {
    if (animationFrame) cancelAnimationFrame(animationFrame)
    animationFrame = 0
  } else requestRender()
}

function onWindowResize() { resizeCanvas() }
function onWindowScroll() { requestRender() }
function onWebGLContextLost(event: Event) {
  event.preventDefault()
  if (animationFrame) cancelAnimationFrame(animationFrame)
  animationFrame = 0
  context = null
  shaderProgram = null
  vertexBuffer = null
  if (canvasElement) canvasElement.style.visibility = 'hidden'
  for (const record of surfaces.values()) markFallback(record, true)
}
function onWebGLContextRestored() {
  if (canvasElement) initializeRenderer(canvasElement)
}
function onMotionPreferenceChange(event: MediaQueryListEvent) {
  reducedMotion = event.matches
  requestRender()
}

function startObservers() {
  if (typeof IntersectionObserver !== 'undefined') {
    intersectionObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const record = surfaces.get(entry.target as HTMLElement)
        if (record) record.visible = entry.isIntersecting
      }
      requestRender()
    }, { rootMargin: '40px' })
  }
  if (typeof ResizeObserver !== 'undefined') resizeObserver = new ResizeObserver(requestRender)
  for (const record of surfaces.values()) {
    intersectionObserver?.observe(record.element)
    resizeObserver?.observe(record.element)
    markFallback(record, !context)
  }
}

function stopObservers() {
  intersectionObserver?.disconnect()
  resizeObserver?.disconnect()
  intersectionObserver = null
  resizeObserver = null
}

function releaseRenderer() {
  if (animationFrame) cancelAnimationFrame(animationFrame)
  animationFrame = 0
  stopObservers()
  document.removeEventListener('pointermove', onPointerMove)
  document.removeEventListener('visibilitychange', onVisibilityChange)
  window.removeEventListener('resize', onWindowResize)
  window.removeEventListener('scroll', onWindowScroll, true)
  motionPreference?.removeEventListener('change', onMotionPreferenceChange)
  motionPreference = null
  canvasElement?.removeEventListener('webglcontextlost', onWebGLContextLost)
  canvasElement?.removeEventListener('webglcontextrestored', onWebGLContextRestored)
  if (context) {
    if (shaderProgram) context.deleteProgram(shaderProgram)
    if (vertexBuffer) context.deleteBuffer(vertexBuffer)
    context.getExtension('WEBGL_lose_context')?.loseContext()
  }
  context = null
  shaderProgram = null
  vertexBuffer = null
  uniformLocations = {}
  for (const record of surfaces.values()) markFallback(record, true)
}

function activateCssFallback() {
  const canvas = canvasElement
  if (animationFrame) cancelAnimationFrame(animationFrame)
  animationFrame = 0
  stopObservers()
  document.removeEventListener('visibilitychange', onVisibilityChange)
  window.removeEventListener('resize', onWindowResize)
  window.removeEventListener('scroll', onWindowScroll, true)
  motionPreference?.removeEventListener('change', onMotionPreferenceChange)
  motionPreference = null
  canvas?.removeEventListener('webglcontextlost', onWebGLContextLost)
  canvas?.removeEventListener('webglcontextrestored', onWebGLContextRestored)
  if (context) {
    try {
      if (shaderProgram) context.deleteProgram(shaderProgram)
      if (vertexBuffer) context.deleteBuffer(vertexBuffer)
      context.getExtension('WEBGL_lose_context')?.loseContext()
    } catch {
      // The context can already be lost; the CSS fallback is still available.
    }
  }
  context = null
  shaderProgram = null
  vertexBuffer = null
  uniformLocations = {}
  if (canvas) canvas.style.visibility = 'hidden'
  for (const record of surfaces.values()) markFallback(record, true)
}

function initializeRenderer(canvas: HTMLCanvasElement) {
  releaseRenderer()
  canvasElement = canvas
  canvas.style.visibility = 'hidden'
  canvas.addEventListener('webglcontextlost', onWebGLContextLost)
  canvas.addEventListener('webglcontextrestored', onWebGLContextRestored)
  document.addEventListener('pointermove', onPointerMove, { passive: true })
  const gl = canvas.getContext('webgl2', { alpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: true })
  if (!gl) {
    canvas.style.visibility = 'hidden'
    for (const record of surfaces.values()) markFallback(record, true)
    return
  }
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexSource)
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource)
  const program = gl.createProgram()
  if (!vertexShader || !fragmentShader || !program) {
    if (vertexShader) gl.deleteShader(vertexShader)
    if (fragmentShader) gl.deleteShader(fragmentShader)
    if (program) gl.deleteProgram(program)
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    for (const record of surfaces.values()) markFallback(record, true)
    return
  }
  gl.attachShader(program, vertexShader)
  gl.attachShader(program, fragmentShader)
  gl.linkProgram(program)
  gl.deleteShader(vertexShader)
  gl.deleteShader(fragmentShader)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program)
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    for (const record of surfaces.values()) markFallback(record, true)
    return
  }
  const buffer = gl.createBuffer()
  if (!buffer) {
    gl.deleteProgram(program)
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    for (const record of surfaces.values()) markFallback(record, true)
    return
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
  context = gl
  shaderProgram = program
  vertexBuffer = buffer
  for (const name of ['u_rect', 'u_pointer', 'u_radius', 'u_thickness', 'u_shine_size', 'u_shine_fade', 'u_glow', 'u_proximity', 'u_intensity', 'u_tint', 'u_idle']) {
    uniformLocations[name] = gl.getUniformLocation(program, name)
  }
  for (const record of surfaces.values()) markFallback(record, false)
  startObservers()
  motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)')
  reducedMotion = motionPreference.matches
  motionPreference.addEventListener('change', onMotionPreferenceChange)
  document.addEventListener('pointermove', onPointerMove, { passive: true })
  document.addEventListener('visibilitychange', onVisibilityChange)
  window.addEventListener('resize', onWindowResize, { passive: true })
  window.addEventListener('scroll', onWindowScroll, { passive: true, capture: true })
  resizeCanvas()
}

export function attachSpecularCanvas(canvas: HTMLCanvasElement): () => void {
  try {
    initializeRenderer(canvas)
  } catch {
    activateCssFallback()
    canvasElement = canvas
    document.addEventListener('pointermove', onPointerMove, { passive: true })
    for (const record of surfaces.values()) markFallback(record, true)
  }
  return () => {
    if (canvasElement === canvas) {
      try { releaseRenderer() } catch { /* Optional lighting must not affect route cleanup. */ }
      canvasElement = null
      canvas.style.removeProperty('visibility')
    }
  }
}

export function registerSpecularSurface(element: HTMLElement, options: SpecularOptions, source: 'manual' | 'auto' = 'manual') {
  const existing = surfaces.get(element)
  if (existing && existing.source === 'manual' && source === 'auto') return () => undefined
  if (existing) {
    existing.options = options
    existing.source = source
    return () => unregisterSpecularSurface(element, source)
  }
  const record: SurfaceRecord = { element, options, visible: true, source }
  surfaces.set(element, record)
  markFallback(record, !context)
  intersectionObserver?.observe(element)
  resizeObserver?.observe(element)
  return () => unregisterSpecularSurface(element, source)
}

function unregisterSpecularSurface(element: HTMLElement, source: 'manual' | 'auto') {
  const record = surfaces.get(element)
  if (!record || record.source !== source) return
  intersectionObserver?.unobserve(element)
  resizeObserver?.unobserve(element)
  surfaces.delete(element)
  delete element.dataset.specularFallback
  delete element.dataset.specularNear
  element.style.removeProperty('--specular-x')
  element.style.removeProperty('--specular-y')
  requestRender()
}

export function observeSpecularSurfaces(root: HTMLElement): () => void {
  const autoTargets = new Set<HTMLElement>()
  const registerAuto = (element: HTMLElement) => {
    if (element.hasAttribute('data-specular-manual')) return
    if (AUTO_CARD_SELECTOR.split(', ').some((selector) => element.matches(selector) && element.parentElement?.closest(AUTO_CARD_SELECTOR))) return
    const kind: SpecularKind = element.matches(AUTO_BUTTON_SELECTOR) ? 'button' : 'card'
    autoTargets.add(element)
    registerSpecularSurface(element, {
      kind,
      shineSize: kind === 'button' ? 135 : 185,
      shineFade: kind === 'button' ? 18 : 24,
      thickness: kind === 'button' ? 1.65 : 0.95,
      glow: kind === 'button' ? 0.14 : 0.055,
      intensity: kind === 'button' ? 0.43 : 0.18,
    }, 'auto')
  }
  const scan = (node: ParentNode) => {
    if (node instanceof HTMLElement && node.matches(AUTO_SURFACE_SELECTOR)) registerAuto(node)
    node.querySelectorAll<HTMLElement>(AUTO_SURFACE_SELECTOR).forEach(registerAuto)
  }
  scan(root)
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach((node) => { if (node instanceof HTMLElement) scan(node) })
      mutation.removedNodes.forEach((node) => {
        if (!(node instanceof HTMLElement)) return
        for (const element of [...autoTargets]) {
          if (element === node || node.contains(element)) {
            autoTargets.delete(element)
            unregisterSpecularSurface(element, 'auto')
          }
        }
      })
    }
  })
  observer.observe(root, { childList: true, subtree: true })
  return () => {
    observer.disconnect()
    for (const element of autoTargets) unregisterSpecularSurface(element, 'auto')
    autoTargets.clear()
  }
}
