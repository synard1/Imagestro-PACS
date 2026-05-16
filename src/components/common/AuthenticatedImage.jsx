import React, { useState, useEffect, useRef } from 'react';
import { getAuthHeader } from '../../services/auth-storage';

/**
 * Image component that loads with authentication headers.
 * Handles 404/401 gracefully without spamming console errors.
 * Implements retry logic for transient failures (202 Generating).
 */
export default function AuthenticatedImage({ src, alt, className, fallbackText, showLoader = true, maxRetries = 2 }) {
  const [imgSrc, setImgSrc] = useState(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef(null);

  useEffect(() => {
    let isMounted = true;
    retryCountRef.current = 0;

    const loadSecureImage = async () => {
      if (!src) {
        setLoading(false);
        return;
      }

      try {
        if (retryCountRef.current === 0) {
          setLoading(true);
          setError(false);
        }
        
        const authHeader = getAuthHeader();
        
        const response = await fetch(src, {
          headers: {
            ...authHeader,
            'Accept': 'image/jpeg, image/png, image/*'
          }
        });

        // Handle 202 (thumbnail is being generated) — retry after delay
        if (response.status === 202 && retryCountRef.current < maxRetries) {
          const retryAfter = parseInt(response.headers.get('Retry-After') || '3', 10);
          retryCountRef.current++;
          retryTimerRef.current = setTimeout(() => {
            if (isMounted) loadSecureImage();
          }, retryAfter * 1000);
          return;
        }

        // Handle expected error statuses silently (no console.error spam)
        if (!response.ok) {
          if (response.status === 404 || response.status === 401 || response.status === 202) {
            // Expected failures — show fallback quietly
            if (isMounted) {
              setError(true);
              setLoading(false);
            }
            return;
          }
          // Unexpected errors — log once at debug level
          console.debug(`[AuthenticatedImage] ${response.status} for ${src.substring(0, 80)}...`);
          if (isMounted) {
            setError(true);
            setLoading(false);
          }
          return;
        }

        const contentType = response.headers.get('content-type') || '';
        
        // Verify we got actual image data, not a JSON error response
        if (contentType.includes('application/json')) {
          if (isMounted) {
            setError(true);
            setLoading(false);
          }
          return;
        }

        const blob = await response.blob();
        
        // Validate blob has content
        if (blob.size === 0) {
          if (isMounted) {
            setError(true);
            setLoading(false);
          }
          return;
        }

        const objectUrl = URL.createObjectURL(blob);
        
        if (isMounted) {
          setImgSrc(objectUrl);
          setLoading(false);
        }
      } catch (err) {
        // Network errors — log at debug level only
        if (err.name !== 'AbortError') {
          console.debug('[AuthenticatedImage] Network error:', err.message);
        }
        if (isMounted) {
          setError(true);
          setLoading(false);
        }
      }
    };

    loadSecureImage();

    return () => {
      isMounted = false;
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
      }
      if (imgSrc) {
        URL.revokeObjectURL(imgSrc);
      }
    };
  }, [src]);

  if (loading && showLoader) {
    return (
      <div className="flex items-center justify-center w-full h-full bg-slate-800/50 rounded">
        <div className="animate-pulse flex flex-col items-center">
          <span className="text-lg mb-0.5 opacity-60">🖼️</span>
          <span className="text-[7px] text-slate-500 uppercase tracking-widest">Loading</span>
        </div>
      </div>
    );
  }

  if (error || (!loading && !imgSrc)) {
    return (
      <div className="flex items-center justify-center w-full h-full bg-slate-800/30 text-[10px] text-slate-500 font-medium text-center p-1 rounded">
        {fallbackText || 'No Preview'}
      </div>
    );
  }

  return (
    <img 
      src={imgSrc} 
      alt={alt} 
      className={className} 
      loading="lazy"
    />
  );
}
