import { useRef, useCallback, useState } from 'react';
import type { UndoEntry } from '../utils/undoDiff';

const MAX_STACK_SIZE = 50;

export interface UndoRedoHandle {
  push: (entry: UndoEntry) => void;
  undo: () => UndoEntry | null;
  redo: () => UndoEntry | null;
  clear: () => void;
  canUndo: boolean;
  canRedo: boolean;
  isOperatingRef: React.MutableRefObject<boolean>;
}

export function useUndoRedo(): UndoRedoHandle {
  const undoStackRef = useRef<UndoEntry[]>([]);
  const redoStackRef = useRef<UndoEntry[]>([]);
  const isOperatingRef = useRef(false);
  const [version, setVersion] = useState(0);

  const push = useCallback((entry: UndoEntry) => {
    if (isOperatingRef.current) return;
    undoStackRef.current.push(entry);
    if (undoStackRef.current.length > MAX_STACK_SIZE) {
      undoStackRef.current.shift();
    }
    redoStackRef.current = [];
    setVersion(v => v + 1);
  }, []);

  const undo = useCallback((): UndoEntry | null => {
    const entry = undoStackRef.current.pop() ?? null;
    if (entry) {
      redoStackRef.current.push(entry);
      setVersion(v => v + 1);
    }
    return entry;
  }, []);

  const redo = useCallback((): UndoEntry | null => {
    const entry = redoStackRef.current.pop() ?? null;
    if (entry) {
      undoStackRef.current.push(entry);
      setVersion(v => v + 1);
    }
    return entry;
  }, []);

  const clear = useCallback(() => {
    undoStackRef.current = [];
    redoStackRef.current = [];
    setVersion(v => v + 1);
  }, []);

  return {
    push,
    undo,
    redo,
    clear,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    canUndo: version >= 0 && undoStackRef.current.length > 0,
    canRedo: version >= 0 && redoStackRef.current.length > 0,
    isOperatingRef,
  };
}
