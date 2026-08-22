import { OCR_CANDIDATE_SCHEMA_VERSION, PLAY_TYPES, SELECTIONS } from './contracts'
import { validateProcessedBoundingBox, validateProcessedImageTransform, type PixelRect, type PixelSize, type ProcessedImageTransform, type Rotation } from './geometry'

export type MatchFieldName = 'matchDate' | 'league' | 'homeTeam' | 'awayTeam' | 'kickoffTime'
export type MarketFieldName = 'matchRef' | 'playType' | 'selection' | 'odds'
export interface OcrCandidateField {
  fieldId: string
  entityType: 'MATCH' | 'MARKET'
  entityKey: string
  fieldName: MatchFieldName | MarketFieldName
  fieldValue: string
  confidence: number
  boundingBox?: PixelRect
}
export interface CandidateBatch {
  schemaVersion: 'OCR_CANDIDATE_V2'
  processedImage: ProcessedImageTransform
  fields: readonly OcrCandidateField[]
}
export interface CandidateIssue { path: string; code: string; message: string }
export type CandidateValidationResult =
  | { valid: true; value: CandidateBatch }
  | { valid: false; issues: readonly CandidateIssue[] }

type PlainRecord = Record<string, unknown>
const MATCH_FIELDS: readonly MatchFieldName[] = ['matchDate', 'league', 'homeTeam', 'awayTeam', 'kickoffTime']
const MARKET_FIELDS: readonly MarketFieldName[] = ['matchRef', 'playType', 'selection', 'odds']
const UUID_RE = /^(?!00000000-0000-0000-0000-000000000000$)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function isNonNilUuid(value: unknown): value is string { return typeof value === 'string' && UUID_RE.test(value) }

