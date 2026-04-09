import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabase';
import type { User, Session } from '@supabase/supabase-js';
import type { UserProfile } from '../types/adrastea.types';

export interface AuthUser {
  uid: string;
  displayName: string;
  avatarUrl: string | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  profile: UserProfile | null;
  loading: boolean;
  onboarded: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  updateProfile: (data: Partial<Pick<{ display_name: string; avatar_url: string | null }, 'display_name' | 'avatar_url'>>) => Promise<void>;
  token: string | null;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

function authUserFromSupabase(user: User): AuthUser {
  return {
    uid: user.id,
    displayName: user.user_metadata?.full_name ?? user.user_metadata?.name ?? 'ユーザー',
    avatarUrl: user.user_metadata?.avatar_url ?? null,
  };
}

function profileFromSupabase(user: User): UserProfile {
  return {
    uid: user.id,
    display_name: user.user_metadata?.full_name ?? user.user_metadata?.name ?? 'ユーザー',
    avatar_url: user.user_metadata?.avatar_url ?? null,
    created_at: new Date(user.created_at).getTime(),
    updated_at: Date.now(),
  };
}

/** ログイン時に public.users の display_name / avatar_url を auth メタデータから同期 */
async function syncUserProfile(user: User) {
  const displayName = user.user_metadata?.full_name ?? user.user_metadata?.name ?? 'ユーザー';
  const googleAvatarUrl = user.user_metadata?.avatar_url ?? null;

  // public.users の既存 avatar_url を確認
  const { data: existing } = await supabase
    .from('users')
    .select('avatar_url')
    .eq('id', user.id)
    .single();

  // 既に R2 URL が設定されていれば Google URL で上書きしない
  const currentIsR2 = existing?.avatar_url?.includes('workers.dev') ?? false;
  const avatarUrl = currentIsR2 ? existing!.avatar_url : googleAvatarUrl;

  await supabase.from('users').update({
    display_name: displayName,
    avatar_url: avatarUrl,
    updated_at: Date.now(),
  }).eq('id', user.id);
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 初回セッション取得
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
      if (session?.user) syncUserProfile(session.user);
    });

    // セッション変化を購読
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setLoading(false);
      if (session?.user) syncUserProfile(session.user);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = useCallback(async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin + window.location.pathname + window.location.search,
      },
    });
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const updateProfile = useCallback(async (data: Partial<Pick<{ display_name: string; avatar_url: string | null }, 'display_name' | 'avatar_url'>>) => {
    const updates: Record<string, unknown> = {};
    if (data.display_name !== undefined) updates.full_name = data.display_name;
    if (data.avatar_url !== undefined) updates.avatar_url = data.avatar_url;

    await supabase.auth.updateUser({
      data: updates,
    });

    // users テーブルも更新
    if (session?.user) {
      const now = Date.now();
      await supabase.from('users').update({
        display_name: data.display_name ?? session.user.user_metadata?.full_name ?? 'ユーザー',
        avatar_url: data.avatar_url ?? session.user.user_metadata?.avatar_url ?? null,
        updated_at: now,
      }).eq('id', session.user.id);
    }
  }, [session]);

  const supabaseUser = session?.user ?? null;
  const user = supabaseUser ? authUserFromSupabase(supabaseUser) : null;
  const profile = supabaseUser ? profileFromSupabase(supabaseUser) : null;
  const onboarded = supabaseUser?.user_metadata?.onboarded ?? false;
  const token = session?.access_token || null;

  return (
    <AuthContext.Provider value={{
      user,
      profile,
      loading,
      onboarded,
      signIn,
      signOut,
      updateProfile,
      token,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
