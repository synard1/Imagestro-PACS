import React from 'react'
import { useTheme } from '../contexts/ThemeContext'

// Loading spinner sizes
const SIZES = {
  small: 'w-4 h-4',
  medium: 'w-6 h-6',
  large: 'w-8 h-8',
  'extra-large': 'w-12 h-12',
}

// Loading spinner component
function LoadingSpinner({ 
  size = 'medium', 
  message = '', 
  className = '', 
  color = 'primary',
  overlay = false,
  fullScreen = false 
}) {
  const { reducedMotion } = useTheme()

  // Spinner classes
  const spinnerClasses = [
    'animate-spin',
    SIZES[size] || SIZES.medium,
    getColorClasses(color),
    className,
  ].filter(Boolean).join(' ')

  // Container classes
  const containerClasses = [
    'flex flex-col items-center justify-center',
    fullScreen && 'min-h-screen',
    overlay && 'absolute inset-0 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm z-50',
  ].filter(Boolean).join(' ')

  // Spinner SVG
  const SpinnerSVG = () => (
    <svg
      className={spinnerClasses}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
      role="img"
      aria-label="Loading"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  )

  // Alternative spinner for reduced motion
  const PulseSpinner = () => (
    <div
      className={[
        'rounded-full animate-pulse',
        SIZES[size] || SIZES.medium,
        getColorClasses(color, true),
      ].join(' ')}
      aria-hidden="true"
      role="img"
      aria-label="Loading"
    />
  )

  return (
    <div className={containerClasses} role="status" aria-live="polite">
      {reducedMotion ? <PulseSpinner /> : <SpinnerSVG />}
      
      {message && (
        <p className="mt-3 text-sm text-gray-600 dark:text-gray-400 text-center max-w-xs">
          {message}
        </p>
      )}
      
      <span className="sr-only">
        {message || 'Loading...'}
      </span>
    </div>
  )
}

// Get color classes for spinner
function getColorClasses(color, isPulse = false) {
  const colorMap = {
    primary: isPulse ? 'bg-primary-600' : 'text-primary-600',
    secondary: isPulse ? 'bg-secondary-600' : 'text-secondary-600',
    success: isPulse ? 'bg-green-600' : 'text-green-600',
    warning: isPulse ? 'bg-yellow-600' : 'text-yellow-600',
    error: isPulse ? 'bg-red-600' : 'text-red-600',
    gray: isPulse ? 'bg-gray-600' : 'text-gray-600',
  }

  return colorMap[color] || colorMap.primary
}

// Inline loading spinner for buttons
export function ButtonSpinner({ size = 'small', className = '' }) {
  const { reducedMotion } = useTheme()

  if (reducedMotion) {
    return (
      <div
        className={[
          'rounded-full animate-pulse bg-current opacity-75',
          SIZES[size] || SIZES.small,
          className,
        ].join(' ')}
        aria-hidden="true"
      />
    )
  }

  return (
    <svg
      className={[
        'animate-spin',
        SIZES[size] || SIZES.small,
        className,
      ].join(' ')}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  )
}

// Loading overlay component
export function LoadingOverlay({ 
  isLoading, 
  message = 'Loading...', 
  children,
  blur = true 
}) {
  return (
    <div className="relative">
      {children}
      
      {isLoading && (
        <div 
          className={[
            'absolute inset-0 flex items-center justify-center z-50',
            'bg-white/80 dark:bg-gray-900/80',
            blur && 'backdrop-blur-sm',
          ].filter(Boolean).join(' ')}
        >
          <LoadingSpinner message={message} />
        </div>
      )}
    </div>
  )
}

// Loading skeleton component
export function LoadingSkeleton({ 
  lines = 3, 
  className = '',
  animate = true 
}) {
  const { reducedMotion } = useTheme()
  const shouldAnimate = animate && !reducedMotion

  return (
    <div className={`space-y-3 ${className}`} role="status" aria-label="Loading content">
      {Array.from({ length: lines }, (_, index) => (
        <div
          key={index}
          className={[
            'h-4 bg-gray-200 dark:bg-gray-700 rounded',
            shouldAnimate && 'animate-pulse',
            index === lines - 1 && 'w-3/4', // Last line is shorter
          ].filter(Boolean).join(' ')}
          aria-hidden="true"
        />
      ))}
      <span className="sr-only">Loading content...</span>
    </div>
  )
}

// Loading card component
export function LoadingCard({ className = '' }) {
  const { reducedMotion } = useTheme()

  return (
    <div 
      className={`bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 ${className}`}
      role="status"
      aria-label="Loading card"
    >
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center space-x-4">
          <div 
            className={[
              'w-12 h-12 bg-gray-200 dark:bg-gray-700 rounded-full',
              !reducedMotion && 'animate-pulse',
            ].filter(Boolean).join(' ')}
            aria-hidden="true"
          />
          <div className="flex-1 space-y-2">
            <div 
              className={[
                'h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2',
                !reducedMotion && 'animate-pulse',
              ].filter(Boolean).join(' ')}
              aria-hidden="true"
            />
            <div 
              className={[
                'h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/3',
                !reducedMotion && 'animate-pulse',
              ].filter(Boolean).join(' ')}
              aria-hidden="true"
            />
          </div>
        </div>

        {/* Content */}
        <div className="space-y-2">
          <div 
            className={[
              'h-3 bg-gray-200 dark:bg-gray-700 rounded',
              !reducedMotion && 'animate-pulse',
            ].filter(Boolean).join(' ')}
            aria-hidden="true"
          />
          <div 
            className={[
              'h-3 bg-gray-200 dark:bg-gray-700 rounded w-5/6',
              !reducedMotion && 'animate-pulse',
            ].filter(Boolean).join(' ')}
            aria-hidden="true"
          />
          <div 
            className={[
              'h-3 bg-gray-200 dark:bg-gray-700 rounded w-4/6',
              !reducedMotion && 'animate-pulse',
            ].filter(Boolean).join(' ')}
            aria-hidden="true"
          />
        </div>
      </div>
      
      <span className="sr-only">Loading card content...</span>
    </div>
  )
}

export default LoadingSpinner