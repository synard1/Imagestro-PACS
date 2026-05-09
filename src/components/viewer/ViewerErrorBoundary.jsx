import React from 'react';

export class ViewerErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, showDetails: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('[ViewerErrorBoundary] Enhanced viewer crashed:', error.message, info.componentStack);
  }

  reset() {
    this.setState({ hasError: false, error: null, showDetails: false });
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const { onFallback } = this.props;
    const { error, showDetails } = this.state;

    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-6">
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-8 max-w-lg w-full text-center shadow-2xl">
          <div className="text-5xl mb-4">⚠️</div>
          <h2 className="text-xl font-semibold text-white mb-2">Enhanced Viewer Failed to Load</h2>
          <p className="text-gray-400 text-sm mb-6">
            The Cornerstone-based viewer encountered an initialization error.
            The simple JPEG viewer is always available as a stable fallback.
          </p>

          <div className="flex flex-col gap-3">
            <button
              onClick={onFallback}
              className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
            >
              Switch to Simple Viewer (Stable)
            </button>
            <button
              onClick={() => this.reset()}
              className="w-full px-4 py-3 border border-gray-600 hover:border-gray-500 text-gray-300 hover:text-white font-medium rounded-lg transition-colors"
            >
              Retry Enhanced Viewer
            </button>
          </div>

          <button
            onClick={() => this.setState(s => ({ showDetails: !s.showDetails }))}
            className="mt-4 text-xs text-gray-500 hover:text-gray-400 underline"
          >
            {showDetails ? 'Hide' : 'Show'} error details
          </button>

          {showDetails && error && (
            <div className="mt-3 bg-gray-900 rounded-lg p-3 text-left">
              <p className="text-xs text-red-400 font-mono break-all">{error.message}</p>
            </div>
          )}
        </div>
      </div>
    );
  }
}
