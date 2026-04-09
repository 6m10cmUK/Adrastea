import { useState, useRef, useCallback, useEffect } from 'react';

// --- Types ---

interface FieldDef {
  /** true: 500ms debounce で onDebounceSave 経由保存（テキスト、数値入力向け） */
  debounce?: boolean;
  /** true: 変更即座に onImmediateUpdate 呼び出し（トグル、画像選択向け） */
  immediate?: boolean;
  /** デフォルト値（entity が null/undefined のとき） */
  defaultValue?: unknown;
}

interface UseEntityEditorOptions<T extends Record<string, unknown>> {
  /** 現在のエンティティ（Supabase の値）。null=新規、undefined=未読み込み */
  entity: T | null | undefined;
  /** エンティティID。null=新規 */
  entityId: string | null;
  /** フィールド定義 */
  fields: { [K in keyof T]?: FieldDef };
  /** setPendingEdit に渡す type ('object' | 'scene') */
  editType: string;
  /** debounce 保存時のコールバック。ctx.setPendingEdit を渡す */
  onDebounceSave: (key: string, data: { type: string; id: string | null; data: Partial<T> }) => void;
  /** immediate 更新時のコールバック。updateObject/updateScene を渡す */
  onImmediateUpdate: (id: string, data: Partial<T>) => Promise<void>;
  /** debounce 保存時にデータ全体を構築する関数 */
  buildSaveData: (state: T) => Partial<T>;
  /** debounce のミリ秒。デフォルト 500 */
  debounceMs?: number;
}

interface UseEntityEditorReturn<T> {
  /** マージ済み state（defaults + entity + ローカル編集）。UI はこれを読む */
  state: T;
  /** フィールド更新。debounce/immediate を自動判定 */
  set: <K extends keyof T>(key: K, value: T[K], opts?: { localOnly?: boolean }) => void;
  /** 複数フィールド一括更新 */
  setMany: (updates: Partial<T>) => void;
  /** 未保存の debounce 編集があるか */
  isDirty: boolean;
  /** debounce 待機中の編集を即座に保存 */
  flush: () => void;
}

// --- Implementation ---

