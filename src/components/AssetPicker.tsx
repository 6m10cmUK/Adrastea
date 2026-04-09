import { useState } from 'react';
import { theme } from '../styles/theme';
import { X } from 'lucide-react';
import { AssetLibraryModal } from './AssetLibraryModal';

// ---------------------------------------------------------------------------
// AssetPicker - インライン表示 + モーダル（既存のフォーム内で使う用）
// ---------------------------------------------------------------------------

interface AssetPickerProps {
  currentUrl?: string | null;
  onSelect: (url: string, assetId?: string) => void;
  label?: string;
  autoTags?: string[];
}

export function AssetPicker({ currentUrl, onSelect, label, autoTags }: AssetPickerProps) {
  const [showModal, setShowModal] = useState(false);

  return (
    <div>
      {label && (
        <div style={{ fontSize: '12px', color: theme.textSecondary, marginBottom: '4px' }}>
          {label}
        </div>
      )}

      {/* プレビュー or ドロップゾーン */}
      <div
        onClick={() => setShowModal(true)}
        style={{
          border: `2px dashed ${theme.borderInput}`,
          borderRadius: 0,
          padding: currentUrl ? '8px' : '20px',
          textAlign: 'center',
          cursor: 'pointer',
          background: 'rgba(0,0,0,0.2)',
          transition: 'all 0.2s',
          position: 'relative',
        }}
      >
        {currentUrl ? (
          <div style={{ position: 'relative' }}>
            <img
              src={currentUrl}
              alt="preview"
              style={{ maxWidth: '100%', maxHeight: '120px', borderRadius: 0, objectFit: 'contain' }}
            />
            <button
              onClick={(e) => {
                e.stopPropagation();
                onSelect('');
              }}
              style={{
                position: 'absolute', top: '-4px', right: '-4px',
                width: '20px', height: '20px', borderRadius: '50%',
                background: theme.danger, color: theme.textOnAccent,
                border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <X size={12} />
            </button>
          </div>
        ) : (
          <div style={{ color: theme.textSecondary, fontSize: '0.8rem' }}>
            クリックしてアセットを選択
            <div style={{ fontSize: '11px', marginTop: '4px', color: theme.textMuted }}>
              ライブラリから選択 / 新規アップロード
            </div>
          </div>
        )}
      </div>

      {showModal && (
        <AssetLibraryModal
          initialTab="image"
          onSelect={(url, assetId) => {
            onSelect(url, assetId);
            setShowModal(false);
          }}
          onClose={() => setShowModal(false)}
          autoTags={autoTags}
        />
      )}
    </div>
  );
}
