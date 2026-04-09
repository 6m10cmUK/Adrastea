export interface Env {
  R2_BUCKET: R2Bucket;
  DB: D1Database;
  ALLOWED_ORIGINS: string;
  ADMIN_USER_IDS?: string;
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  ARCHIVE_SECRET?: string;
}

export interface AuthUser {
  uid: string;
  displayName: string;
  avatarUrl: string | null;
  isGuest?: boolean;
}
