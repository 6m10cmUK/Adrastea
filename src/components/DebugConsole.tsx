import { useState, useEffect, useRef, useCallback } from 'react';
import { theme } from '../styles/theme';
import { Trash2, Copy } from 'lucide-react';
import { Tooltip } from './ui';

interface LogEntry {
  level: 'log' | 'warn' | 'error' | 'info';
  args: string;
  timestamp: number;
}

const MAX_LOGS = 200;

// グローバルログバッファ（コンポーネント外で保持）
const logBuffer: LogEntry[] = [];
const listeners = new Set<() => void>();

function pushLog(level: LogEntry['level'], args: unknown[]) {
  const str = args.map(a => {
    if (a instanceof Error) return `${a.message}\n${a.stack ?? ''}`;
    if (typeof a === 'object') try { return JSON.stringify(a, null, 1); } catch { return String(a); }
    return String(a);
  }).join(' ');
  logBuffer.push({ level, args: str, timestamp: Date.now() });
  if (logBuffer.length > MAX_LOGS) logBuffer.splice(0, logBuffer.length - MAX_LOGS);
  // レンダー中に setState が走らないよう遅延（React「Cannot update while rendering」対策）
  listeners.forEach(fn => queueMicrotask(fn));
}

// console をフック
let hooked = false;
function hookConsole() {
  if (hooked) return;
  hooked = true;
  const orig = {
    log: console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    info: console.info.bind(console),
  };
  console.log = (...args: unknown[]) => { orig.log(...args); pushLog('log', args); };
  console.warn = (...args: unknown[]) => { orig.warn(...args); pushLog('warn', args); };
  console.error = (...args: unknown[]) => { orig.error(...args); pushLog('error', args); };
  console.info = (...args: unknown[]) => { orig.info(...args); pushLog('info', args); };

  // unhandled errors
  window.addEventListener('error', (e) => pushLog('error', [`[Uncaught] ${e.message} at ${e.filename}:${e.lineno}`]));
  window.addEventListener('unhandledrejection', (e) => pushLog('error', [`[UnhandledRejection] ${e.reason}`]));
}

hookConsole();

const LEVEL_COLORS: Record<LogEntry['level'], string> = {
  log: theme.textSecondary,
  info: '#60a5fa',
  warn: '#fbbf24',
  error: '#f87171',
};

export function DebugConsoleContent() {
  const [tick, setTick] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [filter, setFilter] = useState<LogEntry['level'] | 'all'>('all');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const listener = () => setTick(t => t + 1);
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, []);

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [autoScroll, tick]);

  const handleClear = useCallback(() => {
    logBuffer.length = 0;
    setTick(t => t + 1);
  }, []);

  const filtered = filter === 'all' ? logBuffer : logBuffer.filter(l => l.level === filter);

  const handleCopy = useCallback(() => {
    const text = filtered.map(e =>
      `${new Date(e.timestamp).toLocaleTimeString()} [${e.level}] ${e.args}`
    ).join('\n');
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    } else {
      // non-secure context fallback
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [filtered]);

  return (
    <div style={{
      background: theme.bgBase,
      width: '100%', height: '100%',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* ヘッダー */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 12px', borderBottom: `1px solid ${theme.border}`,
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ color: theme.textPrimary, fontSize: '13px', fontWeight: 600 }}>Debug Console</span>
          {(['all', 'error', 'warn', 'log', 'info'] as const).map(lv => (
            <button
              key={lv}
              onClick={() => setFilter(lv)}
              style={{
                background: filter === lv ? theme.accent : 'transparent',
                border: `1px solid ${filter === lv ? theme.accent : theme.border}`,
                color: filter === lv ? '#fff' : theme.textSecondary,
                fontSize: '10px', padding: '1px 6px', cursor: 'pointer', borderRadius: '2px',
              }}
            >
              {lv === 'all' ? 'All' : lv} {lv === 'all' ? `(${logBuffer.length})` : `(${logBuffer.filter(l => l.level === lv).length})`}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <Tooltip label="全コピー">
            <button onClick={handleCopy} style={{ background: 'transparent', border: 'none', color: copied ? '#4ade80' : theme.textSecondary, cursor: 'pointer' }}>
              <Copy size={14} />
            </button>
          </Tooltip>
          <Tooltip label="クリア">
            <button onClick={handleClear} style={{ background: 'transparent', border: 'none', color: theme.textSecondary, cursor: 'pointer' }}>
              <Trash2 size={14} />
            </button>
          </Tooltip>
        </div>
      </div>

      {/* ログ本体 */}
      <div
        ref={scrollRef}
        onScroll={() => {
          if (!scrollRef.current) return;
          const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
          setAutoScroll(scrollHeight - scrollTop - clientHeight < 30);
        }}
        style={{
          flex: 1, overflow: 'auto', padding: '4px 0',
          fontFamily: 'monospace', fontSize: '11px', lineHeight: '1.5',
        }}
      >
        {filtered.length === 0 && (
          <div style={{ color: theme.textMuted, padding: '12px', textAlign: 'center' }}>ログなし</div>
        )}
        {filtered.map((entry, i) => (
          <div
            key={i}
            style={{
              padding: '1px 12px',
              color: LEVEL_COLORS[entry.level],
              borderBottom: '1px solid rgba(255,255,255,0.03)',
              whiteSpace: 'pre-wrap', wordBreak: 'break-all',
            }}
          >
            <span style={{ color: theme.textMuted, marginRight: '6px' }}>
              {new Date(entry.timestamp).toLocaleTimeString()}
            </span>
            {entry.args}
          </div>
        ))}
      </div>
    </div>
  );
}
