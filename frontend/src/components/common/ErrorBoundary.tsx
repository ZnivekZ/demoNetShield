import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

/**
 * Global error boundary — catches render errors from any page so a single
 * crashing component can't unmount the whole app (blank screen + dead nav).
 * Shows a recoverable error card instead.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(error: unknown): State {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : String(error),
    };
  }

  handleReload = () => {
    // Reset local state; the "Volver al inicio" link (below) navigates home.
    this.setState({ hasError: false, message: '' });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center min-h-[60vh] p-6">
          <div className="glass-card max-w-md w-full p-6 text-center space-y-4">
            <div className="text-3xl">⚠️</div>
            <h2 className="text-base font-semibold text-surface-100">
              Algo salió mal en esta sección
            </h2>
            <p className="text-xs text-surface-500 break-words">
              {this.state.message || 'Error inesperado'}
            </p>
            <a
              href="/"
              className="btn btn-primary inline-flex"
              onClick={this.handleReload}
            >
              Volver al inicio
            </a>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
