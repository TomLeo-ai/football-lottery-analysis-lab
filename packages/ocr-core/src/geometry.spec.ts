import { describe, expect, it } from 'vitest'
import {
  OcrCoreValidationError,
  scaleToLongestEdge,
  transformBoundingBox,
  validateProcessedBoundingBox,
  type ProcessedImageTransform,
  type Rotation,
} from './index'

const normalizedSize = { width: 200, height: 100 }
const sourceSize = { width: 100, height: 200 }
const inputBox = { x: 10, y: 20, width: 30, height: 40 }

function transform(overrides: Partial<ProcessedImageTransform> = {}): ProcessedImageTransform {
  return {
    schemaVersion: 'IMAGE_TRANSFORM_V1',
    sourceSize,
    normalizedSize,
    rotation: 0,
    crop: null,
    redactions: [],
    processedSize: { width: 200, height: 100 },
    ...overrides,
  }
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    Object.freeze(value)
    for (const nested of Object.values(value)) {
      deepFreeze(nested)
    }
  }
  return value
}

describe('OCR image geometry public contracts', () => {
  it.each([
    {
      rotation: 0 as Rotation,
      processedSize: { width: 200, height: 100 },
      expected: { x: 10, y: 20, width: 30, height: 40 },
    },
    {
      rotation: 90 as Rotation,
      processedSize: { width: 100, height: 200 },
      expected: { x: 40, y: 10, width: 40, height: 30 },
    },
    {
      rotation: 180 as Rotation,
      processedSize: { width: 200, height: 100 },
      expected: { x: 160, y: 40, width: 30, height: 40 },
    },
    {
      rotation: 270 as Rotation,
      processedSize: { width: 100, height: 200 },
      expected: { x: 20, y: 160, width: 40, height: 30 },
    },
  ])('rotates normalized boxes clockwise for $rotation degrees with a null crop', ({ rotation, processedSize, expected }) => {
    expect(transformBoundingBox(inputBox, transform({ rotation, processedSize }))).toEqual(expected)
  })

  it('maps the central rotated, cropped, and scaled fixture into processed space', () => {
    expect(transformBoundingBox(inputBox, transform({
      rotation: 90,
      crop: { x: 20, y: 10, width: 60, height: 120 },
      processedSize: { width: 30, height: 60 },
    }))).toEqual({ x: 10, y: 0, width: 20, height: 15 })
  })

  it('does not use audit-only sourceSize for bounding-box math', () => {
    const base = transform({
      rotation: 90,
      crop: { x: 20, y: 10, width: 60, height: 120 },
      processedSize: { width: 30, height: 60 },
    })
    const changedSource = { ...base, sourceSize: { width: 200, height: 100 } }

    expect(transformBoundingBox(inputBox, changedSource)).toEqual(transformBoundingBox(inputBox, base))
  })

  it('accepts fractional bounding boxes and redactions without changing their coordinates', () => {
    const box = { x: 0.5, y: 1.25, width: 10.5, height: 20.75 }
    const redactions = [{ x: 30.25, y: 40.5, width: 5.5, height: 6.75 }]

    expect(transformBoundingBox(box, transform({ redactions }))).toEqual(box)
  })

  it.each([
    { label: 'NaN x', crop: { x: Number.NaN, y: 0, width: 100, height: 100 } },
    { label: 'infinite y', crop: { x: 0, y: Number.POSITIVE_INFINITY, width: 100, height: 100 } },
    { label: 'negative x', crop: { x: -1, y: 0, width: 100, height: 100 } },
    { label: 'negative y', crop: { x: 0, y: -1, width: 100, height: 100 } },
    { label: 'zero width', crop: { x: 0, y: 0, width: 0, height: 100 } },
    { label: 'negative height', crop: { x: 0, y: 0, width: 100, height: -1 } },
    { label: 'x', crop: { x: 0.5, y: 0, width: 100, height: 100 } },
    { label: 'y', crop: { x: 0, y: 0.5, width: 100, height: 100 } },
    { label: 'width', crop: { x: 0, y: 0, width: 100.5, height: 100 } },
    { label: 'height', crop: { x: 0, y: 0, width: 100, height: 99.5 } },
  ])('rejects a fractional crop $label', ({ crop }) => {
    expect(() => transformBoundingBox(inputBox, transform({ crop }))).toThrow(OcrCoreValidationError)
  })

  it('validates redactions without mutating a deeply frozen array on success or failure', () => {
    const redactions = deepFreeze([
      { x: 25.5, y: 20.25, width: 10.5, height: 15.75 },
      { x: 45, y: 50, width: 15, height: 20 },
    ])
    const before = redactions.map((redaction) => ({ ...redaction }))
    const successful = transform({ redactions })

    expect(transformBoundingBox(inputBox, successful)).toEqual(inputBox)
    expect(redactions).toEqual(before)

    const rejected = { ...successful, processedSize: { width: 100, height: 40 } }
    expect(() => transformBoundingBox(inputBox, rejected)).toThrow(OcrCoreValidationError)
    expect(redactions).toEqual(before)
  })

  it('rejects a redaction inherited through Array.prototype index zero', () => {
    const inheritedRedactions = new Array<never>(1)
    const originalIndex = Object.getOwnPropertyDescriptor(Array.prototype, '0')
    Object.defineProperty(Array.prototype, '0', {
      configurable: true,
      value: { x: 10, y: 10, width: 10, height: 10 },
    })

    try {
      expect(() => transformBoundingBox(inputBox, transform({
        redactions: inheritedRedactions as unknown as readonly { x: number; y: number; width: number; height: number }[],
      }))).toThrow(OcrCoreValidationError)
    } finally {
      if (originalIndex === undefined) {
        delete (Array.prototype as unknown as Record<string, unknown>)['0']
      } else {
        Object.defineProperty(Array.prototype, '0', originalIndex)
      }
    }
  })

  it('rejects a redaction array own accessor without invoking it', () => {
    const accessorRedactions: unknown[] = []
    let getterCalls = 0
    Object.defineProperty(accessorRedactions, '0', {
      configurable: true,
      enumerable: true,
      get() {
        getterCalls += 1
        return { x: 10, y: 10, width: 10, height: 10 }
      },
    })

    expect(() => transformBoundingBox(inputBox, transform({
      redactions: accessorRedactions as unknown as readonly { x: number; y: number; width: number; height: number }[],
    }))).toThrow(OcrCoreValidationError)
    expect(getterCalls).toBe(0)
  })

  it('uses actual independent Canvas ratios in transformed bounding boxes', () => {
    const box = { x: 100, y: 100, width: 100, height: 100 }
    const actualScaleY = 80 / 333

    expect(transformBoundingBox(box, transform({
      sourceSize: { width: 1000, height: 333 },
      normalizedSize: { width: 1000, height: 333 },
      processedSize: { width: 240, height: 80 },
    }))).toEqual({
      x: 24,
      y: 100 * actualScaleY,
      width: 24,
      height: 100 * actualScaleY,
    })
  })

  it('keeps full-boundary boxes exact during non-uniform Canvas scaling without relaxing public bounds', () => {
    const fullBox = { x: 0, y: 0, width: 1531, height: 18962 }

    expect(transformBoundingBox(fullBox, transform({
      sourceSize: { width: 1531, height: 18962 },
      normalizedSize: { width: 1531, height: 18962 },
      processedSize: { width: 194, height: 2400 },
    }))).toEqual({ x: 0, y: 0, width: 194, height: 2400 })
    expect(() => validateProcessedBoundingBox(
      { x: 0, y: 0, width: 194.00000000000003, height: 2400 },
      { width: 194, height: 2400 },
    )).toThrow(OcrCoreValidationError)
  })

  it.each([
    {
      label: 'landscape crop',
      box: { x: 10, y: 20, width: 200, height: 100 },
      crop: { x: 10, y: 20, width: 200, height: 100 },
      processedSize: { width: 100, height: 50 },
      rotation: 0 as Rotation,
      normalizedSize: { width: 400, height: 300 },
    },
    {
      label: 'portrait crop',
      box: { x: 10, y: 20, width: 100, height: 200 },
      crop: { x: 10, y: 20, width: 100, height: 200 },
      processedSize: { width: 50, height: 100 },
      rotation: 0 as Rotation,
      normalizedSize: { width: 400, height: 300 },
    },
    {
      label: 'square crop',
      box: { x: 10, y: 20, width: 100, height: 100 },
      crop: { x: 10, y: 20, width: 100, height: 100 },
      processedSize: { width: 50, height: 50 },
      rotation: 0 as Rotation,
      normalizedSize: { width: 400, height: 300 },
    },
    {
      label: 'clockwise rotated crop',
      box: { x: 0, y: 200, width: 200, height: 100 },
      crop: { x: 0, y: 0, width: 100, height: 200 },
      processedSize: { width: 50, height: 100 },
      rotation: 90 as Rotation,
      normalizedSize: { width: 400, height: 300 },
    },
  ])('keeps a complete $label on the processed boundary', ({ box, crop, processedSize, rotation, normalizedSize: caseNormalizedSize }) => {
    expect(transformBoundingBox(box, transform({
      sourceSize: caseNormalizedSize,
      normalizedSize: caseNormalizedSize,
      rotation,
      crop,
      processedSize,
    }))).toEqual({ x: 0, y: 0, width: processedSize.width, height: processedSize.height })
  })

  it('scales integer Canvas sizes to the longest edge using actual axis ratios', () => {
    expect(scaleToLongestEdge({ width: 1000, height: 333 }, 240)).toEqual({
      processedSize: { width: 240, height: 80 },
      scaleX: 0.24,
      scaleY: 80 / 333,
    })
    expect(scaleToLongestEdge({ width: 333, height: 1000 }, 240)).toEqual({
      processedSize: { width: 80, height: 240 },
      scaleX: 80 / 333,
      scaleY: 0.24,
    })
    expect(scaleToLongestEdge({ width: 100, height: 50 }, 240)).toEqual({
      processedSize: { width: 100, height: 50 },
      scaleX: 1,
      scaleY: 1,
    })
    expect(scaleToLongestEdge({ width: 1, height: 1 }, 240)).toEqual({
      processedSize: { width: 1, height: 1 },
      scaleX: 1,
      scaleY: 1,
    })
    expect(scaleToLongestEdge({ width: 1, height: 2 }, 1)).toEqual({
      processedSize: { width: 1, height: 1 },
      scaleX: 1,
      scaleY: 0.5,
    })
    expect(scaleToLongestEdge({ width: 2, height: 1 }, 1)).toEqual({
      processedSize: { width: 1, height: 1 },
      scaleX: 0.5,
      scaleY: 1,
    })
    expect(scaleToLongestEdge({ width: 200, height: 200 }, 100)).toEqual({
      processedSize: { width: 100, height: 100 },
      scaleX: 0.5,
      scaleY: 0.5,
    })
    expect(scaleToLongestEdge({ width: 1000, height: 1 }, 1)).toEqual({
      processedSize: { width: 1, height: 1 },
      scaleX: 0.001,
      scaleY: 1,
    })
  })

  it('keeps extreme finite integer longest-edge scaling results finite', () => {
    const result = scaleToLongestEdge(
      { width: Number.MAX_VALUE, height: Number.MAX_VALUE / 2 },
      Number.MAX_VALUE / 2,
    )

    expect(result).toEqual({
      processedSize: { width: Number.MAX_VALUE / 2, height: Number.MAX_VALUE / 4 },
      scaleX: 0.5,
      scaleY: 0.5,
    })
    expect(Object.values(result.processedSize).every(Number.isFinite)).toBe(true)
    expect(Number.isFinite(result.scaleX)).toBe(true)
    expect(Number.isFinite(result.scaleY)).toBe(true)
  })

  it('transforms full and partial extreme finite boxes without intermediate multiplication overflow', () => {
    const maximum = Number.MAX_VALUE
    const extremeTransform = transform({
      sourceSize: { width: maximum, height: maximum / 2 },
      normalizedSize: { width: maximum, height: maximum / 2 },
      processedSize: { width: maximum / 2, height: maximum / 4 },
    })
    const partialBox = { x: maximum / 4, y: maximum / 8, width: maximum / 4, height: maximum / 8 }

    expect(transformBoundingBox(
      { x: 0, y: 0, width: maximum, height: maximum / 2 },
      extremeTransform,
    )).toEqual({ x: 0, y: 0, width: maximum / 2, height: maximum / 4 })
    expect(transformBoundingBox(partialBox, extremeTransform)).toEqual({
      x: maximum / 8,
      y: maximum / 16,
      width: maximum / 8,
      height: maximum / 16,
    })
  })

  it('rejects an extreme tiny partial box whose computed processed edge is not representable', () => {
    const maximum = Number.MAX_VALUE

    expect(() => transformBoundingBox(
      { x: maximum / 4, y: maximum / 8, width: 1, height: 1 },
      transform({
        sourceSize: { width: maximum, height: maximum / 2 },
        normalizedSize: { width: maximum, height: maximum / 2 },
        processedSize: { width: maximum / 2, height: maximum / 4 },
      }),
    )).toThrow(OcrCoreValidationError)
  })

  it('preserves an ordinary-scale fractional tiny bounding box', () => {
    const tinyBox = { x: 0.1, y: 0.2, width: 0.000_000_001, height: 0.000_000_001 }
    const result = transformBoundingBox(tinyBox, transform())

    expect(result.x).toBe(tinyBox.x)
    expect(result.y).toBe(tinyBox.y)
    expect(Number.isFinite(result.width)).toBe(true)
    expect(Number.isFinite(result.height)).toBe(true)
    expect(result.width).toBeGreaterThan(0)
    expect(result.height).toBeGreaterThan(0)
  })

  it('rejects redaction arrays over the synchronous parsing budget and accepts the maximum', () => {
    const atBudget = Array.from({ length: 4096 }, () => ({ x: 10, y: 10, width: 1, height: 1 }))
    const overBudget = Array.from({ length: 4097 }, () => ({ x: 10, y: 10, width: 1, height: 1 }))

    expect(transformBoundingBox(inputBox, transform({ redactions: atBudget }))).toEqual(inputBox)
    expect(() => transformBoundingBox(inputBox, transform({ redactions: overBudget }))).toThrow(OcrCoreValidationError)
  })

  it('rejects a huge redactions Array Proxy before inspecting numeric indexes', () => {
    const hugeArray = new Array(4_294_967_295)
    let numericDescriptorReads = 0
    const redactions = new Proxy(hugeArray, {
      getOwnPropertyDescriptor(target, key) {
        if (typeof key === 'string' && /^\d+$/.test(key)) {
          numericDescriptorReads += 1
          throw new Error('numeric descriptor must not be read')
        }
        return Reflect.getOwnPropertyDescriptor(target, key)
      },
    })

    expect(() => transformBoundingBox(inputBox, transform({
      redactions: redactions as unknown as readonly { x: number; y: number; width: number; height: number }[],
    }))).toThrow(OcrCoreValidationError)
    expect(numericDescriptorReads).toBe(0)
  })

  it('validates schemaVersion before validating a simultaneously invalid bounding box', () => {
    expect(() => transformBoundingBox(
      { x: -1, y: 0, width: 1, height: 1 },
      transform({ schemaVersion: 'OTHER_VERSION' as 'IMAGE_TRANSFORM_V1' }),
    )).toThrow(/schemaVersion/)
  })

  it('rejects non-plain records and inherited required fields without reading accessors', () => {
    class PixelSizeInstance {
      width = 200
      height = 100
    }
    const arrayWithFields = Object.assign([], transform())
    const inheritedTransform = Object.create(transform()) as ProcessedImageTransform
    const inheritedSize = Object.create({ width: 200, height: 100 }) as { width: number; height: number }
    const inheritedBox = Object.create(inputBox) as typeof inputBox
    let getterExecuted = false
    const getterSize = Object.defineProperty({}, 'width', {
      enumerable: true,
      get() {
        getterExecuted = true
        throw new Error('getter must not execute')
      },
    })
    Object.defineProperty(getterSize, 'height', { enumerable: true, value: 100 })

    expect(() => transformBoundingBox(inputBox, arrayWithFields as unknown as ProcessedImageTransform)).toThrow(OcrCoreValidationError)
    expect(() => transformBoundingBox(inputBox, inheritedTransform)).toThrow(OcrCoreValidationError)
    expect(() => scaleToLongestEdge(new PixelSizeInstance(), 100)).toThrow(OcrCoreValidationError)
    expect(() => transformBoundingBox(inputBox, transform({ normalizedSize: inheritedSize }))).toThrow(OcrCoreValidationError)
    expect(() => transformBoundingBox(inheritedBox, transform())).toThrow(OcrCoreValidationError)
    expect(() => scaleToLongestEdge(getterSize as { width: number; height: number }, 100)).toThrow(OcrCoreValidationError)
    expect(getterExecuted).toBe(false)
  })

  it('accepts a null-prototype record with own data fields and rejects Object.prototype pollution', () => {
    const nullPrototypeSize = Object.create(null, {
      width: { enumerable: true, value: 100 },
      height: { enumerable: true, value: 50 },
    }) as { width: number; height: number }
    const originalWidth = Object.getOwnPropertyDescriptor(Object.prototype, 'width')

    expect(scaleToLongestEdge(nullPrototypeSize, 50)).toEqual({
      processedSize: { width: 50, height: 25 },
      scaleX: 0.5,
      scaleY: 0.5,
    })

    Object.defineProperty(Object.prototype, 'width', { configurable: true, value: 100 })
    try {
      expect(() => scaleToLongestEdge({ height: 50 } as { width: number; height: number }, 50)).toThrow(OcrCoreValidationError)
    } finally {
      if (originalWidth === undefined) {
        delete (Object.prototype as { width?: unknown }).width
      } else {
        Object.defineProperty(Object.prototype, 'width', originalWidth)
      }
    }
  })

  it.each([null, 1, 'image', []])('wraps invalid transform values %o in OcrCoreValidationError', (invalidTransform) => {
    expect(() => transformBoundingBox(inputBox, invalidTransform as unknown as ProcessedImageTransform)).toThrow(OcrCoreValidationError)
  })

  it.each([null, 1, 'box', []])('wraps invalid transform-box values %o in OcrCoreValidationError', (invalidBox) => {
    expect(() => transformBoundingBox(invalidBox as unknown as typeof inputBox, transform())).toThrow(OcrCoreValidationError)
  })

  it.each([null, 1, 'box', []])('wraps invalid processed-box values %o in OcrCoreValidationError', (invalidBox) => {
    expect(() => validateProcessedBoundingBox(invalidBox as unknown as typeof inputBox, { width: 10, height: 10 })).toThrow(OcrCoreValidationError)
  })

  it.each([null, 1, 'size', []])('wraps invalid processed-size values %o in OcrCoreValidationError', (invalidSize) => {
    expect(() => validateProcessedBoundingBox(
      { x: 0, y: 0, width: 1, height: 1 },
      invalidSize as unknown as { width: number; height: number },
    )).toThrow(OcrCoreValidationError)
  })

  it.each([null, 1, 'size', []])('wraps invalid scale-size values %o in OcrCoreValidationError', (invalidSize) => {
    expect(() => scaleToLongestEdge(invalidSize as unknown as { width: number; height: number }, 10)).toThrow(OcrCoreValidationError)
  })

  it.each([null, '10', []])('wraps invalid max-edge values %o in OcrCoreValidationError', (invalidMaxEdge) => {
    expect(() => scaleToLongestEdge({ width: 10, height: 10 }, invalidMaxEdge as unknown as number)).toThrow(OcrCoreValidationError)
  })

  it.each([
    { label: 'missing', redactions: undefined },
    { label: 'null', redactions: null },
    { label: 'primitive', redactions: 'not-an-array' },
  ])('rejects $label redactions at the public boundary', ({ redactions }) => {
    expect(() => transformBoundingBox(inputBox, transform({ redactions } as Partial<ProcessedImageTransform>))).toThrow(OcrCoreValidationError)
  })

  it('wraps throwing Proxy traps from every public API and nested transform records', () => {
    const throwingGet = new Proxy({ width: 10, height: 10 }, {
      get() {
        throw new Error('get trap')
      },
    })
    const throwingDescriptor = new Proxy({ width: 10, height: 10 }, {
      getOwnPropertyDescriptor() {
        throw new Error('descriptor trap')
      },
    })
    const throwingPrototype = new Proxy({ width: 10, height: 10 }, {
      getPrototypeOf() {
        throw new Error('prototype trap')
      },
    })

    expect(() => scaleToLongestEdge(throwingGet as unknown as { width: number; height: number }, 10)).toThrow(OcrCoreValidationError)
    expect(() => validateProcessedBoundingBox(
      throwingDescriptor as unknown as typeof inputBox,
      { width: 10, height: 10 },
    )).toThrow(OcrCoreValidationError)
    expect(() => transformBoundingBox(inputBox, transform({
      sourceSize: throwingPrototype as unknown as { width: number; height: number },
    }))).toThrow(OcrCoreValidationError)

    expect(() => transformBoundingBox(
      throwingGet as unknown as typeof inputBox,
      transform(),
    )).toThrow(OcrCoreValidationError)
    expect(() => transformBoundingBox(inputBox, transform({
      redactions: [throwingDescriptor as unknown as { x: number; y: number; width: number; height: number }],
    }))).toThrow(OcrCoreValidationError)
  })

  it.each([
    { label: 'source width NaN', overrides: { sourceSize: { width: Number.NaN, height: 100 } } },
    { label: 'source height infinity', overrides: { sourceSize: { width: 100, height: Number.POSITIVE_INFINITY } } },
    { label: 'source width zero', overrides: { sourceSize: { width: 0, height: 100 } } },
    { label: 'source height negative', overrides: { sourceSize: { width: 100, height: -1 } } },
    { label: 'source width fractional', overrides: { sourceSize: { width: 100.5, height: 100 } } },
    { label: 'normalized width NaN', overrides: { normalizedSize: { width: Number.NaN, height: 100 } } },
    { label: 'normalized height infinity', overrides: { normalizedSize: { width: 200, height: Number.POSITIVE_INFINITY } } },
    { label: 'normalized width zero', overrides: { normalizedSize: { width: 0, height: 100 } } },
    { label: 'normalized height negative', overrides: { normalizedSize: { width: 200, height: -1 } } },
    { label: 'normalized width fractional', overrides: { normalizedSize: { width: 200.5, height: 100 } } },
    { label: 'processed width NaN', overrides: { processedSize: { width: Number.NaN, height: 100 } } },
    { label: 'processed height infinity', overrides: { processedSize: { width: 200, height: Number.POSITIVE_INFINITY } } },
    { label: 'processed width zero', overrides: { processedSize: { width: 0, height: 100 } } },
    { label: 'processed height negative', overrides: { processedSize: { width: 200, height: -1 } } },
    { label: 'processed width fractional', overrides: { processedSize: { width: 200.5, height: 100 } } },
    { label: 'invalid rotation', overrides: { rotation: 45 as Rotation } },
    { label: 'invalid schema version', overrides: { schemaVersion: 'OTHER_VERSION' as 'IMAGE_TRANSFORM_V1' } },
  ])('rejects invalid transform metadata: $label', ({ overrides }) => {
    expect(() => transformBoundingBox(inputBox, transform(overrides))).toThrow(OcrCoreValidationError)
  })

  it.each([
    { label: 'NaN x', box: { x: Number.NaN, y: 0, width: 1, height: 1 } },
    { label: 'infinite y', box: { x: 0, y: Number.POSITIVE_INFINITY, width: 1, height: 1 } },
    { label: 'negative x', box: { x: -1, y: 0, width: 1, height: 1 } },
    { label: 'negative y', box: { x: 0, y: -1, width: 1, height: 1 } },
    { label: 'zero width', box: { x: 0, y: 0, width: 0, height: 1 } },
    { label: 'negative height', box: { x: 0, y: 0, width: 1, height: -1 } },
  ])('rejects an invalid generic bounding box: $label', ({ box }) => {
    expect(() => transformBoundingBox(box, transform())).toThrow(OcrCoreValidationError)
  })

  it.each([
    { label: 'NaN x', redactions: [{ x: Number.NaN, y: 0, width: 1, height: 1 }] },
    { label: 'infinite y', redactions: [{ x: 0, y: Number.POSITIVE_INFINITY, width: 1, height: 1 }] },
    { label: 'negative x', redactions: [{ x: -1, y: 0, width: 1, height: 1 }] },
    { label: 'zero width', redactions: [{ x: 0, y: 0, width: 0, height: 1 }] },
    { label: 'negative height', redactions: [{ x: 0, y: 0, width: 1, height: -1 }] },
  ])('rejects an invalid redaction: $label', ({ redactions }) => {
    expect(() => transformBoundingBox(inputBox, transform({ redactions }))).toThrow(OcrCoreValidationError)
  })

  it.each([
    { label: 'outside normalized image', box: { x: 180, y: 20, width: 30, height: 40 } },
    { label: 'crossing a rotated crop', box: { x: 10, y: 10, width: 50, height: 40 } },
  ])('rejects an input box $label', ({ label, box }) => {
    const scoped = label === 'crossing a rotated crop'
      ? transform({ rotation: 90, crop: { x: 20, y: 10, width: 60, height: 120 }, processedSize: { width: 30, height: 60 } })
      : transform()

    expect(() => transformBoundingBox(box, scoped)).toThrow(OcrCoreValidationError)
  })

  it('rejects a crop or redaction outside its rotated and effective bounds', () => {
    expect(() => transformBoundingBox(inputBox, transform({
      rotation: 90,
      crop: { x: 50, y: 10, width: 60, height: 120 },
      processedSize: { width: 30, height: 60 },
    }))).toThrow(OcrCoreValidationError)

    expect(() => transformBoundingBox(inputBox, transform({
      rotation: 90,
      crop: { x: 20, y: 10, width: 60, height: 120 },
      redactions: [{ x: 10, y: 20, width: 10, height: 10 }],
      processedSize: { width: 30, height: 60 },
    }))).toThrow(OcrCoreValidationError)

    expect(() => transformBoundingBox(inputBox, transform({
      rotation: 90,
      redactions: [{ x: 90, y: 20, width: 20, height: 10 }],
      processedSize: { width: 100, height: 200 },
    }))).toThrow(OcrCoreValidationError)
  })

  it.each([
    { label: 'arbitrary aspect change', processedSize: { width: 100, height: 40 } },
    { label: 'enlargement', processedSize: { width: 300, height: 150 } },
  ])('rejects $label in processedSize metadata', ({ processedSize }) => {
    expect(() => transformBoundingBox(inputBox, transform({ processedSize }))).toThrow(OcrCoreValidationError)
  })

  it('validates processed boxes with inclusive right and bottom bounds and rejects overflow', () => {
    expect(() => validateProcessedBoundingBox(
      { x: 170, y: 60, width: 30, height: 40 },
      { width: 200, height: 100 },
    )).not.toThrow()
    expect(() => validateProcessedBoundingBox(
      { x: 171, y: 60, width: 30, height: 40 },
      { width: 200, height: 100 },
    )).toThrow(OcrCoreValidationError)
  })

  it.each([Number.NaN, Number.POSITIVE_INFINITY, 0, -1, 1.5])('rejects invalid longest-edge maximum %s', (maxEdge) => {
    expect(() => scaleToLongestEdge({ width: 100, height: 50 }, maxEdge)).toThrow(OcrCoreValidationError)
  })

  it.each([
    { width: Number.NaN, height: 100 },
    { width: 100, height: Number.POSITIVE_INFINITY },
    { width: 0, height: 100 },
    { width: 100, height: -1 },
    { width: 100.5, height: 100 },
  ])('rejects invalid longest-edge source sizes %#', (size) => {
    expect(() => scaleToLongestEdge(size, 240)).toThrow(OcrCoreValidationError)
  })
})
