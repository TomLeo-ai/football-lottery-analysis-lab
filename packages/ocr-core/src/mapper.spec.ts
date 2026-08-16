import { describe, expect, it } from 'vitest'
import { mapNormalizedOcr, type NormalizedOcrLine, type ProcessedImageTransform } from './index'

const transform: ProcessedImageTransform = { schemaVersion: 'IMAGE_TRANSFORM_V1', sourceSize: { width: 1000, height: 800 }, normalizedSize: { width: 1000, height: 800 }, rotation: 0, crop: null, redactions: [], processedSize: { width: 1000, height: 800 } }
const ids = (() => { let n = 0; return () => `550e8400-e29b-41d4-a716-4466554400${String(n++).padStart(2, '0')}` })()
function lines(...rows: Array<[string, number, number, number, number?]>): readonly NormalizedOcrLine[] { return rows.map(([text, confidence, x, y, width = 10]) => ({ words: text.split(' ').map((token, index) => ({ text: token, confidence, boundingBox: { x: x + index * width, y, width, height: 10 } })) })) }
function golden(): readonly NormalizedOcrLine[] { return lines(['MATCH REF: ALPHA', 0.99, 10, 10], ['HOME: Team A', 0.9, 10, 30], ['DATE: 2026-08-16', 0.95, 10, 50], ['MATCH REF: BETA', 0.98, 10, 80], ['AWAY: Team D', 0.8, 10, 100], ['MARKET REF: ALPHA', 0.9, 10, 130], ['PLAY TYPE: WIN_DRAW_LOSS', 0.85, 10, 150], ['SELECTION: HOME_WIN', 0.84, 10, 170], ['ODDS: 1.5', 0.83, 10, 190], ['MARKET REF: BETA', 0.9, 10, 220], ['SELECTION: DRAW', 0.8, 10, 240], ['ODDS: 1000', 0.75, 10, 260]) }

