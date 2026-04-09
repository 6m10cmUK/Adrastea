// サーバー状態管理に関する型定義

export type ServerStatus = 'checking' | 'online' | 'offline';

export interface ServerHealthResponse {
  status: 'ok';
  message: string;
}

export interface ServerError {
  detail: string;
  status?: number;
}