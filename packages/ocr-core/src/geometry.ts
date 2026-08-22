export type Rotation = 0 | 90 | 180 | 270

export interface PixelSize { width: number; height: number }
export interface PixelRect { x: number; y: number; width: number; height: number }
export interface ProcessedImageTransform {
  schemaVersion: 'IMAGE_TRANSFORM_V1'
  sourceSize: PixelSize
  normalizedSize: PixelSize
  rotation: Rotation
  crop: PixelRect | null
  redactions: readonly PixelRect[]
  processedSize: PixelSize
}

interface ParsedTransform {
  sourceSize: PixelSize
  normalizedSize: PixelSize
  rotation: Rotation
  crop: PixelRect | null
  redactions: PixelRect[]
  processedSize: PixelSize
}

const IMAGE_TRANSFORM_SCHEMA_VERSION = 'IMAGE_TRANSFORM_V1' as const
// This bounds synchronous metadata parsing work; it does not change image geometry semantics.
const MAX_REDACTION_COUNT = 4_096

export class OcrCoreValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'OcrCoreValidationError'
  }
}

function fail(message: string): never {
  throw new OcrCoreValidationError(message)
}

function throwValidationError(error: unknown): never {
  if (error instanceof OcrCoreValidationError) throw error
  throw new OcrCoreValidationError('Invalid OCR geometry input')
}

function assertPlainDataRecord(value: unknown, label: string): asserts value is object {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail(`${label} must be a plain data record`)
  }
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) {
    fail(`${label} must be a plain data record`)
  }
}

function readOwnDataProperty(record: object, key: string, label: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(record, key)
  if (descriptor === undefined || !Object.hasOwn(descriptor, 'value')) {
    fail(`${label}.${key} must be an own data property`)
  }
  const observedValue = Reflect.get(record, key)
  if (!Object.is(observedValue, descriptor.value)) {
    fail(`${label}.${key} changed while being validated`)
  }
  return descriptor.value
}

function readFiniteNumber(record: object, key: string, label: string): number {
  const value = readOwnDataProperty(record, key, label)
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail(`${label}.${key} must be a finite number`)
  }
  return value
}

function parsePixelSize(value: unknown, label: string): PixelSize {
  assertPlainDataRecord(value, label)
  const width = readFiniteNumber(value, 'width', label)
  const height = readFiniteNumber(value, 'height', label)
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    fail(`${label} dimensions must be positive integers`)
  }
  return { width, height }
}

function parsePixelRect(value: unknown, label: string): PixelRect {
  assertPlainDataRecord(value, label)
  const x = readFiniteNumber(value, 'x', label)
  const y = readFiniteNumber(value, 'y', label)
  const width = readFiniteNumber(value, 'width', label)
  const height = readFiniteNumber(value, 'height', label)
  const rect = { x, y, width, height }
  assertValidPixelRectValues(rect, label)
  return rect
}

function assertValidPixelRectValues(rect: PixelRect, label: string): void {
  if (
    !Number.isFinite(rect.x) || !Number.isFinite(rect.y) || !Number.isFinite(rect.width) || !Number.isFinite(rect.height)
    || rect.x < 0 || rect.y < 0 || rect.width <= 0 || rect.height <= 0
  ) {
    fail(`${label} must have non-negative coordinates and positive dimensions`)
  }
  const right = rect.x + rect.width
  const bottom = rect.y + rect.height
  if (!Number.isFinite(right) || !Number.isFinite(bottom) || right <= rect.x || bottom <= rect.y) {
    fail(`${label} must have representable positive dimensions`)
  }
}

function parseIntegerCrop(value: unknown): PixelRect {
  const crop = parsePixelRect(value, 'crop')
  if (!Number.isInteger(crop.x) || !Number.isInteger(crop.y) || !Number.isInteger(crop.width) || !Number.isInteger(crop.height)) {
    fail('crop coordinates and dimensions must be integers')
  }
  return crop
}