export function useEntityEditor<T extends Record<string, unknown>>(
  opts: UseEntityEditorOptions<T>
): UseEntityEditorReturn<T> {
  const {
    entity,
    entityId,
    fields,
    debounceMs = 500,
  } = opts;

  // ローカル編集値（entity との差分のみ保持）
  const [localEdits, setLocalEdits] = useState<Partial<T>>({});

  // ローカル編集値の ref 版（flush 時に参照）
  const localEditsRef = useRef<Partial<T>>({});

  // debounce 中のフィールドを追跡（外部同期のブロック用）
  const debouncingFieldsRef = useRef<Set<string>>(new Set());
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 最新の opts を ref で保持（useEffect/useCallback の deps を減らす）
  const optsRef = useRef(opts);
  optsRef.current = opts;

  // --- デフォルト値から初期 state を構築 ---
  const defaults = useRef<Partial<T>>({});
  // fields が変わったときだけ再計算（通常は一度のみ）
  const fieldsRef = useRef(fields);
  if (fieldsRef.current !== fields) {
    fieldsRef.current = fields;
    const d: Record<string, unknown> = {};
    for (const [key, def] of Object.entries(fields)) {
      if (def && 'defaultValue' in def) {
        d[key] = def.defaultValue;
      }
    }
    defaults.current = d as Partial<T>;
  }
  // 初回
  if (Object.keys(defaults.current).length === 0) {
    const d: Record<string, unknown> = {};
    for (const [key, def] of Object.entries(fields)) {
      if (def && 'defaultValue' in def) {
        d[key] = def.defaultValue;
      }
    }
    defaults.current = d as Partial<T>;
  }

  // --- マージ済み state ---
  // 優先度: localEdits > entity > defaults
  const state = { ...defaults.current, ...(entity ?? {}), ...localEdits } as T;

  // --- localEdits と localEditsRef を同期 ---
  useEffect(() => {
    localEditsRef.current = localEdits;
  });

  // --- 外部同期: entity が変わったら、debounce 中でないフィールドを同期 ---
  const prevEntityRef = useRef<T | null | undefined>(undefined);
  useEffect(() => {
    if (entity === undefined || entity === null) {
      prevEntityRef.current = entity;
      return;
    }
    if (prevEntityRef.current === entity) return;
    prevEntityRef.current = entity;

    // debounce 中のフィールドはスキップ
    setLocalEdits(prev => {
      const next = { ...prev };
      let changed = false;
      for (const key of Object.keys(next)) {
        if (!debouncingFieldsRef.current.has(key)) {
          delete next[key];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [entity]);

  // --- entity が切り替わったら（別オブジェクト選択）localEdits をリセット ---
  const prevEntityIdRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (prevEntityIdRef.current !== undefined && prevEntityIdRef.current !== entityId) {
      setLocalEdits({});
      debouncingFieldsRef.current.clear();
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    }
    prevEntityIdRef.current = entityId;
  }, [entityId]);

  // --- debounce save を発火 ---
  const scheduleDebounceSave = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null;
      const currentOpts = optsRef.current;
      // localEdits の最新値を使って buildSaveData を呼ぶ
      // state は stale になりうるので、直接 setLocalEdits の中身を使う
      // → setLocalEdits で値を取得するトリックは使えないので、
      //   state ref を使う
      const currentState = {
        ...defaults.current,
        ...(currentOpts.entity ?? {}),
      } as T;
      // localEdits の最新値を反映するため、setState callback で取得
      setLocalEdits(prev => {
        const merged = { ...currentState, ...prev } as T;
        const saveData = currentOpts.buildSaveData(merged);
        const key = `${currentOpts.editType}:${currentOpts.entityId ?? 'new'}`;
        currentOpts.onDebounceSave(key, {
          type: currentOpts.editType,
          id: currentOpts.entityId,
          data: saveData,
        });
        // debouncing フラグをクリア
        debouncingFieldsRef.current.clear();
        return prev; // state は変えない
      });
    }, debounceMs);
  }, [debounceMs]);

  // --- set: 単一フィールド更新 ---
  // localOnly: true → ローカル反映のみ（通信なし、entity変更からの保護あり）
  const set: <K extends keyof T>(key: K, value: T[K], opts?: { localOnly?: boolean }) => void = useCallback((key: any, value: any, opts?: { localOnly?: boolean }) => {
    // ローカル state 更新
    setLocalEdits(prev => ({ ...prev, [key]: value }));

    if (opts?.localOnly) {
      // ドラッグ中: ローカルのみ。entity 変更時のクリアから保護
      debouncingFieldsRef.current.add(key as string);
      return;
    }

    const fieldDef = optsRef.current.fields[key];
    if (fieldDef?.immediate && optsRef.current.entityId) {
      // immediate: Supabase に直接書き込み
      optsRef.current.onImmediateUpdate(
        optsRef.current.entityId,
        { [key]: value } as unknown as Partial<T>
      );
    } else if (fieldDef?.debounce) {
      // debounce: タイマーリセット
      debouncingFieldsRef.current.add(key as string);
      scheduleDebounceSave();
    }
    // どちらでもない場合: ローカル state のみ（手動save用途）
  }, [scheduleDebounceSave]);

  // --- setMany: 複数フィールド一括更新 ---
  const setMany = useCallback((updates: Partial<T>) => {
    setLocalEdits(prev => ({ ...prev, ...updates }));

    let hasDebounce = false;
    const immediateUpdates: Partial<T> = {};

    for (const [key, value] of Object.entries(updates)) {
      const fieldDef = optsRef.current.fields[key as keyof T];
      if (fieldDef?.immediate && optsRef.current.entityId) {
        (immediateUpdates as Record<string, unknown>)[key] = value;
      } else if (fieldDef?.debounce) {
        debouncingFieldsRef.current.add(key);
        hasDebounce = true;
      }
    }

    // immediate フィールドをまとめて1回で送信
    if (Object.keys(immediateUpdates).length > 0 && optsRef.current.entityId) {
      optsRef.current.onImmediateUpdate(optsRef.current.entityId, immediateUpdates);
    }

    if (hasDebounce) {
      scheduleDebounceSave();
    }
  }, [scheduleDebounceSave]);

  // --- isDirty ---
  const isDirty = Object.keys(localEdits).length > 0;

  // --- flush: debounce 待機中の編集を即座に保存 ---
  const flush = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    if (debouncingFieldsRef.current.size === 0) return;

    const currentOpts = optsRef.current;
    const currentState = {
      ...defaults.current,
      ...(currentOpts.entity ?? {}),
      ...localEditsRef.current,
    } as T;
    const saveData = currentOpts.buildSaveData(currentState);
    const key = `${currentOpts.editType}:${currentOpts.entityId ?? 'new'}`;
    currentOpts.onDebounceSave(key, {
      type: currentOpts.editType,
      id: currentOpts.entityId,
      data: saveData,
    });
    debouncingFieldsRef.current.clear();
  }, []);

  // --- cleanup ---
  useEffect(() => {
    return () => {
      flush();
    };
  }, [flush]);

  return { state, set, setMany, isDirty, flush };
}
