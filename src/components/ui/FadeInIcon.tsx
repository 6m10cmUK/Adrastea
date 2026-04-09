import type { CSSProperties } from 'react';

interface FadeInIconProps {
  size?: number;
  color?: string;
  style?: CSSProperties;
}

export function FadeInIcon({ size = 13, color = 'currentColor', style }: FadeInIconProps) {
  // 〈◇ フェードインアイコン: 左に薄い山括弧、右に正方形45度回転の菱形
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      style={style}
    >
      {/* 左: 〈 薄い山括弧 */}
      <polyline points="8,6 3,12 8,18" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" opacity={0.6} fill="none" />
      {/* 右: ◇ 正方形を45度回転 */}
      <rect x="11" y="6" width="10" height="10" rx="1" transform="rotate(45 16 11)" stroke={color} strokeWidth="2" fill="none" />
    </svg>
  );
}