function parseRotation(value: unknown): Rotation {
  if (value !== 0 && value !== 90 && value !== 180 && value !== 270) {
    fail('rotation must be one of 0, 90, 180, or 270')
  }
  return value
}

function parseRedactions(value: unknown): PixelRect[] {
  if (!Array.isArray(value)) fail('redactions must be an array')
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length')
  if (lengthDescriptor === undefined || !Object.hasOwn(lengthDescriptor, 'value')) {
    fail('redactions.length must be an own data property')
  }
  const length = lengthDescriptor.value
  if (typeof length !== 'number' || !Number.isSafeInteger(length) || length < 0) {
    fail('redactions.length must be a non-negative safe integer')
  }
  if (length > MAX_REDACTION_COUNT) {
    fail(`redactions.length must not exceed ${MAX_REDACTION_COUNT}`)
  }

  const redactions: PixelRect[] = []
  for (let index = 0; index < length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index))
    if (descriptor === undefined || !Object.hasOwn(descriptor, 'value')) {
      fail(`redactions[${index}] must be an own data property`)
    }
    redactions.push(parsePixelRect(descriptor.value, 'redaction'))
  }
  return redactions
}

function parseTransform(value: unknown): ParsedTransform {
  assertPlainDataRecord(value, 'transform')
  if (readOwnDataProperty(value, 'schemaVersion', 'transform') !== IMAGE_TRANSFORM_SCHEMA_VERSION) {
    fail('schemaVersion must be IMAGE_TRANSFORM_V1')
  }
  const sourceSize = parsePixelSize(readOwnDataProperty(value, 'sourceSize', 'transform'), 'sourceSize')
  const normalizedSize = parsePixelSize(readOwnDataProperty(value, 'normalizedSize', 'transform'), 'normalizedSize')
  const rotation = parseRotation(readOwnDataProperty(value, 'rotation', 'transform'))
  const rawCrop = readOwnDataProperty(value, 'crop', 'transform')
  const crop = rawCrop === null ? null : parseIntegerCrop(rawCrop)
  const rawRedactions = readOwnDataProperty(value, 'redactions', 'transform')
  const redactions = parseRedactions(rawRedactions)
  const processedSize = parsePixelSize(readOwnDataProperty(value, 'processedSize', 'transform'), 'processedSize')
  return { sourceSize, normalizedSize, rotation, crop, redactions, processedSize }
}

function validateParsedTransform(parsedTransform: ParsedTransform): void {
  const fullRotatedSize = rotatedSize(parsedTransform.normalizedSize, parsedTransform.rotation)
  const fullRotatedBounds: PixelRect = { x: 0, y: 0, ...fullRotatedSize }
  if (parsedTransform.crop !== null) assertContainedInRect(parsedTransform.crop, fullRotatedBounds, 'crop')
  const effectiveBounds = parsedTransform.crop ?? fullRotatedBounds
  for (const redaction of parsedTransform.redactions) {
    assertContainedInRect(redaction, fullRotatedBounds, 'redaction')
    assertContainedInRect(redaction, effectiveBounds, 'redaction')
  }
  validateProcessedSize({ width: effectiveBounds.width, height: effectiveBounds.height }, parsedTransform.processedSize)
}

function assertContainedInSize(rect: PixelRect, size: PixelSize, label: string): void {
  const right = rect.x + rect.width
  const bottom = rect.y + rect.height
  if (!Number.isFinite(right) || !Number.isFinite(bottom) || right > size.width || bottom > size.height) {
    fail(`${label} must be fully contained in its bounds`)
  }
}

function assertContainedInRect(rect: PixelRect, bounds: PixelRect, label: string): void {
  const right = rect.x + rect.width
  const bottom = rect.y + rect.height
  const boundsRight = bounds.x + bounds.width
  const boundsBottom = bounds.y + bounds.height
  if (
    !Number.isFinite(right) || !Number.isFinite(bottom) || !Number.isFinite(boundsRight) || !Number.isFinite(boundsBottom)
    || rect.x < bounds.x || rect.y < bounds.y || right > boundsRight || bottom > boundsBottom
  ) fail(`${label} must be fully contained in its bounds`)
}

