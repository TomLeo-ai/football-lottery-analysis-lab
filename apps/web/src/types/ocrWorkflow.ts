export interface ScreenshotTask {
  taskId: string;
  fileName: string;
  contentType: string;
  fileSize: number;
  sampleLabel: string;
  status: 'WAITING_LOCAL_OCR';
  serverOcrEnabled: boolean;
  privacyPolicy: string;
  createdAt: string;
}

export interface OcrExtractedField {
  fieldName: string;
  fieldValue: string;
  confidence: number;
  sourceRegion: string;
}

export interface OcrTask {
  ocrTaskId: string;
  screenshotTaskId: string;
  ocrProvider: string;
  rawText?: string;
  status: 'WAITING_USER_CONFIRMATION';
  analysisAllowed: boolean;
  fields: OcrExtractedField[];
  parsedAt?: string;
}

export interface ConfirmedMatch {
  matchId: string;
  matchDate: string;
  league: string;
  homeTeam: string;
  awayTeam: string;
  kickoffTime: string;
}

export interface ConfirmedMarket {
  marketId: string;
  matchId: string;
  playType: string;
  selection: string;
  odds: number;
}

export interface UserConfirmedSnapshot {
  snapshotId: string;
  ocrTaskId: string;
  sourceType: 'USER_SCREENSHOT_CONFIRMED';
  snapshotStatus: 'CONFIRMED';
  analysisAllowed: boolean;
  riskPreference: string;
  budgetAmount: number;
  currency: string;
  matches: ConfirmedMatch[];
  markets: ConfirmedMarket[];
  confirmedAt?: string;
}

export interface CreateScreenshotTaskPayload {
  fileName: string;
  contentType: string;
  fileSize: number;
  sampleLabel: string;
}

export interface ParseLocalOcrPayload {
  screenshotTaskId: string;
  ocrProvider: string;
  rawText: string;
  fields: OcrExtractedField[];
}

export interface ConfirmOcrReviewPayload {
  ocrTaskId: string;
  riskPreference: string;
  budgetAmount: number;
  currency: string;
  matches: ConfirmedMatch[];
  markets: ConfirmedMarket[];
}