function issue(path: string, code: string, message: string): CandidateIssue { return { path, code, message } }
function ownData(value: object, key: string): { ok: true; value: unknown } | { ok: false } {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) return { ok: false }
    return { ok: true, value: descriptor.value }
  } catch { return { ok: false } }
}
function plain(value: unknown): value is PlainRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  try { const prototype = Object.getPrototypeOf(value); return prototype === Object.prototype || prototype === null } catch { return false }
}
function requiredRecord(value: unknown, path: string, issues: CandidateIssue[]): PlainRecord | undefined {
  if (!plain(value)) { issues.push(issue(path, 'PLAIN_RECORD_REQUIRED', 'must be a plain own-data record')); return undefined }
  return value
}
function read(record: PlainRecord, key: string, path: string, issues: CandidateIssue[]): unknown {
  const observed = ownData(record, key)
  if (!observed.ok) { issues.push(issue(`${path}.${key}`, 'OWN_DATA_REQUIRED', 'must be an own data property')); return undefined }
  return observed.value
}
function exactKeys(record: PlainRecord, expected: readonly string[], path: string, issues: CandidateIssue[]): void {
  let keys: readonly (string | symbol)[]
  try { keys = Reflect.ownKeys(record) } catch { issues.push(issue(path, 'UNREADABLE_RECORD', 'record keys are not safely readable')); return }
  for (const key of keys) if (typeof key !== 'string' || !expected.includes(key)) issues.push(issue(`${path}.${String(key)}`, 'UNKNOWN_PROPERTY', 'unknown property'))
}
function strictArrayKeys(value: object, length: number, path: string, issues: CandidateIssue[]): void {
  let keys: readonly (string | symbol)[]
  try { keys = Reflect.ownKeys(value) } catch { issues.push(issue(path, 'UNREADABLE_ARRAY', 'array keys are not safely readable')); return }
  for (const key of keys) {
    if (key === 'length') continue
    if (typeof key !== 'string' || !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= length) issues.push(issue(`${path}.${String(key)}`, 'UNKNOWN_ARRAY_PROPERTY', 'arrays allow only length and dense numeric slots'))
  }
}
function arrayLength(value: object, path: string, issues: CandidateIssue[]): number | undefined {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, 'length')
    if (!descriptor || !Object.hasOwn(descriptor, 'value') || typeof descriptor.value !== 'number' || !Number.isSafeInteger(descriptor.value) || descriptor.value < 0) { issues.push(issue(`${path}.length`, 'OWN_DATA_REQUIRED', 'length must be an own data safe integer')); return undefined }
    return descriptor.value
  } catch { issues.push(issue(`${path}.length`, 'OWN_DATA_REQUIRED', 'length must be safely readable')); return undefined }
}
function parseSize(value: unknown, path: string, issues: CandidateIssue[]): PixelSize | undefined {
  const record = requiredRecord(value, path, issues); if (!record) return undefined
  exactKeys(record, ['width', 'height'], path, issues)
  const width = read(record, 'width', path, issues); const height = read(record, 'height', path, issues)
  if (typeof width !== 'number' || !Number.isSafeInteger(width) || width <= 0) issues.push(issue(`${path}.width`, 'INVALID_SIZE', 'must be a positive safe integer'))
  if (typeof height !== 'number' || !Number.isSafeInteger(height) || height <= 0) issues.push(issue(`${path}.height`, 'INVALID_SIZE', 'must be a positive safe integer'))
  return typeof width === 'number' && typeof height === 'number' && Number.isSafeInteger(width) && Number.isSafeInteger(height) && width > 0 && height > 0 ? { width, height } : undefined
}
function parseRect(value: unknown, path: string, issues: CandidateIssue[], size?: PixelSize): PixelRect | undefined {
  const record = requiredRecord(value, path, issues); if (!record) return undefined
  exactKeys(record, ['x', 'y', 'width', 'height'], path, issues)
  const x = read(record, 'x', path, issues); const y = read(record, 'y', path, issues); const width = read(record, 'width', path, issues); const height = read(record, 'height', path, issues)
  const validNumbers = [x, y, width, height].every((entry) => typeof entry === 'number' && Number.isFinite(entry))
  if (!validNumbers || typeof x !== 'number' || typeof y !== 'number' || typeof width !== 'number' || typeof height !== 'number' || x < 0 || y < 0 || width <= 0 || height <= 0 || !Number.isFinite(x + width) || !Number.isFinite(y + height)) {
    issues.push(issue(path, 'INVALID_RECT', 'must have finite non-negative coordinates and positive dimensions')); return undefined
  }
  const rect = { x, y, width, height }
  if (size) {
    try { validateProcessedBoundingBox(rect, size) } catch { issues.push(issue(path, 'OUT_OF_BOUNDS', 'must be contained in processedSize')) }
  }
  return rect
}
function parseTransform(value: unknown, issues: CandidateIssue[]): ProcessedImageTransform | undefined {
  const record = requiredRecord(value, 'processedImage', issues); if (!record) return undefined
  exactKeys(record, ['schemaVersion', 'sourceSize', 'normalizedSize', 'rotation', 'crop', 'redactions', 'processedSize'], 'processedImage', issues)
  const schemaVersion = read(record, 'schemaVersion', 'processedImage', issues); const sourceSize = parseSize(read(record, 'sourceSize', 'processedImage', issues), 'processedImage.sourceSize', issues)
  const normalizedSize = parseSize(read(record, 'normalizedSize', 'processedImage', issues), 'processedImage.normalizedSize', issues); const processedSize = parseSize(read(record, 'processedSize', 'processedImage', issues), 'processedImage.processedSize', issues)
  const rotation = read(record, 'rotation', 'processedImage', issues); if (schemaVersion !== 'IMAGE_TRANSFORM_V1') issues.push(issue('processedImage.schemaVersion', 'SCHEMA_VERSION', 'must be IMAGE_TRANSFORM_V1'))
  if (rotation !== 0 && rotation !== 90 && rotation !== 180 && rotation !== 270) issues.push(issue('processedImage.rotation', 'INVALID_ROTATION', 'must be 0, 90, 180, or 270'))
  const cropValue = read(record, 'crop', 'processedImage', issues); let crop: PixelRect | null = null
  if (cropValue !== null) crop = parseRect(cropValue, 'processedImage.crop', issues) ?? null
  const redactionsValue = read(record, 'redactions', 'processedImage', issues); const redactions: PixelRect[] = []
  if (!Array.isArray(redactionsValue)) issues.push(issue('processedImage.redactions', 'ARRAY_REQUIRED', 'must be an array'))
  else {
    const redactionsLength = arrayLength(redactionsValue, 'processedImage.redactions', issues)
    if (redactionsLength === undefined) return undefined
    if (redactionsLength > 4096) issues.push(issue('processedImage.redactions', 'MAX_REDACTIONS', 'must contain at most 4096 rectangles'))
    else { strictArrayKeys(redactionsValue, redactionsLength, 'processedImage.redactions', issues); for (let index = 0; index < redactionsLength; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(redactionsValue, String(index))
      if (!descriptor || !Object.hasOwn(descriptor, 'value')) { issues.push(issue(`processedImage.redactions[${index}]`, 'DENSE_ARRAY_REQUIRED', 'must be an own data slot')); continue }
      const rect = parseRect(descriptor.value, `processedImage.redactions[${index}]`, issues); if (rect) redactions.push(rect)
    } }
  }
  if (!sourceSize || !normalizedSize || !processedSize || (rotation !== 0 && rotation !== 90 && rotation !== 180 && rotation !== 270) || schemaVersion !== 'IMAGE_TRANSFORM_V1') return undefined
  return { schemaVersion: 'IMAGE_TRANSFORM_V1', sourceSize, normalizedSize, rotation: rotation as Rotation, crop, redactions, processedSize }
}
function validUuid(value: unknown): value is string { return isNonNilUuid(value) }
function validDate(value: string): boolean { if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false; const date = new Date(`${value}T00:00:00Z`); return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value }
function validOffsetDateTime(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:\d{2})$/.exec(value)
  if (!match) return false
  const year = Number(match[1]); const month = Number(match[2]); const day = Number(match[3]); const hour = Number(match[4]); const minute = Number(match[5]); const second = Number(match[6])
  if (month < 1 || month > 12 || day < 1 || hour > 23 || minute > 59 || second > 59) return false
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const monthDays = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  if (day > monthDays[month - 1]) return false
  const offset = match[8]
  if (offset !== 'Z') {
    const offsetHours = Number(offset.slice(1, 3)); const offsetMinutes = Number(offset.slice(4, 6))
    if (offsetHours > 14 || offsetMinutes > 59 || (offsetHours === 14 && offsetMinutes !== 0)) return false
  }
  return !Number.isNaN(Date.parse(value))
}
function validOdds(value: string): boolean { if (!/^(?:0|[1-9]\d*)(?:\.\d{1,4})?$/.test(value)) return false; const number = Number(value); return Number.isFinite(number) && number >= 1.01 && number <= 1000 && (!value.includes('.') || !value.endsWith('0')) }
function validValue(fieldName: string, value: string): boolean {
  if (value === '') return true
  if (value.trim() === '') return false
  if (fieldName === 'matchDate') return validDate(value)
  if (fieldName === 'kickoffTime') return validOffsetDateTime(value)
  if (fieldName === 'playType') return (PLAY_TYPES as readonly string[]).includes(value)
  if (fieldName === 'selection') return (SELECTIONS as readonly string[]).includes(value)
  if (fieldName === 'odds') return validOdds(value)
  return value.length >= 1 && value.length <= 128
}
function cloneField(field: OcrCandidateField): OcrCandidateField { return { ...field, ...(field.boundingBox ? { boundingBox: { ...field.boundingBox } } : {}) } }

