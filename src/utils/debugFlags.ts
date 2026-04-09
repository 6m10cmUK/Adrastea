/** Adrastea の Supabase Realtime / ルーム状態のコンソールデバッグ */
export function isAdrasteaRealtimeDebug(): boolean {
  return (
    import.meta.env.DEV ||
    import.meta.env.VITE_DEBUG_REALTIME === 'true'
  );
}

/** Adrastea の Supabase クエリ・RPC 通信のコンソールデバッグ */
export function isAdrasteaQueryDebug(): boolean {
  return (
    import.meta.env.DEV ||
    import.meta.env.VITE_DEBUG_QUERY === 'true'
  );
}

/** レイヤーパネル sort_order / localOrderOverride の調査用（コンソールフィルタ: LayerSortDebug）。DEV では常に有効。本番ビルドでだけ見たいときは VITE_DEBUG_LAYER_SORT=true */
export function isLayerSortDebug(): boolean {
  return (
    import.meta.env.DEV ||
    import.meta.env.VITE_DEBUG_LAYER_SORT === 'true'
  );
}
