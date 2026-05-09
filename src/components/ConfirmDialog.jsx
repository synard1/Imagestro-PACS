import { useState, useCallback, createContext, useContext, useEffect } from 'react';

const ConfirmContext = createContext(null);

/**
 * Confirm Dialog Types/Variants
 */
export const CONFIRM_TYPES = {
    DEFAULT: 'default',
    DANGER: 'danger',
    WARNING: 'warning',
    SUCCESS: 'success',
    INFO: 'info'
};

/**
 * Type-specific styling configurations
 */
const TYPE_STYLES = {
    default: {
        headerBg: 'bg-gradient-to-r from-blue-50 to-indigo-50',
        iconColor: 'text-blue-600',
        confirmBtnBg: 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500',
        icon: (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
        )
    },
    danger: {
        headerBg: 'bg-gradient-to-r from-red-50 to-rose-50',
        iconColor: 'text-red-600',
        confirmBtnBg: 'bg-red-600 hover:bg-red-700 focus:ring-red-500',
        icon: (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
        )
    },
    warning: {
        headerBg: 'bg-gradient-to-r from-amber-50 to-yellow-50',
        iconColor: 'text-amber-600',
        confirmBtnBg: 'bg-amber-600 hover:bg-amber-700 focus:ring-amber-500',
        icon: (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
        )
    },
    success: {
        headerBg: 'bg-gradient-to-r from-emerald-50 to-green-50',
        iconColor: 'text-emerald-600',
        confirmBtnBg: 'bg-emerald-600 hover:bg-emerald-700 focus:ring-emerald-500',
        icon: (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
        )
    },
    info: {
        headerBg: 'bg-gradient-to-r from-cyan-50 to-sky-50',
        iconColor: 'text-cyan-600',
        confirmBtnBg: 'bg-cyan-600 hover:bg-cyan-700 focus:ring-cyan-500',
        icon: (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
        )
    }
};

/**
 * Hook to use the confirm dialog
 * 
 * @example
 * // Basic usage
 * const { confirm } = useConfirm();
 * const result = await confirm('Are you sure?');
 * 
 * @example
 * // With options
 * const result = await confirm('Delete this item?', {
 *   title: 'Delete Confirmation',
 *   type: 'danger',
 *   confirmText: 'Delete',
 *   cancelText: 'Keep'
 * });
 * 
 * @returns {Object} { confirm } - The confirm function
 */
export function useConfirm() {
    const context = useContext(ConfirmContext);
    if (!context) {
        throw new Error('useConfirm must be used within a ConfirmProvider');
    }
    return context;
}

/**
 * Confirm Dialog Modal Component
 */
