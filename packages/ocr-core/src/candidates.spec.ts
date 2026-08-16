import { describe, expect, it } from 'vitest'
import { createDraftSeed, isNonNilUuid, validateCandidateBatch, type CandidateBatch, type OcrCandidateField } from './index'

const UUID = '550e8400-e29b-41d4-a716-446655440000'
const MATCH_2 = '550e8400-e29b-41d4-a716-446655440001'
const MARKET_1 = '550e8400-e29b-41d4-a716-446655440002'
const MARKET_2 = '550e8400-e29b-41d4-a716-446655440003'
const TRANSFORM = {
  schemaVersion: 'IMAGE_TRANSFORM_V1' as const, sourceSize: { width: 1000, height: 800 }, normalizedSize: { width: 1000, height: 800 },
  rotation: 0 as const, crop: null, redactions: [], processedSize: { width: 1000, height: 800 },
}
function field(partial: Partial<OcrCandidateField> = {}): OcrCandidateField {
  return { fieldId: UUID, entityType: 'MATCH', entityKey: UUID, fieldName: 'homeTeam', fieldValue: 'Alpha', confidence: 0.9, ...partial }
}
function batch(fields: readonly OcrCandidateField[]): CandidateBatch { return { schemaVersion: 'OCR_CANDIDATE_V2', processedImage: TRANSFORM, fields } }
function marketOnly(fieldName: 'odds' | 'playType' | 'selection', fieldValue: string): CandidateBatch { return batch([field({ fieldName: 'homeTeam' }), field({ fieldId: MATCH_2, entityType: 'MARKET', entityKey: MARKET_1, fieldName: 'matchRef', fieldValue: UUID }), field({ fieldId: MARKET_2, entityType: 'MARKET', entityKey: MARKET_1, fieldName, fieldValue })]) }
function validTwoMatchBatch(): CandidateBatch {
  return batch([
    field({ fieldId: '550e8400-e29b-41d4-a716-446655440010', entityKey: UUID, fieldName: 'homeTeam', fieldValue: 'Alpha' }),
    field({ fieldId: '550e8400-e29b-41d4-a716-446655440011', entityKey: MARKET_1, entityType: 'MARKET', fieldName: 'matchRef', fieldValue: UUID }),
    field({ fieldId: '550e8400-e29b-41d4-a716-446655440012', entityKey: MARKET_1, entityType: 'MARKET', fieldName: 'playType', fieldValue: 'WIN_DRAW_LOSS' }),
    field({ fieldId: '550e8400-e29b-41d4-a716-446655440013', entityKey: MARKET_1, entityType: 'MARKET', fieldName: 'selection', fieldValue: 'HOME_WIN' }),
    field({ fieldId: '550e8400-e29b-41d4-a716-446655440014', entityKey: MARKET_1, entityType: 'MARKET', fieldName: 'odds', fieldValue: '1.01' }),
    field({ fieldId: '550e8400-e29b-41d4-a716-446655440015', entityKey: MATCH_2, fieldName: 'awayTeam', fieldValue: 'Beta' }),
    field({ fieldId: '550e8400-e29b-41d4-a716-446655440021', entityKey: MATCH_2, fieldName: 'league', fieldValue: 'League B' }),
    field({ fieldId: '550e8400-e29b-41d4-a716-446655440016', entityKey: MARKET_2, entityType: 'MARKET', fieldName: 'matchRef', fieldValue: MATCH_2 }),
    field({ fieldId: '550e8400-e29b-41d4-a716-446655440017', entityKey: MARKET_2, entityType: 'MARKET', fieldName: 'playType', fieldValue: 'WIN_DRAW_LOSS' }),
    field({ fieldId: '550e8400-e29b-41d4-a716-446655440018', entityKey: MARKET_2, entityType: 'MARKET', fieldName: 'selection', fieldValue: 'DRAW' }),
    field({ fieldId: '550e8400-e29b-41d4-a716-446655440019', entityKey: MARKET_2, entityType: 'MARKET', fieldName: 'odds', fieldValue: '1000' }),
  ])
}