describe('mapNormalizedOcr', () => {
  it('maps two interleaved matches and markets only through explicit refs', () => {
    const result = mapNormalizedOcr(golden(), transform, ids); expect(result.valid).toBe(true); if (!result.valid) return
    const refs = result.value.fields.filter((field) => field.fieldName === 'matchRef'); expect(refs).toHaveLength(2)
    expect(refs[0].fieldValue).not.toBe(refs[1].fieldValue)
    expect(new Set(refs.map((field) => field.fieldValue)).size).toBe(2)
  })
  it('uses exact labels, ignores unknown/fuzzy labels and orphan refs, and reports duplicate conflicts', () => {
    const result = mapNormalizedOcr(lines(['MATCH REF: KNOWN', 0.9, 0, 0], ['HOME TEAM: Fuzzy', 0.9, 0, 20], ['HOM: Nope', 0.9, 0, 40], ['MARKET REF: UNKNOWN', 0.9, 0, 60], ['MATCH REF: KNOWN', 0.9, 0, 80], ['HOME: Different', 0.9, 0, 100]), transform, ids)
    expect(result.valid).toBe(false); if (!result.valid) expect(result.issues.some((issue) => issue.code.includes('REF') || issue.code.includes('DUPLICATE'))).toBe(true)
  })
  it('aggregates confidence conservatively and unions only value bboxes, excluding label words', () => {
    const result = mapNormalizedOcr(lines(['MATCH REF: A', 0.9, 0, 0, 20], ['HOME: Team A', 0.6, 100, 50, 20]), transform, ids); expect(result.valid).toBe(true); if (!result.valid) return
    const candidate = result.value.fields.find((field) => field.fieldName === 'homeTeam'); expect(candidate?.confidence).toBe(0.6); expect(candidate?.boundingBox).toEqual({ x: 120, y: 50, width: 40, height: 10 })
  })
  it('omits empty or partially unbounded values and leaves absent optional fields absent', () => {
    const noBox: NormalizedOcrLine = { words: [{ text: 'HOME:', confidence: 0.9, boundingBox: { x: 0, y: 0, width: 10, height: 10 } }, { text: 'Team', confidence: 0.8 }] }; const result = mapNormalizedOcr([lines(['MATCH REF: A', 0.9, 0, 0])[0], noBox], transform, ids); expect(result.valid).toBe(true); if (!result.valid) return
    const home = result.value.fields.find((field) => field.fieldName === 'homeTeam'); expect(home?.fieldValue).toBe('Team'); expect(home?.boundingBox).toBeUndefined(); expect(result.value.fields.some((field) => field.fieldName === 'awayTeam')).toBe(false)
  })
  it('rejects malformed runtime input and invalid injected IDs without raw exceptions or mutation', () => {
    const frozen = golden(); expect(() => mapNormalizedOcr(null as never, transform, ids)).not.toThrow(); expect(mapNormalizedOcr(null as never, transform, ids).valid).toBe(false); const before = JSON.stringify(frozen); expect(mapNormalizedOcr(frozen, transform, () => 'not-uuid').valid).toBe(false); expect(JSON.stringify(frozen)).toBe(before)
  })

  it('rejects invalid confidence and malformed processed image as structured mapping failures', () => {
    const invalidConfidence = [{ words: [{ text: 'MATCH', confidence: 0.9 }, { text: 'REF:', confidence: 0.9 }, { text: 'A', confidence: 1.1 }] }]
    expect(mapNormalizedOcr(invalidConfidence, transform, ids).valid).toBe(false)
    expect(mapNormalizedOcr(lines(['MATCH REF: A', 0.9, 0, 0]), { ...transform, processedSize: { width: 100, height: 40 } }, ids).valid).toBe(false)
  })

  it('rejects two markets referring to one match instead of guessing', () => {
    const result = mapNormalizedOcr(lines(['MATCH REF: A', 0.9, 0, 0], ['HOME: Team A', 0.9, 0, 20], ['MARKET REF: A', 0.9, 0, 40], ['ODDS: 1.5', 0.8, 0, 60], ['MARKET REF: A', 0.9, 0, 80], ['ODDS: 2', 0.8, 0, 100]), transform, ids)
    expect(result.valid).toBe(false)
  })

  it('requires complete value bboxes when any value word supplies a bbox, while allowing all-missing bbox', () => {
    const allMissing: NormalizedOcrLine = { words: [{ text: 'HOME:', confidence: 0.9 }, { text: 'Team', confidence: 0.8 }] }
    const allMissingResult = mapNormalizedOcr([lines(['MATCH REF: A', 0.9, 0, 0])[0], allMissing], transform, ids)
    expect(allMissingResult.valid).toBe(true)
    if (allMissingResult.valid) expect(allMissingResult.value.fields.find((entry) => entry.fieldName === 'homeTeam')?.boundingBox).toBeUndefined()

    const partial: NormalizedOcrLine = { words: [{ text: 'HOME:', confidence: 0.9, boundingBox: { x: 0, y: 0, width: 10, height: 10 } }, { text: 'Team', confidence: 0.8, boundingBox: { x: 20, y: 0, width: 10, height: 10 } }, { text: 'A', confidence: 0.8 }] }
    expect(mapNormalizedOcr([lines(['MATCH REF: A', 0.9, 0, 0])[0], partial], transform, ids).valid).toBe(false)
    const invalidBox: NormalizedOcrLine = { words: [{ text: 'HOME:', confidence: 0.9 }, { text: 'Team', confidence: 0.8, boundingBox: { x: -1, y: 0, width: 10, height: 10 } }] }
    expect(mapNormalizedOcr([lines(['MATCH REF: A', 0.9, 0, 0])[0], invalidBox], transform, ids).valid).toBe(false)
  })

  it('does not execute an accessor bbox getter and returns a structured failure', () => {
    let getterCalls = 0
    const line: NormalizedOcrLine = { words: [{ text: 'HOME:', confidence: 0.9 }, { text: 'Team', confidence: 0.8 }] }
    Object.defineProperty(line.words[1], 'boundingBox', { get: () => { getterCalls += 1; throw new Error('getter executed') } })
    const result = mapNormalizedOcr([lines(['MATCH REF: A', 0.9, 0, 0])[0], line], transform, ids)
    expect(result.valid).toBe(false)
    expect(getterCalls).toBe(0)
  })

  it('stops once the 257th candidate would be created', () => {
    const source: Array<[string, number, number, number]> = [['MATCH REF: A', 0.9, 0, 0]]
    for (let index = 0; index < 257; index += 1) source.push(['HOME: Team' + index, 0.9, 0, index + 1])
    const result = mapNormalizedOcr(lines(...source), transform, ids)
    expect(result.valid).toBe(false)
  })

  it('fails fast on oversized lines before reading numeric descriptors', () => {
    let reads = 0
    const oversized = new Proxy(new Array(4097), { get(target, property, receiver) { if (property !== 'length') reads += 1; return Reflect.get(target, property, receiver) } })
    const result = mapNormalizedOcr(oversized, transform, ids)
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.issues.some((entry) => entry.code === 'MAX_LINES')).toBe(true)
    expect(reads).toBe(0)
  })

  it('fails fast on oversized words before reading word descriptors', () => {
    let reads = 0
    const oversizedWords = new Proxy(new Array(1025), { get(target, property, receiver) { if (property !== 'length') reads += 1; return Reflect.get(target, property, receiver) } })
    const result = mapNormalizedOcr([{ words: oversizedWords }], transform, ids)
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.issues.some((entry) => entry.code === 'MAX_WORDS_PER_LINE')).toBe(true)
    expect(reads).toBe(0)
  })

  it('fails fast on cumulative normalized word budget before reading the overflowing line', () => {
    const makeLine = (): NormalizedOcrLine => ({ words: Array.from({ length: 1024 }, () => ({ text: 'x', confidence: 0.5 })) })
    const priorLines = Array.from({ length: 64 }, makeLine)
    let reads = 0
    const overflowingWords = new Proxy(new Array(1), { get(target, property, receiver) { if (property !== 'length') reads += 1; return Reflect.get(target, property, receiver) } })
    const result = mapNormalizedOcr([...priorLines, { words: overflowingWords }], transform, ids)
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.issues.some((entry) => entry.code === 'MAX_WORDS_TOTAL')).toBe(true)
    expect(reads).toBe(0)
  })

  it('validates factory UUIDs and allocation uniqueness immediately', () => {
    const validId = '550e8400-e29b-41d4-a716-446655440010'
    expect(mapNormalizedOcr(lines(['MATCH REF: A', 0.9, 0, 0], ['MATCH REF: B', 0.9, 0, 20]), transform, () => validId).valid).toBe(false)
    expect(mapNormalizedOcr(lines(['MATCH REF: A', 0.9, 0, 0]), transform, () => '00000000-0000-0000-0000-000000000000').valid).toBe(false)
    expect(mapNormalizedOcr(lines(['MATCH REF: A', 0.9, 0, 0]), transform, () => 'not-uuid').valid).toBe(false)
    let call = 0
    const duplicateMarketId = (value: string): () => string => () => value
    const repeated = mapNormalizedOcr(lines(['MATCH REF: A', 0.9, 0, 0], ['HOME: Team', 0.9, 0, 20], ['MARKET REF: A', 0.9, 0, 40], ['MARKET REF: A', 0.9, 0, 60]), transform, (() => { call += 1; return call === 1 ? validId : duplicateMarketId('550e8400-e29b-41d4-a716-446655440011')() }) )
    expect(repeated.valid).toBe(false)
    const sequence = ['550e8400-e29b-41d4-a716-446655440020', '550e8400-e29b-41d4-a716-446655440021', '550e8400-e29b-41d4-a716-446655440022', '550e8400-e29b-41d4-a716-446655440023', '550e8400-e29b-41d4-a716-446655440023']
    expect(mapNormalizedOcr(lines(['MATCH REF: A', 0.9, 0, 0], ['HOME: Team', 0.9, 0, 20], ['MARKET REF: A', 0.9, 0, 40], ['ODDS: 1.5', 0.8, 0, 60]), transform, () => sequence.shift() ?? validId).valid).toBe(false)
  })

  it('rejects own extra keys on lines, words, and their exact records', () => {
    const line = { words: [{ text: 'MATCH', confidence: 0.9 }, { text: 'REF:', confidence: 0.9 }, { text: 'A', confidence: 0.9 }], extra: true }
    expect(mapNormalizedOcr([line], transform, ids).valid).toBe(false)
    const word = { text: 'A', confidence: 0.9, extra: true }
    expect(mapNormalizedOcr([{ words: [{ text: 'MATCH', confidence: 0.9 }, { text: 'REF:', confidence: 0.9 }, word] }], transform, ids).valid).toBe(false)
    const linesWithExtra = [] as unknown[]; (linesWithExtra as unknown as Record<string, unknown>).extra = true
    expect(mapNormalizedOcr(linesWithExtra, transform, ids).valid).toBe(false)
  })
})
