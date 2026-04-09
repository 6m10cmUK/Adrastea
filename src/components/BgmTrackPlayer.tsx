import { useRef, useEffect, useCallback } from 'react';
import YouTube from 'react-youtube';
import type { BgmTrack } from '../types/adrastea.types';

interface BgmTrackPlayerProps {
  track: BgmTrack;
  fadeState: 'none' | 'in' | 'out';
  fadeDuration?: number;
  masterVolume: number;
  onEnded?: (trackId: string) => void;
  debugLog?: (msg: string) => void;
}

export function BgmTrackPlayer({ track, fadeState, fadeDuration, masterVolume, onEnded, debugLog }: BgmTrackPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const ytPlayerRef = useRef<any>(null);

  const setVolume = useCallback((vol: number) => {
    const effective = Math.max(0, Math.min(1, vol * masterVolume));
    if (audioRef.current) audioRef.current.volume = effective;
    if (ytPlayerRef.current) {
      try { ytPlayerRef.current.setVolume(effective * 100); } catch {}
    }
  }, [masterVolume]);

  // フェード処理（requestAnimationFrame + 時間ベース補間）
  const rafRef = useRef<number | null>(null);

  const cancelFade = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  useEffect(() => {
    cancelFade();

    if (fadeState === 'none') {
      setVolume(track.bgm_volume);
      return;
    }

    const duration = fadeDuration || (fadeState === 'in' ? track.fade_in_duration : 1000);
    const startVol = fadeState === 'in' ? 0 : track.bgm_volume;
    const endVol = fadeState === 'in' ? track.bgm_volume : 0;
    const startTime = performance.now();

    setVolume(startVol);

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const t = Math.min(1, elapsed / duration);
      const vol = startVol + (endVol - startVol) * t;
      setVolume(vol);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        rafRef.current = null;
      }
    };

    rafRef.current = requestAnimationFrame(tick);

    return cancelFade;
  }, [fadeState, track.bgm_volume, track.fade_in_duration, fadeDuration, setVolume, cancelFade]);

  // ボリューム変更（フェード中でないとき）
  useEffect(() => {
    if (fadeState === 'none') {
      setVolume(track.bgm_volume);
    }
  }, [track.bgm_volume, masterVolume, fadeState, setVolume]);

  // YouTube ready状態を追跡（refだとuseEffectが検知できないため）
  const ytReadyRef = useRef(false);
  const pendingPauseRef = useRef<boolean | null>(null);

  // 一時停止/再開制御
  useEffect(() => {
    if (track.is_paused) {
      if (audioRef.current) audioRef.current.pause();
      if (ytPlayerRef.current && ytReadyRef.current) {
        try { ytPlayerRef.current.pauseVideo(); } catch {}
      } else {
        // YTプレイヤーがまだreadyでない場合、保留
        pendingPauseRef.current = true;
      }
    } else {
      if (audioRef.current && audioRef.current.paused && audioRef.current.src) {
        audioRef.current.play().catch(() => {});
      }
      if (ytPlayerRef.current && ytReadyRef.current) {
        try { ytPlayerRef.current.playVideo(); } catch {}
      } else {
        pendingPauseRef.current = false;
      }
    }
  }, [track.is_paused]);

  // クリーンアップ
  useEffect(() => {
    return cancelFade;
  }, [cancelFade]);

  const extractVideoId = (source: string): string => {
    const match = source.match(/(?:youtu\.be\/|v=)([^&?\s]+)/);
    const raw = match ? match[1] : source;
    // クエリパラメータやハッシュが残っていたら除去
    return raw.split(/[?&#]/)[0];
  };

  const videoId = track.bgm_type === 'youtube' && track.bgm_source ? extractVideoId(track.bgm_source) : '';

  // デバッグ: マウント時にソース情報をログ
  useEffect(() => {
    if (track.bgm_type === 'youtube' && track.bgm_source) {
      debugLog?.(`YT mount: "${track.name}" source="${track.bgm_source}" → videoId="${videoId}"`);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!track.bgm_type || !track.bgm_source) return null;

  return (
    <>
      {track.bgm_type === 'youtube' && (
        <div style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}>
          <YouTube
            videoId={videoId}
            opts={{
              width: '1',
              height: '1',
              playerVars: {
                autoplay: track.is_paused ? 0 : 1,
                loop: track.bgm_loop ? 1 : 0,
                playlist: track.bgm_loop ? videoId : undefined,
              },
            }}
            onReady={(e) => {
              ytPlayerRef.current = e.target;
              ytReadyRef.current = true;
              e.target.setVolume(track.bgm_volume * masterVolume * 100);
              debugLog?.(`YT onReady: "${track.name}" (${videoId})`);
              // onReadyより前に来たpause/play指示を反映
              if (pendingPauseRef.current === true) {
                try { e.target.pauseVideo(); } catch {}
                debugLog?.(`YT paused (pending): "${track.name}"`);
              } else {
                // autoplay がブロックされるケースがあるので明示的に playVideo()
                try { e.target.playVideo(); } catch {}
                debugLog?.(`YT playVideo called: "${track.name}"`);
              }
              pendingPauseRef.current = null;
            }}
            onStateChange={(e) => {
              // -1:unstarted, 0:ended, 1:playing, 2:paused, 3:buffering, 5:cued
              const stateNames: Record<number, string> = { '-1': 'unstarted', 0: 'ended', 1: 'playing', 2: 'paused', 3: 'buffering', 5: 'cued' };
              debugLog?.(`YT state: ${stateNames[e.data] ?? e.data} - "${track.name}"`);
              if (e.data === 0 && !track.bgm_loop) onEnded?.(track.id);
            }}
            onError={(e) => {
              const errorNames: Record<number, string> = { 2: 'invalid param', 5: 'HTML5 error', 100: 'not found', 101: 'embed blocked', 150: 'embed blocked' };
              debugLog?.(`YT ERROR: ${errorNames[e.data] ?? `code=${e.data}`} - "${track.name}" (${videoId})`);
            }}
          />
        </div>
      )}
      {(track.bgm_type === 'url' || track.bgm_type === 'upload') && (
        <audio
          ref={audioRef}
          src={track.bgm_source}
          autoPlay={!track.is_paused}
          loop={track.bgm_loop}
          style={{ display: 'none' }}
          onEnded={() => {
            if (!track.bgm_loop) onEnded?.(track.id);
          }}
          onCanPlayThrough={() => {
            // autoplay がブラウザにブロックされた場合、ユーザー操作時にリトライ
            const el = audioRef.current;
            if (!el || !el.paused || track.is_paused) return;
            el.play().catch(() => {
              const resume = () => {
                if (audioRef.current && audioRef.current.paused && !track.is_paused) {
                  audioRef.current.play().catch(() => {});
                }
                document.removeEventListener('click', resume);
                document.removeEventListener('keydown', resume);
              };
              document.addEventListener('click', resume, { once: true });
              document.addEventListener('keydown', resume, { once: true });
            });
          }}
        />
      )}
    </>
  );
}
