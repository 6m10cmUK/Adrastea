import { useState } from 'react';
import { useAdrasteaContext } from '../contexts/AdrasteaContext';
import { theme } from '../styles/theme';
import { Music } from 'lucide-react';

export function BgmMiniPlayer() {
  const { bgms } = useAdrasteaContext();
  const playingTracks = bgms.filter(t => t.is_playing && !t.is_paused);
  const isPlaying = playingTracks.length > 0;
  const [showTitles, setShowTitles] = useState(false);

  return (
    <div
      style={{ position: 'relative', display: 'inline-flex' }}
      onMouseEnter={() => setShowTitles(true)}
      onMouseLeave={() => setShowTitles(false)}
      onClick={() => setShowTitles(prev => !prev)}
    >
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        cursor: 'default',
        opacity: isPlaying ? 1 : 0.35,
        transition: 'opacity 0.15s ease',
      }}>
        <Music size={14} style={{ color: isPlaying ? theme.accent : theme.textSecondary }} />
        <span style={{
          color: isPlaying ? theme.textPrimary : theme.textSecondary,
          fontSize: '0.75rem',
        }}>
          BGM
        </span>
      </div>
      {showTitles && isPlaying && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          marginTop: '4px',
          background: theme.bgInput,
          border: `1px solid ${theme.border}`,
          borderRadius: '4px',
          padding: '6px 10px',
          whiteSpace: 'nowrap',
          zIndex: 1000,
          boxShadow: theme.shadowMd,
        }}>
          {playingTracks.map(t => (
            <div key={t.id} style={{
              color: theme.textPrimary,
              fontSize: '0.75rem',
              lineHeight: '1.6',
            }}>
              {t.name || '(無題)'}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
