import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { AdButton } from '../components/ui/AdComponents';

describe('AdButton — Phase 7 variant', () => {
  it('default variant はゴーストクラスを持つ', () => {
    const { container } = render(<AdButton>テスト</AdButton>);
    const btn = container.querySelector('button')!;
    expect(btn.classList.contains('adra-btn--ghost')).toBe(true);
    expect(btn.style.background).toBeFalsy();
    expect(btn.style.borderStyle).toBe('none');
  });

  it('primary variant は accent 背景でゴーストクラスを持たない', () => {
    const { container } = render(<AdButton variant="primary">保存</AdButton>);
    const btn = container.querySelector('button')!;
    expect(btn.classList.contains('adra-btn--ghost')).toBe(false);
    expect(btn.style.background).toContain('var(--ad-accent)');
    expect(btn.style.fontWeight).toBe('600');
  });

  it('danger variant は dangerBgSubtle 背景 + danger テキスト', () => {
    const { container } = render(<AdButton variant="danger">削除</AdButton>);
    const btn = container.querySelector('button')!;
    expect(btn.classList.contains('adra-btn--ghost')).toBe(false);
    expect(btn.style.background).toContain('var(--ad-danger-bg-subtle)');
    expect(btn.style.color).toContain('var(--ad-danger)');
    expect(btn.style.borderStyle).toBe('none');
  });

  it('default variant のパディングが 8px 12px', () => {
    const { container } = render(<AdButton>テスト</AdButton>);
    const btn = container.querySelector('button')!;
    expect(btn.style.padding).toBe('8px 12px');
  });
});
