import { ExternalLink } from 'lucide-react';
import type { Character, CharacterStatus } from '../../types/adrastea.types';
import { resolveAssetId } from '../../hooks/useAssets';
import { theme } from '../../styles/theme';
import { Tooltip } from '../ui';
import { formatInitiative, isLightColor } from './statusDisplayUtils';
import { EditableStatusBar } from './EditableStatusBar';

export interface StatusPanelCharacterRowProps {
  char: Character;
  currentUserId: string;
  isSubOwnerPlus: boolean;
  statusCols: number;
  patchCharacterStatus: (charId: string, statusIndex: number, recipe: (s: CharacterStatus) => CharacterStatus) => void;
  onIconClick?: (charId: string) => void;
  onIconDoubleClick?: (charId: string) => void;
}

export function StatusPanelCharacterRow({
  char,
  currentUserId,
  isSubOwnerPlus,
  statusCols,
  patchCharacterStatus,
  onIconClick,
  onIconDoubleClick,
}: StatusPanelCharacterRowProps) {
  const isOwner = char.owner_id === currentUserId;
  const imgUrl = resolveAssetId(char.images[char.active_image_index]?.asset_id) ?? null;
  const isPrivate = char.is_status_private && !isOwner && !isSubOwnerPlus;
  const initiative = char.initiative ?? 0;
  const textColor = isLightColor(char.color) ? '#000' : '#fff';
  const showStatuses = !isPrivate && char.statuses.length > 0;
  const hasSheetUrl = !!char.sheet_url;
  const canEditStatus = isOwner || isSubOwnerPlus;
  const iconCursor = onIconClick && (isOwner || isSubOwnerPlus) ? 'pointer' : 'default';

  return (
    <div
      style={{
        display: 'flex',
        gap: 6,
        padding: 4,
        borderLeft: `3px solid ${char.color}`,
        borderBottom: `1px solid ${theme.borderSubtle}`,
      }}
    >
      <div
        style={{ position: 'relative', flexShrink: 0, cursor: iconCursor }}
        onClick={() => onIconClick?.(char.id)}
        onDoubleClick={() => onIconDoubleClick?.(char.id)}
      >
        {imgUrl ? (
          <img
            src={imgUrl}
            style={{ width: 48, height: 48, objectFit: 'cover', objectPosition: 'top', display: 'block' }}
            draggable={false}
          />
        ) : (
          <div
            style={{
              width: 48,
              height: 48,
              background: char.color,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontSize: 18,
              fontWeight: 700,
            }}
          >
            {char.name.charAt(0)}
          </div>
        )}
        <div
          style={{
            position: 'absolute',
            top: -2,
            left: -2,
            display: 'flex',
            alignItems: 'center',
            gap: 2,
          }}
        >
          <div
            style={{
              background: char.color,
              color: textColor,
              fontSize: 12,
              fontWeight: 700,
              padding: '0 3px',
              lineHeight: '16px',
              minWidth: 16,
              textAlign: 'center',
            }}
          >
            {isPrivate ? '?' : formatInitiative(initiative)}
          </div>
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            marginBottom: 2,
          }}
        >
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: theme.textPrimary,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              flex: 1,
            }}
          >
            {char.name}
          </span>
          <Tooltip label={hasSheetUrl ? char.sheet_url! : '外部URLが未設定'}>
            <button
              type="button"
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                cursor: hasSheetUrl ? 'pointer' : 'default',
                opacity: hasSheetUrl ? 0.8 : 0.25,
                color: theme.textPrimary,
                display: 'flex',
                alignItems: 'center',
              }}
              onClick={(e) => {
                e.stopPropagation();
                if (hasSheetUrl) window.open(char.sheet_url!, '_blank', 'noopener');
              }}
              disabled={!hasSheetUrl}
            >
              <ExternalLink size={11} />
            </button>
          </Tooltip>
        </div>
        {showStatuses && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${statusCols}, 1fr)`,
              gap: 2,
            }}
          >
            {char.statuses.map((s, i) => (
              <EditableStatusBar
                key={i}
                charId={char.id}
                statusIndex={i}
                status={s}
                canEdit={canEditStatus}
                patchCharacterStatus={patchCharacterStatus}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
