import { useCallback, useMemo, useRef } from 'react';
import { useSupabaseQuery, useSupabaseMutation } from './useSupabaseQuery';
import type { Cutin } from '../types/adrastea.types';
import type { CutinsInject } from '../types/adrastea-persistence';
import { genId } from '../utils/id';
import { omitKeys } from '../utils/object';

export type OnRoomUpdate = (updates: Record<string, unknown>) => void;

export function useCutins(
  roomId: string,
  enabled = true,
  onRoomUpdate?: OnRoomUpdate,
  options?: { inject?: CutinsInject; initialData?: unknown[] }
) {
  const { inject, initialData } = options ?? {};
  const injectRef = useRef(inject);
  injectRef.current = inject;

  const cutinsQuery = useSupabaseQuery<Cutin>({
    table: 'cutins',
    columns: 'id,room_id,name,image_asset_id,text,animation,duration,text_color,background_color,sort_order,created_at,updated_at',
    roomId,
    filter: (q) => q.eq('room_id', roomId),
    enabled: !inject && enabled,
    initialData,
  });
  const cutinsData = cutinsQuery.data;
  const cutinsMutation = useSupabaseMutation<Cutin>('cutins', cutinsQuery.setData);

  const loading = inject ? false : cutinsQuery.loading;
  const cutins: Cutin[] = useMemo(() => {
    if (inject) return inject.data;
    return (cutinsData ?? []).map((c) => ({
      id: c.id, room_id: c.room_id, name: c.name,
      image_asset_id: c.image_asset_id ?? null, text: c.text,
      animation: c.animation as Cutin['animation'],
      duration: c.duration, text_color: c.text_color,
      background_color: c.background_color,
      sort_order: c.sort_order, created_at: c.created_at, updated_at: c.updated_at,
    } as Cutin));
  }, [inject, cutinsData]);

  const addCutin = useCallback(
    async (data: Partial<Omit<Cutin, 'id' | 'room_id'>>): Promise<Cutin> => {
      const inj = injectRef.current;
      const id = (data as { id?: string }).id ?? genId();
      const now = Date.now();
      const newCutin: Cutin = {
        id, room_id: roomId,
        name: data.name ?? '新規カットイン',
        image_asset_id: data.image_asset_id ?? null, text: data.text ?? '',
        animation: data.animation ?? 'slide',
        duration: data.duration ?? 3000,
        text_color: data.text_color ?? '#ffffff',
        background_color: data.background_color ?? 'rgba(0,0,0,0.8)',
        sort_order: data.sort_order ?? cutins.length,
        created_at: now, updated_at: now,
      };
      try {
        if (inj) {
          await inj.create(newCutin);
        } else {
          await cutinsMutation.insert(newCutin);
        }
      } catch (err) {
        console.error('カットイン作成失敗:', err);
        throw err;
      }
      return newCutin;
    },
    [roomId, cutins.length, cutinsMutation]
  );

  const updateCutin = useCallback(
    async (cutinId: string, updates: Partial<Cutin>): Promise<void> => {
      const inj = injectRef.current;
      try {
        if (inj) {
          await inj.update(cutinId, updates);
        } else {
          const rest = omitKeys(updates as Cutin, ['id', 'room_id', 'created_at', 'updated_at']);
          await cutinsMutation.update(cutinId, rest as Partial<Cutin>);
        }
      } catch (err) {
        console.error('カットイン更新失敗:', err);
        throw err;
      }
    },
    [cutinsMutation]
  );

  const removeCutin = useCallback(
    async (cutinId: string): Promise<void> => {
      const inj = injectRef.current;
      try {
        if (inj) {
          await inj.remove(cutinId);
        } else {
          await cutinsMutation.remove(cutinId);
        }
      } catch (err) {
        console.error('カットイン削除失敗:', err);
        throw err;
      }
    },
    [cutinsMutation]
  );

  const triggerCutin = useCallback(
    (cutinId: string) => {
      const inj = injectRef.current;
      if (inj) {
        inj.triggerCutin(cutinId);
      } else {
        onRoomUpdate?.({ active_cutin: { cutin_id: cutinId, triggered_at: Date.now() } });
      }
    },
    [onRoomUpdate]
  );

  const clearCutin = useCallback(() => {
    const inj = injectRef.current;
    if (inj) {
      inj.clearCutin();
    } else {
      onRoomUpdate?.({ active_cutin: null });
    }
  }, [onRoomUpdate]);

  const reorderCutins = useCallback(
    async (orderedIds: string[]): Promise<void> => {
      const inj = injectRef.current;
      const updates = orderedIds.map((id, i) => ({ id, sort_order: i }));
      try {
        if (inj) {
          await inj.reorder(updates);
        } else {
          await cutinsMutation.reorder(orderedIds);
        }
      } catch (err) {
        console.error('カットイン並べ替え失敗:', err);
        throw err;
      }
    },
    [cutinsMutation]
  );

  return { cutins, loading, addCutin, updateCutin, removeCutin, reorderCutins, triggerCutin, clearCutin };
}