describe('validateCandidateBatch', () => {
  it('accepts the public V2 shape and returns a detached clone', () => {
    const input = validTwoMatchBatch(); const result = validateCandidateBatch(input)
    expect(result.valid).toBe(true)
    if (!result.valid) return
    expect(result.value.fields).toHaveLength(11); expect(result.value.fields).not.toBe(input.fields)
    input.fields[0].fieldValue = 'mutated'; expect(result.value.fields[0].fieldValue).toBe('Alpha')
  })
  it('rejects null, primitive, arrays, inherited records, accessors, proxies, and sparse arrays without throwing', () => {
    const hostile: unknown[] = [null, 1, 'x', [], Object.create({ schemaVersion: 'OCR_CANDIDATE_V2' })]
    hostile.push({ get schemaVersion() { throw new Error('getter executed') } })
    hostile.push(new Proxy({ schemaVersion: 'OCR_CANDIDATE_V2' }, { get() { throw new Error('proxy executed') } }))
    hostile.push({ schemaVersion: 'OCR_CANDIDATE_V2', processedImage: TRANSFORM, fields: new Array(1) })
    for (const value of hostile) { expect(() => validateCandidateBatch(value)).not.toThrow(); const result = validateCandidateBatch(value); expect(result.valid).toBe(false); if (!result.valid) expect(result.issues[0].path).toBeTruthy() }
  })
  it('enforces resource, UUID, whitelist, tuple, association, and market cardinality rules', () => {
    expect(validateCandidateBatch({ ...validTwoMatchBatch(), fields: new Array(257).fill(field()) }).valid).toBe(false)
    expect(validateCandidateBatch(batch([field({ fieldValue: 'x'.repeat(513) })])).valid).toBe(false)
    expect(validateCandidateBatch(batch([field({ fieldId: 'not-uuid' })])).valid).toBe(false)
    expect(validateCandidateBatch(batch([field(), field({ fieldId: MATCH_2 })])).valid).toBe(false)
    expect(validateCandidateBatch(batch([field({ entityType: 'MARKET', entityKey: MARKET_1, fieldName: 'homeTeam' })])).valid).toBe(false)
    expect(validateCandidateBatch(batch([field({ entityKey: MARKET_1, entityType: 'MARKET', fieldName: 'matchRef', fieldValue: UUID })])).valid).toBe(false)
    const twoMarkets = validTwoMatchBatch(); twoMarkets.fields = [...twoMarkets.fields, field({ fieldId: '550e8400-e29b-41d4-a716-446655440020', entityKey: '550e8400-e29b-41d4-a716-446655440004', entityType: 'MARKET', fieldName: 'matchRef', fieldValue: UUID })]
    expect(validateCandidateBatch(twoMarkets).valid).toBe(false)
  })
  it('validates every nonblank field value and canonical odds', () => {
    expect(validateCandidateBatch(batch([field({ fieldName: 'matchDate', fieldValue: '2024-02-29' })])).valid).toBe(true)
    expect(validateCandidateBatch(batch([field({ fieldName: 'matchDate', fieldValue: '2023-02-29' })])).valid).toBe(false)
    expect(validateCandidateBatch(batch([field({ fieldName: 'kickoffTime', fieldValue: '2026-08-16T12:00:00+08:00' })])).valid).toBe(true)
    expect(validateCandidateBatch(batch([field({ fieldName: 'kickoffTime', fieldValue: '2026-08-16T12:00:00' })])).valid).toBe(false)
    for (const odds of ['1.01', '1000', '1.2345']) expect(validateCandidateBatch(marketOnly('odds', odds)).valid).toBe(true)
    for (const odds of ['01.01', '1.0100', '1e2', '+2', '0.99']) expect(validateCandidateBatch(marketOnly('odds', odds)).valid).toBe(false)
    expect(validateCandidateBatch(marketOnly('playType', 'WIN_DRAW_LOSS')).valid).toBe(true)
    expect(validateCandidateBatch(marketOnly('selection', 'DRAW')).valid).toBe(true)
    expect(validateCandidateBatch(batch([field({ fieldName: 'homeTeam', fieldValue: 'x'.repeat(128) })])).valid).toBe(true)
    expect(validateCandidateBatch(batch([field({ fieldName: 'homeTeam', fieldValue: 'x'.repeat(129) })])).valid).toBe(false)
  })
  it('requires strict processed-space bounding boxes and does not mutate input', () => {
    const input = batch([field({ boundingBox: { x: 10, y: 20, width: 30, height: 40 } })]); const result = validateCandidateBatch(input)
    expect(result.valid).toBe(true); expect(input.fields[0].boundingBox).toEqual({ x: 10, y: 20, width: 30, height: 40 })
    expect(validateCandidateBatch(batch([field({ boundingBox: { x: 999, y: 0, width: 2, height: 2 } })])).valid).toBe(false)
  })

  it('rejects impossible calendar date/time values and accepts explicit offset boundaries', () => {
    for (const value of ['2024-02-30', '2023-02-29', '2024-00-01', '2024-13-01', '2024-01-00', '2024-01-32']) {
      expect(validateCandidateBatch(batch([field({ fieldName: 'matchDate', fieldValue: value })])).valid).toBe(false)
    }
    for (const value of ['2024-01-01T24:00:00Z', '2024-01-01T00:60:00Z', '2024-01-01T00:00:60Z', '2024-01-01T00:00:00+14:01', '2024-01-01T00:00:00-14:01']) {
      expect(validateCandidateBatch(batch([field({ fieldName: 'kickoffTime', fieldValue: value })])).valid).toBe(false)
    }
    for (const value of ['2024-02-29T23:59:59Z', '2024-02-29T23:59:59.123+14:00', '2024-02-29T00:00:00-14:00']) {
      expect(validateCandidateBatch(batch([field({ fieldName: 'kickoffTime', fieldValue: value })])).valid).toBe(true)
    }
  })

  it('requires matchRef association to preserve the original entityKey string case', () => {
    const upper = UUID.toUpperCase()
    const result = validateCandidateBatch(batch([
      field({ entityKey: upper, fieldName: 'homeTeam' }),
      field({ fieldId: MATCH_2, entityType: 'MARKET', entityKey: MARKET_1, fieldName: 'matchRef', fieldValue: UUID.toLowerCase() }),
    ]))
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.issues.some((entry) => entry.code === 'ORPHAN_MATCH_REF')).toBe(true)
  })

  it('rejects an accessor bbox without executing its getter', () => {
    let getterCalls = 0
    const candidate = field()
    Object.defineProperty(candidate, 'boundingBox', { get: () => { getterCalls += 1; throw new Error('getter executed') } })
    const result = validateCandidateBatch(batch([candidate]))
    expect(result.valid).toBe(false)
    expect(getterCalls).toBe(0)
    if (!result.valid) expect(result.issues.some((entry) => entry.code === 'OWN_DATA_REQUIRED')).toBe(true)
  })

  it('fails fast on 257 fields before reading numeric descriptors', () => {
    let reads = 0
    const fields = new Proxy(new Array(257), { get(target, property, receiver) { if (property !== 'length') reads += 1; return Reflect.get(target, property, receiver) } })
    const result = validateCandidateBatch({ ...batch([]), fields })
    expect(result.valid).toBe(false)
    expect(reads).toBe(0)
  })

  it('fails fast on oversized redactions before reading numeric descriptors', () => {
    let reads = 0
    const redactions = new Proxy(new Array(4097), { get(target, property, receiver) { if (property !== 'length') reads += 1; return Reflect.get(target, property, receiver) } })
    const result = validateCandidateBatch({ ...batch([]), processedImage: { ...TRANSFORM, redactions } })
    expect(result.valid).toBe(false)
    expect(reads).toBe(0)
  })

  it('exports one canonical non-nil UUID predicate', () => {
    expect(isNonNilUuid(UUID)).toBe(true)
    expect(isNonNilUuid(UUID.toUpperCase())).toBe(true)
    expect(isNonNilUuid('00000000-0000-0000-0000-000000000000')).toBe(false)
    expect(isNonNilUuid('not-a-uuid')).toBe(false)
  })

  it('rejects own extra string and symbol keys on fields and redactions arrays', () => {
    const fields = [] as unknown[]; fields.push(field()); (fields as unknown as Record<string, unknown>).extra = true; (fields as unknown as Record<symbol, unknown>)[Symbol('extra')] = true
    const fieldResult = validateCandidateBatch({ ...batch([]), fields })
    expect(fieldResult.valid).toBe(false)
    const redactions = [] as unknown[]; (redactions as unknown as Record<string, unknown>).extra = true
    const redactionResult = validateCandidateBatch({ ...batch([]), processedImage: { ...TRANSFORM, redactions } })
    expect(redactionResult.valid).toBe(false)
  })

  it('stops field value validation after the 512-code-unit boundary', () => {
    const result = validateCandidateBatch(batch([field({ fieldValue: `${'x'.repeat(512)}!` })]))
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.issues.some((entry) => entry.code === 'MAX_VALUE' && entry.path === 'fields[0].fieldValue')).toBe(true)
      expect(result.issues.some((entry) => entry.code === 'INVALID_FIELD_VALUE' && entry.path === 'fields[0].fieldValue')).toBe(false)
    }
  })
})

