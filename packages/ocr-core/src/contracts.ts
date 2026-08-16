export const IMAGE_POLICY = {
  acceptedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
  maxBytes: 10 * 1024 * 1024,
  maxPixels: 25_000_000,
  maxOcrEdge: 2_400,
} as const

export const OCR_CANDIDATE_SCHEMA_VERSION = 'OCR_CANDIDATE_V2' as const

export const SOURCE_DECLARATIONS = ['FICTIONAL_SAMPLE', 'USER_OWNED_AUTHORIZED'] as const

export const PLAY_TYPES = ['WIN_DRAW_LOSS'] as const

export const SELECTIONS = ['HOME_WIN', 'DRAW', 'AWAY_WIN'] as const

export type AcceptedMimeType = (typeof IMAGE_POLICY.acceptedMimeTypes)[number]
export type OcrCandidateSchemaVersion = typeof OCR_CANDIDATE_SCHEMA_VERSION
export type SourceDeclaration = (typeof SOURCE_DECLARATIONS)[number]
export type PlayType = (typeof PLAY_TYPES)[number]
export type Selection = (typeof SELECTIONS)[number]
