import React from 'react';
import { theme } from '../../styles/theme';

interface Props {
  children: React.ReactNode;
  fallbackMessage?: string;
}
interface State { hasError: boolean; }

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };
  static getDerivedStateFromError(): State { return { hasError: true }; }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 20, textAlign: 'center', color: theme.textSecondary }}>
          <p>{this.props.fallbackMessage || 'エラーが発生しました'}</p>
          <button
            onClick={() => this.setState({ hasError: false })}
            style={{
              marginTop: 8, padding: '4px 12px', fontSize: 12,
              background: theme.accent, color: theme.textOnAccent,
              border: 'none', borderRadius: 4, cursor: 'pointer',
            }}
          >
            再試行
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
