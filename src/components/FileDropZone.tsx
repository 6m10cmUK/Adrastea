import React, { useState, useRef, useCallback } from 'react';
import { uploadImage, uploadAudio, deleteFile } from '../services/fileUpload';
import { theme } from '../styles/theme';

interface FileDropZoneProps {
  onFileUploaded: (url: string) => void;
  currentUrl?: string | null;
  accept: 'image/*' | 'audio/*';
  storagePath: string;
  maxWidth?: number;
  quality?: number;
  label?: string;
}

export function FileDropZone({
  onFileUploaded,
  currentUrl,
  accept,
  storagePath,
  maxWidth,
  quality,
  label,
}: FileDropZoneProps) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const isImage = accept === 'image/*';

  const handleFile = useCallback(
    async (file: File) => {
      setUploading(true);
      setProgress(10);
      try {
        let url: string;
        if (isImage) {
          setProgress(30);
          url = await uploadImage(file, storagePath, { maxWidth, quality });
        } else {
          setProgress(30);
          url = await uploadAudio(file, storagePath);
        }
        setProgress(100);
        onFileUploaded(url);
      } catch (err) {
        console.error('アップロード失敗:', err);
      } finally {
        setUploading(false);
        setProgress(0);
      }
    },
    [isImage, storagePath, maxWidth, quality, onFileUploaded]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleDelete = useCallback(async () => {
    if (!currentUrl) return;
    try {
      // R2のURLからパスを抽出して削除を試行
      await deleteFile(storagePath);
    } catch {
      // 削除失敗しても、UIからは消す
    }
    onFileUploaded('');
  }, [currentUrl, storagePath, onFileUploaded]);

  return (
    <div>
      {label && (
        <div style={{ fontSize: '0.8rem', color: theme.textSecondary, marginBottom: '4px' }}>
          {label}
        </div>
      )}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        style={{
          border: `2px dashed ${dragging ? theme.accent : theme.borderInput}`,
          borderRadius: 0,
          padding: currentUrl ? '8px' : '20px',
          textAlign: 'center',
          cursor: 'pointer',
          background: dragging ? 'rgba(137,180,250,0.1)' : 'rgba(0,0,0,0.2)',
          transition: 'all 0.2s',
          position: 'relative',
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
            e.target.value = '';
          }}
        />

        {uploading ? (
          <div>
            <div style={{ fontSize: '0.8rem', color: theme.textSecondary, marginBottom: '6px' }}>
              アップロード中...
            </div>
            <div style={{
              height: '4px',
              background: theme.bgInput,
              borderRadius: 0,
              overflow: 'hidden',
            }}>
              <div style={{
                height: '100%',
                width: `${progress}%`,
                background: theme.accent,
                transition: 'width 0.3s',
              }} />
            </div>
          </div>
        ) : currentUrl ? (
          <div style={{ position: 'relative' }}>
            {isImage ? (
              <img
                src={currentUrl}
                alt="preview"
                style={{
                  maxWidth: '100%',
                  maxHeight: '120px',
                  borderRadius: 0,
                  objectFit: 'contain',
                }}
              />
            ) : (
              <audio
                src={currentUrl}
                controls
                style={{ width: '100%' }}
                onClick={(e) => e.stopPropagation()}
              />
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleDelete();
              }}
              style={{
                position: 'absolute',
                top: '-4px',
                right: '-4px',
                width: '20px',
                height: '20px',
                borderRadius: '50%',
                background: theme.danger,
                color: theme.textOnAccent,
                border: 'none',
                fontSize: '12px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                lineHeight: 1,
              }}
            >
              x
            </button>
          </div>
        ) : (
          <div style={{ color: theme.textSecondary, fontSize: '0.8rem' }}>
            {isImage ? 'ここに画像をドラッグ＆ドロップ' : 'ここに音声ファイルをドラッグ＆ドロップ'}
            <div style={{ fontSize: '0.7rem', marginTop: '4px', color: theme.textMuted }}>
              クリックで選択
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
