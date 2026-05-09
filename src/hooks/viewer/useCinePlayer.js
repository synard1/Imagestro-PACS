import { useState, useEffect, useRef } from 'react';

/**
 * Custom hook for cine playback functionality
 * Handles frame navigation and auto-play
 */
export function useCinePlayer(totalFrames = 1, initialFps = 10) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentFrame, setCurrentFrame] = useState(1);
  const [fps, setFps] = useState(initialFps);
  const [loop, setLoop] = useState(true);
  const intervalRef = useRef(null);

  // Calculate frame delay from FPS
  const frameDelay = 1000 / fps;

  // Auto-play effect
  useEffect(() => {
    if (!isPlaying) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    intervalRef.current = setInterval(() => {
      setCurrentFrame(prev => {
        const next = prev + 1;
        if (next > totalFrames) {
          if (loop) {
            return 1; // Loop back to first frame
          } else {
            setIsPlaying(false); // Stop at last frame
            return totalFrames;
          }
        }
        return next;
      });
    }, frameDelay);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isPlaying, fps, totalFrames, loop, frameDelay]);

  const play = () => setIsPlaying(true);
  const pause = () => setIsPlaying(false);
  const togglePlayPause = () => setIsPlaying(prev => !prev);

  const nextFrame = () => {
    setCurrentFrame(prev => Math.min(prev + 1, totalFrames));
  };

  const prevFrame = () => {
    setCurrentFrame(prev => Math.max(prev - 1, 1));
  };

  const goToFrame = (frameNumber) => {
    setCurrentFrame(Math.max(1, Math.min(frameNumber, totalFrames)));
  };

  const toggleLoop = () => setLoop(prev => !prev);

  return {
    isPlaying,
    currentFrame,
    fps,
    loop,
    play,
    pause,
    togglePlayPause,
    nextFrame,
    prevFrame,
    goToFrame,
    setFps,
    toggleLoop,
  };
}