function ConfirmModal({
    isOpen,
    message,
    onConfirm,
    onCancel,
    title = 'Confirm Action',
    type = 'default',
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    showCancel = true,
    closeOnBackdrop = true
}) {
    // Close on Escape key
    useEffect(() => {
        const handleEscape = (e) => {
            if (e.key === 'Escape' && isOpen) {
                onCancel();
            }
        };

        if (isOpen) {
            document.addEventListener('keydown', handleEscape);
            // Prevent body scroll when modal is open
            document.body.style.overflow = 'hidden';
        }

        return () => {
            document.removeEventListener('keydown', handleEscape);
            document.body.style.overflow = '';
        };
    }, [isOpen, onCancel]);

    if (!isOpen) return null;

    const styles = TYPE_STYLES[type] || TYPE_STYLES.default;

    return (
        <div
            className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fadeIn"
            onClick={(e) => {
                if (e.target === e.currentTarget && closeOnBackdrop) onCancel();
            }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-dialog-title"
        >
            <div
                className="bg-white rounded-xl shadow-2xl max-w-md w-full mx-4 overflow-hidden transform transition-all animate-scaleIn"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className={`px-6 py-4 border-b border-gray-200 ${styles.headerBg}`}>
                    <h3
                        id="confirm-dialog-title"
                        className="text-lg font-semibold text-gray-900 flex items-center gap-2"
                    >
                        <span className={styles.iconColor}>
                            {styles.icon}
                        </span>
                        {title}
                    </h3>
                </div>

                {/* Content */}
                <div className="px-6 py-5">
                    {typeof message === 'string' ? (
                        <p className="text-gray-700 text-base leading-relaxed whitespace-pre-line">
                            {message}
                        </p>
                    ) : (
                        // Support for JSX content
                        <div className="text-gray-700">
                            {message}
                        </div>
                    )}
                </div>

                {/* Actions */}
                <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end gap-3">
                    {showCancel && (
                        <button
                            onClick={onCancel}
                            className="px-5 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-200 transition-all"
                        >
                            {cancelText}
                        </button>
                    )}
                    <button
                        onClick={onConfirm}
                        autoFocus
                        className={`px-5 py-2.5 text-sm font-medium text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 transition-all shadow-sm ${styles.confirmBtnBg}`}
                    >
                        {confirmText}
                    </button>
                </div>
            </div>

            {/* Inline styles for animations */}
            <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes scaleIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        .animate-fadeIn {
          animation: fadeIn 0.15s ease-out;
        }
        .animate-scaleIn {
          animation: scaleIn 0.2s ease-out;
        }
      `}</style>
        </div>
    );
}

/**
 * Confirm Dialog Provider
 * Wraps the app and provides a confirm dialog that can be called from anywhere
 * 
 * @example
 * // In main.jsx or App.jsx
 * <ConfirmProvider>
 *   <App />
 * </ConfirmProvider>
 */
export function ConfirmProvider({ children }) {
    const [dialogState, setDialogState] = useState({
        isOpen: false,
        message: '',
        title: 'Confirm Action',
        type: 'default',
        confirmText: 'Confirm',
        cancelText: 'Cancel',
        showCancel: true,
        closeOnBackdrop: true,
        resolve: null
    });

    /**
     * Show a confirm dialog and return a promise that resolves to true/false
     * 
     * @param {string|React.ReactNode} message - The message to display (can be string or JSX)
     * @param {Object|string} [options] - Options object or title string for backward compatibility
     * @param {string} [options.title] - Dialog title
     * @param {string} [options.type] - Dialog type: 'default' | 'danger' | 'warning' | 'success' | 'info'
     * @param {string} [options.confirmText] - Text for confirm button
     * @param {string} [options.cancelText] - Text for cancel button
     * @param {boolean} [options.showCancel] - Whether to show cancel button (default: true)
     * @param {boolean} [options.closeOnBackdrop] - Close when clicking backdrop (default: true)
     * @returns {Promise<boolean>} Resolves to true if confirmed, false if cancelled
     */
    const confirm = useCallback((message, options = {}) => {
        // Support legacy API: confirm(message, title)
        const opts = typeof options === 'string'
            ? { title: options }
            : options;

        return new Promise((resolve) => {
            setDialogState({
                isOpen: true,
                message,
                title: opts.title || 'Confirm Action',
                type: opts.type || 'default',
                confirmText: opts.confirmText || 'Confirm',
                cancelText: opts.cancelText || 'Cancel',
                showCancel: opts.showCancel !== false,
                closeOnBackdrop: opts.closeOnBackdrop !== false,
                resolve
            });
        });
    }, []);

    /**
     * Shorthand for danger/destructive confirmations
     * @param {string} message - The message to display
     * @param {Object} [options] - Additional options
     * @returns {Promise<boolean>}
     */
    const confirmDanger = useCallback((message, options = {}) => {
        return confirm(message, {
            title: 'Confirm Delete',
            type: 'danger',
            confirmText: 'Delete',
            ...options
        });
    }, [confirm]);

    /**
     * Shorthand for warning confirmations
     * @param {string} message - The message to display
     * @param {Object} [options] - Additional options
     * @returns {Promise<boolean>}
     */
    const confirmWarning = useCallback((message, options = {}) => {
        return confirm(message, {
            title: 'Warning',
            type: 'warning',
            confirmText: 'Proceed',
            ...options
        });
    }, [confirm]);

    /**
     * Show an alert dialog (no cancel button)
     * @param {string} message - The message to display
     * @param {Object} [options] - Additional options
     * @returns {Promise<boolean>}
     */
    const alert = useCallback((message, options = {}) => {
        return confirm(message, {
            title: 'Notice',
            type: 'info',
            confirmText: 'OK',
            showCancel: false,
            ...options
        });
    }, [confirm]);

    const handleConfirm = useCallback(() => {
        if (dialogState.resolve) {
            dialogState.resolve(true);
        }
        setDialogState(prev => ({ ...prev, isOpen: false, resolve: null }));
    }, [dialogState.resolve]);

    const handleCancel = useCallback(() => {
        if (dialogState.resolve) {
            dialogState.resolve(false);
        }
        setDialogState(prev => ({ ...prev, isOpen: false, resolve: null }));
    }, [dialogState.resolve]);

    return (
        <ConfirmContext.Provider value={{ confirm, confirmDanger, confirmWarning, alert }}>
            {children}
            <ConfirmModal
                isOpen={dialogState.isOpen}
                message={dialogState.message}
                title={dialogState.title}
                type={dialogState.type}
                confirmText={dialogState.confirmText}
                cancelText={dialogState.cancelText}
                showCancel={dialogState.showCancel}
                closeOnBackdrop={dialogState.closeOnBackdrop}
                onConfirm={handleConfirm}
                onCancel={handleCancel}
            />
        </ConfirmContext.Provider>
    );
}

export default ConfirmProvider;