export function validateCandidateBatch(input: unknown): CandidateValidationResult {
  const issues: CandidateIssue[] = []
  try {
    const record = requiredRecord(input, '$', issues)
    if (!record) return { valid: false, issues }
    exactKeys(record, ['schemaVersion', 'processedImage', 'fields'], '$', issues)
    const schemaVersion = read(record, 'schemaVersion', '$', issues); if (schemaVersion !== OCR_CANDIDATE_SCHEMA_VERSION) issues.push(issue('schemaVersion', 'SCHEMA_VERSION', 'must be OCR_CANDIDATE_V2'))
    const processedImage = parseTransform(read(record, 'processedImage', '$', issues), issues)
    if (processedImage) {
      try { validateProcessedImageTransform(processedImage) } catch { issues.push(issue('processedImage', 'INVALID_TRANSFORM', 'processedImage transform is invalid')) }
    }
    const fieldsValue = read(record, 'fields', '$', issues)
    const fieldsLength = Array.isArray(fieldsValue) ? arrayLength(fieldsValue, 'fields', issues) : undefined
    if (!Array.isArray(fieldsValue)) issues.push(issue('fields', 'ARRAY_REQUIRED', 'must be an array'))
    else if (fieldsLength === undefined) return { valid: false, issues }
    else if (fieldsLength > 256) { issues.push(issue('fields', 'MAX_FIELDS', 'must contain at most 256 fields')); return { valid: false, issues } }
    else strictArrayKeys(fieldsValue, fieldsLength, 'fields', issues)
    const fields: OcrCandidateField[] = []; const fieldIds = new Set<string>(); const tuples = new Set<string>(); const matchTypes = new Map<string, 'MATCH' | 'MARKET'>(); const matchKeys: string[] = []; const marketKeys: string[] = []; const marketRefs = new Map<string, { index: number; value: string }>()
    if (Array.isArray(fieldsValue) && fieldsLength !== undefined) for (let index = 0; index < fieldsLength; index += 1) {
      const path = `fields[${index}]`; const descriptor = Object.getOwnPropertyDescriptor(fieldsValue, String(index))
      if (!descriptor || !Object.hasOwn(descriptor, 'value')) { issues.push(issue(path, 'DENSE_ARRAY_REQUIRED', 'must be an own data slot')); continue }
      const item = requiredRecord(descriptor.value, path, issues); if (!item) continue
      exactKeys(item, ['fieldId', 'entityType', 'entityKey', 'fieldName', 'fieldValue', 'confidence', 'boundingBox'], path, issues)
      const fieldId = read(item, 'fieldId', path, issues); const entityType = read(item, 'entityType', path, issues); const entityKey = read(item, 'entityKey', path, issues); const fieldName = read(item, 'fieldName', path, issues); const fieldValue = read(item, 'fieldValue', path, issues); const confidence = read(item, 'confidence', path, issues)
      if (!validUuid(fieldId)) issues.push(issue(`${path}.fieldId`, 'UUID_REQUIRED', 'must be a non-nil UUID'))
      else if (fieldIds.has(fieldId.toLowerCase())) issues.push(issue(`${path}.fieldId`, 'DUPLICATE_FIELD_ID', 'must be unique'))
      else fieldIds.add(fieldId.toLowerCase())
      if (entityType !== 'MATCH' && entityType !== 'MARKET') issues.push(issue(`${path}.entityType`, 'INVALID_ENTITY_TYPE', 'must be MATCH or MARKET'))
      if (!validUuid(entityKey)) issues.push(issue(`${path}.entityKey`, 'UUID_REQUIRED', 'must be a non-nil UUID'))
      else {
        const key = entityKey.toLowerCase(); const prior = matchTypes.get(key); if (prior && prior !== entityType) issues.push(issue(`${path}.entityKey`, 'CROSS_ENTITY_UUID', 'UUID cannot identify both entity types')); else if (!prior && (entityType === 'MATCH' || entityType === 'MARKET')) matchTypes.set(key, entityType)
        if (entityType === 'MATCH' && !matchKeys.some((entry) => entry.toLowerCase() === key)) matchKeys.push(entityKey); if (entityType === 'MARKET' && !marketKeys.includes(key)) marketKeys.push(key)
      }
      const names = entityType === 'MATCH' ? MATCH_FIELDS : entityType === 'MARKET' ? MARKET_FIELDS : []
      if (typeof fieldName !== 'string' || !names.includes(fieldName as never)) issues.push(issue(`${path}.fieldName`, 'FIELD_WHITELIST', 'fieldName does not match entityType'))
      let fieldValueIsValid = false
      if (typeof fieldValue !== 'string') issues.push(issue(`${path}.fieldValue`, 'STRING_REQUIRED', 'must be a string'))
      else if (fieldValue.length > 512) issues.push(issue(`${path}.fieldValue`, 'MAX_VALUE', 'must contain at most 512 UTF-16 code units'))
      else fieldValueIsValid = validValue(typeof fieldName === 'string' ? fieldName : '', fieldValue)
      if (typeof confidence !== 'number' || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) issues.push(issue(`${path}.confidence`, 'CONFIDENCE_RANGE', 'must be finite and within [0,1]'))
      let boundingBox: PixelRect | undefined
      let bboxDescriptor: PropertyDescriptor | undefined
      try { bboxDescriptor = Object.getOwnPropertyDescriptor(item, 'boundingBox') } catch { issues.push(issue(`${path}.boundingBox`, 'OWN_DATA_REQUIRED', 'must be an own data property')) }
      if (bboxDescriptor && !Object.hasOwn(bboxDescriptor, 'value')) issues.push(issue(`${path}.boundingBox`, 'OWN_DATA_REQUIRED', 'must be an own data property'))
      else if (bboxDescriptor) boundingBox = parseRect(bboxDescriptor.value, `${path}.boundingBox`, issues, processedImage?.processedSize)
      if (typeof fieldName === 'string' && typeof fieldValue === 'string' && fieldValue.length <= 512 && names.includes(fieldName as never) && !fieldValueIsValid) issues.push(issue(`${path}.fieldValue`, 'INVALID_FIELD_VALUE', 'fieldValue is invalid for fieldName'))
      if (validUuid(entityKey) && typeof entityType === 'string' && typeof fieldName === 'string') { const tuple = `${entityType}:${entityKey.toLowerCase()}:${fieldName}`; if (tuples.has(tuple)) issues.push(issue(`${path}.fieldName`, 'DUPLICATE_TUPLE', 'field tuple must be unique')); tuples.add(tuple) }
      if (entityType === 'MARKET' && fieldName === 'matchRef' && typeof fieldValue === 'string' && fieldValue.length <= 512) { if (!fieldValue.trim()) issues.push(issue(`${path}.fieldValue`, 'MARKET_REF_REQUIRED', 'market matchRef must be nonblank')); else if (marketRefs.has((entityKey as string).toLowerCase())) issues.push(issue(`${path}.fieldValue`, 'CONFLICTING_MATCH_REF', 'market matchRef must be unique')); else marketRefs.set((entityKey as string).toLowerCase(), { index, value: fieldValue }) }
      if (validUuid(fieldId) && (entityType === 'MATCH' || entityType === 'MARKET') && validUuid(entityKey) && typeof fieldName === 'string' && typeof fieldValue === 'string' && typeof confidence === 'number' && Number.isFinite(confidence) && confidence >= 0 && confidence <= 1 && fieldValueIsValid) fields.push({ fieldId, entityType, entityKey, fieldName: fieldName as MatchFieldName | MarketFieldName, fieldValue, confidence, ...(boundingBox ? { boundingBox } : {}) })
    }
    const matchSet = new Set(matchKeys)
    const marketToMatch = new Map<string, string>()
    for (const entry of marketRefs.values()) { if (!validUuid(entry.value) || !matchSet.has(entry.value)) issues.push(issue(`fields[${entry.index}].fieldValue`, 'ORPHAN_MATCH_REF', 'market matchRef must identify a MATCH entity')); else { const marketField = fieldsValue && Array.isArray(fieldsValue) ? fieldsValue[entry.index] : undefined; const marketKey = plain(marketField) ? ownData(marketField, 'entityKey') : { ok: false as const }; if (marketKey.ok && typeof marketKey.value === 'string') { const matchKey = entry.value.toLowerCase(); if (marketToMatch.has(matchKey)) issues.push(issue(`fields[${entry.index}].entityKey`, 'MARKET_PER_MATCH', 'a MATCH may have at most one MARKET')); marketToMatch.set(matchKey, marketKey.value.toLowerCase()) } } }
    for (const marketKey of marketKeys) if (!marketRefs.has(marketKey.toLowerCase())) issues.push(issue('fields', 'MARKET_REF_REQUIRED', 'every MARKET must have exactly one matchRef'))
    if (issues.length || !processedImage || schemaVersion !== OCR_CANDIDATE_SCHEMA_VERSION || !Array.isArray(fieldsValue)) return { valid: false, issues }
    return { valid: true, value: { schemaVersion: OCR_CANDIDATE_SCHEMA_VERSION, processedImage: { ...processedImage, sourceSize: { ...processedImage.sourceSize }, normalizedSize: { ...processedImage.normalizedSize }, processedSize: { ...processedImage.processedSize }, crop: processedImage.crop ? { ...processedImage.crop } : null, redactions: processedImage.redactions.map((rect) => ({ ...rect })) }, fields: fields.map(cloneField) } }
  } catch { return { valid: false, issues: issues.length ? issues : [issue('$', 'UNSAFE_INPUT', 'input could not be safely validated')] } }
}