describe('createDraftSeed', () => {
  it('preserves first-seen match/market order, blanks missing fields, and keeps only evidence that exists', () => {
    const fields = validTwoMatchBatch().fields.filter((entry) => entry.fieldName !== 'awayTeam' && entry.fieldName !== 'selection'); const validated = validateCandidateBatch(batch(fields)); expect(validated.valid).toBe(true); if (!validated.valid) return
    const seed = createDraftSeed(validated); expect(seed.valid).toBe(true); if (!seed.valid) return
    expect(seed.value.matches.map((match) => match.draftMatchKey)).toEqual([UUID, MATCH_2]); expect(seed.value.markets.map((market) => market.draftMarketKey)).toEqual([MARKET_1, MARKET_2])
    expect(seed.value.matches[0].awayTeam).toBe(''); expect(seed.value.markets[1].selection).toBe(''); expect(seed.value.matches[0].evidence?.homeTeam?.fieldId).toBe('550e8400-e29b-41d4-a716-446655440010'); expect(seed.value.matches[0].evidence?.awayTeam).toBeUndefined()
  })
  it('returns a discriminated failure for invalid input rather than throwing', () => { expect(createDraftSeed({ valid: false, issues: [{ path: 'x', code: 'INVALID', message: 'bad' }] }).valid).toBe(false) })
})
