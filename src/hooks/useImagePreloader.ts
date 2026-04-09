import { useEffect, useRef } from 'react';

const MAX_CONCURRENT = 5;

export function useImagePreloader(urls: (string | null | undefined)[]) {
  const loadedRef = useRef<Set<string>>(new Set());
  const activeRef = useRef(0);
  const queueRef = useRef<string[]>([]);
  const unmountedRef = useRef(false);

  useEffect(() => {
    unmountedRef.current = false;
    const newUrls = urls.filter((u): u is string => !!u && !loadedRef.current.has(u));
    queueRef.current.push(...newUrls);
    processQueue();
    return () => {
      unmountedRef.current = true;
    };
  }, [urls]);

  function processQueue() {
    while (activeRef.current < MAX_CONCURRENT && queueRef.current.length > 0) {
      const url = queueRef.current.shift()!;
      if (loadedRef.current.has(url)) {
        processQueue();
        return;
      }
      loadedRef.current.add(url);
      activeRef.current++;
      const img = new Image();
      img.onload = img.onerror = () => {
        activeRef.current--;
        if (!unmountedRef.current) {
          processQueue();
        }
      };
      img.src = url;
    }
  }
}
