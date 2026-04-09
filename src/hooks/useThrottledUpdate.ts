import { useRef, useCallback } from 'react';

/**
 * Leading-edge throttle: 最初の呼び出しは即実行、以降 intervalMs は無視。
 * トグル系のUI操作（目アイコン等）の連打防止に使う。
 */
export function useThrottledCallback<T extends (...args: any[]) => any>(
  callback: T,
  intervalMs = 200,
): T {
  const lastCalledRef = useRef(0);
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  return useCallback((...args: any[]) => {
    const now = Date.now();
    if (now - lastCalledRef.current < intervalMs) return;
    lastCalledRef.current = now;
    return callbackRef.current(...args);
  }, [intervalMs]) as unknown as T;
}