function rotatedSize(size: PixelSize, rotation: Rotation): PixelSize {
  return rotation === 90 || rotation === 270
    ? { width: size.height, height: size.width }
    : { width: size.width, height: size.height }
}

function rotateBoundingBox(box: PixelRect, normalizedSize: PixelSize, rotation: Rotation): PixelRect {
  switch (rotation) {
    case 0: return { ...box }
    case 90: return { x: normalizedSize.height - box.y - box.height, y: box.x, width: box.height, height: box.width }
    case 180: return { x: normalizedSize.width - box.x - box.width, y: normalizedSize.height - box.y - box.height, width: box.width, height: box.height }
    case 270: return { x: box.y, y: normalizedSize.width - box.x - box.width, width: box.height, height: box.width }
  }
}

function validateProcessedSize(effectiveSize: PixelSize, processedSize: PixelSize): void {
  const longestIsWidth = effectiveSize.width >= effectiveSize.height
  const originalLongest = longestIsWidth ? effectiveSize.width : effectiveSize.height
  const originalOther = longestIsWidth ? effectiveSize.height : effectiveSize.width
  const processedLongest = longestIsWidth ? processedSize.width : processedSize.height
  const processedOther = longestIsWidth ? processedSize.height : processedSize.width
  if (processedSize.width > effectiveSize.width || processedSize.height > effectiveSize.height || processedLongest > originalLongest) {
    fail('processedSize must not enlarge the effective image')
  }
  if (processedLongest === originalLongest) {
    if (processedSize.width !== effectiveSize.width || processedSize.height !== effectiveSize.height) {
      fail('unchanged processedSize must equal the effective image size')
    }
    return
  }
  const ratio = processedLongest / originalLongest
  if (!Number.isFinite(ratio) || ratio <= 0 || ratio >= 1) {
    fail('processedSize scale ratio must be finite and within (0, 1)')
  }
  const expectedOther = Math.max(1, Math.round(originalOther * ratio))
  if (!Number.isFinite(expectedOther) || !Number.isInteger(expectedOther) || expectedOther <= 0) {
    fail('processedSize scaled short edge must be a finite positive integer')
  }
  if (processedLongest >= originalLongest || processedOther !== expectedOther) {
    fail('processedSize must use deterministic longest-edge scaling')
  }
}

function scaleLocalEdge(localEdge: number, effectiveLength: number, processedLength: number): number {
  if (localEdge === 0) return 0
  if (localEdge === effectiveLength) return processedLength
  const scale = processedLength / effectiveLength
  if (!Number.isFinite(scale) || scale <= 0 || scale > 1) {
    fail('local edge scale must be finite and within (0, 1]')
  }
  const scaledEdge = localEdge * scale
  if (!Number.isFinite(scaledEdge)) {
    fail('scaled local edge must be finite')
  }
  return scaledEdge
}

function scaleToLongestEdgeInternal(size: PixelSize, maxEdge: number): { processedSize: PixelSize; scaleX: number; scaleY: number } {
  const longestIsWidth = size.width >= size.height
  const longest = longestIsWidth ? size.width : size.height
  if (longest <= maxEdge) return { processedSize: { ...size }, scaleX: 1, scaleY: 1 }
  const other = longestIsWidth ? size.height : size.width
  const ratio = maxEdge / longest
  if (!Number.isFinite(ratio) || ratio <= 0 || ratio >= 1) {
    fail('longest-edge scale ratio must be finite and within (0, 1)')
  }
  const scaledOther = Math.max(1, Math.round(other * ratio))
  if (!Number.isFinite(scaledOther) || !Number.isInteger(scaledOther) || scaledOther <= 0) {
    fail('scaled short edge must be a finite positive integer')
  }
  const processedSize = longestIsWidth ? { width: maxEdge, height: scaledOther } : { width: scaledOther, height: maxEdge }
  const scaleX = processedSize.width / size.width
  const scaleY = processedSize.height / size.height
  if (
    !Number.isFinite(processedSize.width) || !Number.isFinite(processedSize.height)
    || !Number.isFinite(scaleX) || !Number.isFinite(scaleY)
    || scaleX <= 0 || scaleY <= 0 || scaleX > 1 || scaleY > 1
  ) {
    fail('longest-edge scaling must produce finite non-enlarging dimensions')
  }
  return { processedSize, scaleX, scaleY }
}

