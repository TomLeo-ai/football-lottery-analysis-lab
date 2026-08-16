import { describe, expect, it } from 'vitest'
import {
  IMAGE_POLICY,
  OCR_CANDIDATE_SCHEMA_VERSION,
  PLAY_TYPES,
  SELECTIONS,
  SOURCE_DECLARATIONS,
} from './index'

describe('OCR public contracts', () => {
  it('locks the v2 image and market policy', () => {
    expect(IMAGE_POLICY).toEqual({
      acceptedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
      maxBytes: 10 * 1024 * 1024,
      maxPixels: 25_000_000,
      maxOcrEdge: 2_400,
    })
    expect(OCR_CANDIDATE_SCHEMA_VERSION).toBe('OCR_CANDIDATE_V2')
    expect(SOURCE_DECLARATIONS).toEqual(['FICTIONAL_SAMPLE', 'USER_OWNED_AUTHORIZED'])
    expect(PLAY_TYPES).toEqual(['WIN_DRAW_LOSS'])
    expect(SELECTIONS).toEqual(['HOME_WIN', 'DRAW', 'AWAY_WIN'])
  })
})
