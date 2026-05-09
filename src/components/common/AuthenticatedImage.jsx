import React, { useState, useEffect } from 'react';
import { getAuthHeader } from '../../services/auth-storage';

/**
 * Image component that loads with authentication headers
 */
export default function AuthenticatedImage({ src, alt, className, fallbackText, showLoader = true }) {
  const [imgSrc, setImgSrc] = useState(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const loadSecureImage = async () => {
      if (!src) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(false);
        
        const authHeader = getAuthHeader();
        
        console.debug('[AuthenticatedImage] Loading:', src);
        
        const response = await fetch(src, {
          headers: {
            ...authHeader
          }
        });

        if (!response.ok) {
          console.error(`[AuthenticatedImage] Failed to load: ${response.status} ${response.statusText} for ${src}`);
          throw new Error('Failed to load image');
        }

        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        
        if (isMounted) {
          setImgSrc(objectUrl);
          setLoading(false);
        }
      } catch (err) {
        console.error('[AuthenticatedImage] Error fetching image:', err);
        if (isMounted) {
          setError(true);
          setLoading(false);
        }
      }
    };

    loadSecureImage();

    return () => {
      isMounted = false;
      if (imgSrc) {
        URL.revokeObjectURL(imgSrc);
      }
    };
  }, [src]);

  if (loading && showLoader) {
    return (
      <div className="flex items-center justify-center w-full h-full bg-slate-50">
        <div className="animate-pulse flex flex-col items-center">
          <span className="text-xl mb-1">⌛</span>
          <span className="text-[8px] text-slate-400 uppercase tracking-widest">Loading</span>
        </div>
      </div>
    );
  }

  if (error || (!loading && !imgSrc)) {
    return (
      <div className="flex items-center justify-center w-full h-full bg-slate-50 text-[10px] text-slate-400 font-medium text-center p-2">
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
