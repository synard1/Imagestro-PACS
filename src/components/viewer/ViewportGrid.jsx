import { useRef, useEffect } from 'react';

export default function ViewportGrid({ layout = '1x1', onViewportClick }) {
  const layouts = {
    '1x1': { rows: 1, cols: 1, viewports: 1 },
    '1x2': { rows: 1, cols: 2, viewports: 2 },
    '2x1': { rows: 2, cols: 1, viewports: 2 },
    '2x2': { rows: 2, cols: 2, viewports: 4 },
    '3x3': { rows: 3, cols: 3, viewports: 9 },
  };

  const config = layouts[layout] || layouts['1x1'];
  const viewportRefs = useRef([]);

  useEffect(() => {
    // Initialize viewport refs array
    viewportRefs.current = viewportRefs.current.slice(0, config.viewports);
  }, [config.viewports]);

  const getGridStyle = () => {
    return {
      display: 'grid',
      gridTemplateRows: `repeat(${config.rows}, 1fr)`,
      gridTemplateColumns: `repeat(${config.cols}, 1fr)`,
      gap: '2px',
      height: '100%',
      width: '100%',
      backgroundColor: '#1f2937', // gray-800
    };
  };

  return (
    <div style={getGridStyle()}>
      {Array.from({ length: config.viewports }).map((_, index) => (
        <div
          key={index}
          ref={(el) => (viewportRefs.current[index] = el)}
          onClick={() => onViewportClick?.(index)}
          className="relative bg-black border border-gray-700 cursor-pointer hover:border-blue-500 transition-colors"
          data-viewport-index={index}
        >
          {/* Viewport Label */}
          <div className="absolute top-2 left-2 px-2 py-1 bg-black/70 text-white text-xs rounded z-10">
            Viewport {index + 1}
          </div>

          {/* Viewport Canvas will be rendered here by Cornerstone */}
          <div 
            className="viewport-element w-full h-full"
            data-viewport-id={`viewport-${index}`}
          />

          {/* Empty State */}
          <div className="absolute inset-0 flex items-center justify-center text-gray-600 pointer-events-none">
            <div className="text-center">
              <div className="text-4xl mb-2">🖼️</div>
              <div className="text-sm">No Image</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