function validateProcessedBoundingBoxInternal(box: PixelRect, processedSize: PixelSize): void {
  assertValidPixelRectValues(box, 'processed bounding box')
  assertContainedInSize(box, processedSize, 'processed bounding box')
}

export function scaleToLongestEdge(size: PixelSize, maxEdge: number): { processedSize: PixelSize; scaleX: number; scaleY: number } {
  try {
    const parsedSize = parsePixelSize(size, 'size')
    if (typeof maxEdge !== 'number' || !Number.isFinite(maxEdge) || !Number.isInteger(maxEdge) || maxEdge <= 0) fail('maxEdge must be a positive integer')
    return scaleToLongestEdgeInternal(parsedSize, maxEdge)
  } catch (error) {
    return throwValidationError(error)
  }
}

export function validateProcessedBoundingBox(box: PixelRect, processedSize: PixelSize): void {
  try {
    validateProcessedBoundingBoxInternal(parsePixelRect(box, 'processed bounding box'), parsePixelSize(processedSize, 'processedSize'))
  } catch (error) {
    throwValidationError(error)
  }
}

export function validateProcessedImageTransform(transform: ProcessedImageTransform): void {
  try {
    validateParsedTransform(parseTransform(transform))
  } catch (error) {
    return throwValidationError(error)
  }
}

export function transformBoundingBox(box: PixelRect, transform: ProcessedImageTransform): PixelRect {
  try {
    const parsedTransform = parseTransform(transform)
    const parsedBox = parsePixelRect(box, 'bounding box')
    assertContainedInSize(parsedBox, parsedTransform.normalizedSize, 'bounding box')
    const fullRotatedSize = rotatedSize(parsedTransform.normalizedSize, parsedTransform.rotation)
    const fullRotatedBounds: PixelRect = { x: 0, y: 0, ...fullRotatedSize }
    const effectiveBounds = parsedTransform.crop ?? fullRotatedBounds
    validateParsedTransform(parsedTransform)
    const rotatedBox = rotateBoundingBox(parsedBox, parsedTransform.normalizedSize, parsedTransform.rotation)
    assertContainedInRect(rotatedBox, fullRotatedBounds, 'rotated bounding box')
    assertContainedInRect(rotatedBox, effectiveBounds, 'bounding box')
    const effectiveSize: PixelSize = { width: effectiveBounds.width, height: effectiveBounds.height }
    validateProcessedSize(effectiveSize, parsedTransform.processedSize)
    const localLeft = rotatedBox.x - effectiveBounds.x
    const localTop = rotatedBox.y - effectiveBounds.y
    const localRight = localLeft + rotatedBox.width
    const localBottom = localTop + rotatedBox.height
    const processedLeft = scaleLocalEdge(localLeft, effectiveSize.width, parsedTransform.processedSize.width)
    const processedTop = scaleLocalEdge(localTop, effectiveSize.height, parsedTransform.processedSize.height)
    const processedRight = scaleLocalEdge(localRight, effectiveSize.width, parsedTransform.processedSize.width)
    const processedBottom = scaleLocalEdge(localBottom, effectiveSize.height, parsedTransform.processedSize.height)
    const processedBox: PixelRect = {
      x: processedLeft,
      y: processedTop,
      width: processedRight - processedLeft,
      height: processedBottom - processedTop,
    }
    validateProcessedBoundingBoxInternal(processedBox, parsedTransform.processedSize)
    return processedBox
  } catch (error) {
    return throwValidationError(error)
  }
}
