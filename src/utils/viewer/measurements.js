/**
 * Measurement calculation utilities
 * Provides functions for calculating distances, angles, and ROI statistics
 */

/**
 * Calculate distance between two points
 * @param {Object} point1 - {x, y} coordinates
 * @param {Object} point2 - {x, y} coordinates
 * @returns {number} Distance in pixels
 */
export function calculateDistance(point1, point2) {
  const dx = point2.x - point1.x;
  const dy = point2.y - point1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Calculate angle between three points
 * @param {Object} point1 - First point {x, y}
 * @param {Object} vertex - Vertex point {x, y}
 * @param {Object} point2 - Second point {x, y}
 * @returns {number} Angle in degrees
 */
export function calculateAngle(point1, vertex, point2) {
  const vector1 = {
    x: point1.x - vertex.x,
    y: point1.y - vertex.y
  };
  
  const vector2 = {
    x: point2.x - vertex.x,
    y: point2.y - vertex.y
  };

  const dot = vector1.x * vector2.x + vector1.y * vector2.y;
  const mag1 = Math.sqrt(vector1.x * vector1.x + vector1.y * vector1.y);
  const mag2 = Math.sqrt(vector2.x * vector2.x + vector2.y * vector2.y);

  const cosAngle = dot / (mag1 * mag2);
  const angleRad = Math.acos(Math.max(-1, Math.min(1, cosAngle)));
  
  return (angleRad * 180) / Math.PI;
}

/**
 * Calculate rectangle ROI area
 * @param {Object} rect - {x, y, width, height}
 * @returns {number} Area in square pixels
 */
export function calculateRectangleArea(rect) {
  return Math.abs(rect.width * rect.height);
}

/**
 * Calculate ellipse ROI area
 * @param {Object} ellipse - {radiusX, radiusY}
 * @returns {number} Area in square pixels
 */
export function calculateEllipseArea(ellipse) {
  return Math.PI * ellipse.radiusX * ellipse.radiusY;
}

/**
 * Calculate polygon area using shoelace formula
 * @param {Array} points - Array of {x, y} points
 * @returns {number} Area in square pixels
 */
export function calculatePolygonArea(points) {
  if (points.length < 3) return 0;

  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    area += points[i].x * points[j].y;
    area -= points[j].x * points[i].y;
  }
  
  return Math.abs(area / 2);
}

/**
 * Format measurement value with units
 * @param {number} value - Measurement value
 * @param {string} type - Measurement type (distance, angle, area)
 * @param {number} pixelSpacing - Pixel spacing in mm (optional)
 * @returns {string} Formatted measurement
 */
export function formatMeasurement(value, type, pixelSpacing = null) {
  switch (type) {
    case 'distance':
      if (pixelSpacing) {
        const mm = value * pixelSpacing;
        return `${mm.toFixed(2)} mm`;
      }
      return `${value.toFixed(2)} px`;
    
    case 'angle':
      return `${value.toFixed(1)}°`;
    
    case 'area':
      if (pixelSpacing) {
        const mm2 = value * pixelSpacing * pixelSpacing;
        return `${mm2.toFixed(2)} mm²`;
      }
      return `${value.toFixed(2)} px²`;
    
    default:
      return value.toFixed(2);
  }
}

/**
 * Calculate ROI statistics from pixel data
 * @param {Array} pixelData - Array of pixel values
 * @returns {Object} Statistics (mean, min, max, stdDev)
 */
export function calculateROIStatistics(pixelData) {
  if (!pixelData || pixelData.length === 0) {
    return { mean: 0, min: 0, max: 0, stdDev: 0 };
  }

  const n = pixelData.length;
  const sum = pixelData.reduce((acc, val) => acc + val, 0);
  const mean = sum / n;

  const min = Math.min(...pixelData);
  const max = Math.max(...pixelData);

  const variance = pixelData.reduce((acc, val) => {
    const diff = val - mean;
    return acc + diff * diff;
  }, 0) / n;

  const stdDev = Math.sqrt(variance);

  return {
    mean: mean.toFixed(2),
    min: min.toFixed(2),
    max: max.toFixed(2),
    stdDev: stdDev.toFixed(2)
  };
}
