export interface OfficialLink {
  id: string;
  name: string;
  url: string;
  purpose: string;
  region: string;
  target: '_blank';
  rel: 'noopener noreferrer';
  nonOfficialNotice: string;
  dataPolicy: string;
  updatedAt: string;
}

export interface ApiResult<T> {
  code: number;
  msg: string;
  data: T;
}