export interface DraftEvidence { fieldId: string; confidence: number; boundingBox?: PixelRect }
export interface DraftMatch { draftMatchKey: string; matchDate: string; league: string; homeTeam: string; awayTeam: string; kickoffTime: string; evidence: Partial<Record<MatchFieldName, DraftEvidence>> }
export interface DraftMarket { draftMarketKey: string; draftMatchKey: string; playType: string; selection: string; odds: string; evidence: Partial<Record<MarketFieldName, DraftEvidence>> }
export interface DraftSeed { matches: DraftMatch[]; markets: DraftMarket[] }
export type DraftSeedResult = { valid: true; value: DraftSeed } | { valid: false; issues: readonly CandidateIssue[] }
export function createDraftSeed(input: CandidateValidationResult): DraftSeedResult {
  if (!input.valid) return { valid: false, issues: input.issues }
  const matches = new Map<string, DraftMatch>(); const markets = new Map<string, DraftMarket>()
  for (const field of input.value.fields) {
    if (field.entityType === 'MATCH') {
      let match = matches.get(field.entityKey.toLowerCase()); if (!match) { match = { draftMatchKey: field.entityKey, matchDate: '', league: '', homeTeam: '', awayTeam: '', kickoffTime: '', evidence: {} }; matches.set(field.entityKey.toLowerCase(), match) }
      if (field.fieldName !== 'matchDate' && field.fieldName !== 'league' && field.fieldName !== 'homeTeam' && field.fieldName !== 'awayTeam' && field.fieldName !== 'kickoffTime') continue
      match[field.fieldName] = field.fieldValue; match.evidence[field.fieldName] = { fieldId: field.fieldId, confidence: field.confidence, ...(field.boundingBox ? { boundingBox: { ...field.boundingBox } } : {}) }
    } else {
      let market = markets.get(field.entityKey.toLowerCase()); if (!market) { market = { draftMarketKey: field.entityKey, draftMatchKey: '', playType: '', selection: '', odds: '', evidence: {} }; markets.set(field.entityKey.toLowerCase(), market) }
      if (field.fieldName === 'matchRef') { market.draftMatchKey = field.fieldValue; market.evidence.matchRef = { fieldId: field.fieldId, confidence: field.confidence, ...(field.boundingBox ? { boundingBox: { ...field.boundingBox } } : {}) } }
      else if (field.fieldName === 'playType' || field.fieldName === 'selection' || field.fieldName === 'odds') { market[field.fieldName] = field.fieldValue; market.evidence[field.fieldName] = { fieldId: field.fieldId, confidence: field.confidence, ...(field.boundingBox ? { boundingBox: { ...field.boundingBox } } : {}) } }
    }
  }
  return { valid: true, value: { matches: [...matches.values()], markets: [...markets.values()] } }
}
