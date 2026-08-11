export interface PublicResultProviderSyncPayload {
  providerKey: string;
  requestedBy: string;
}

export interface PublicResultSnapshot {
  resultSnapshotId: string;
  matchId: string;
  matchDate: string;
  league: string;
  homeTeam: string;
  awayTeam: string;
  kickoffTime: string;
  homeScore: number;
  awayScore: number;
  resultStatus: string;
  sourceName: string;
  sourceUrl: string;
  sourceLicense: string;
  fetchedAt: string;
  confidence: number;
}

export interface PublicResultProviderStatus {
  providerKey: string;
  providerName: string;
  providerType: string;
  providerEnabled: boolean;
  syncStatus: string;
  snapshotCount: number;
  lastFetchedAt: string | null;
  lastConfidence: number | null;
  sourceName: string;
  sourceUrl: string;
  sourceLicense: string;
  dataPolicy: string;
  complianceNotice: string;
  snapshots: PublicResultSnapshot[];
}
