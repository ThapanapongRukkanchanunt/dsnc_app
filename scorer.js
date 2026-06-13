// scorer.js - Scoring Engine for Doi Suthep Wildlife Photography Web App

/**
 * Calculates the Game Score and Research Grade for an observation.
 * 
 * @param {Object} boundingBox - { x, y, width, height } in normalized coordinates (0 to 1)
 * @param {number} rarityMultiplier - Multiplier from species (e.g., 1.0, 1.5, 3.0, 5.0)
 * @param {Object} gps - { latitude, longitude, accuracy }
 * @param {boolean} userConfirmed - Whether the species selection was confirmed by the user
 * @param {string} speciesSource - 'local' | 'inaturalist' | 'custom'
 * @returns {Object} { gameMetrics, researchMetrics }
 */
export function calculateMetrics(boundingBox, rarityMultiplier = 1.0, gps = null, userConfirmed = false, speciesSource = 'local') {
  const { x, y, width, height } = boundingBox;
  
  // 1. GAME SCORE CALCULATIONS
  // Size Score: Peak score at 25% area (good distance photography composition).
  // Too small = low score. Too large = warning/penalty (to discourage getting too close).
  const area = width * height;
  const optimalArea = 0.25;
  // Gaussian-like curve for size score: peaks at 1000 when area is 0.25
  const sizeScore = Math.round(1000 * Math.exp(-Math.pow(area - optimalArea, 2) / 0.04));

  // Centering Score: Distance from bounding box center to the canvas center (0.5, 0.5)
  const boxCenterX = x + width / 2;
  const boxCenterY = y + height / 2;
  const distance = Math.sqrt(Math.pow(boxCenterX - 0.5, 2) + Math.pow(boxCenterY - 0.5, 2));
  // Gaussian decay for centering: peaks at 1000 when centered (distance = 0)
  const centeringScore = Math.round(1000 * Math.exp(-Math.pow(distance, 2) / 0.06));

  const totalBaseScore = sizeScore + centeringScore;
  const totalScore = Math.round(totalBaseScore * rarityMultiplier);

  // 2. RESEARCH QUALITY METRICS
  let gpsQuality = 'low';
  let gpsAccuracy = 999;
  
  if (gps && typeof gps.accuracy === 'number') {
    gpsAccuracy = gps.accuracy;
    if (gpsAccuracy <= 15) {
      gpsQuality = 'high';
    } else if (gpsAccuracy <= 50) {
      gpsQuality = 'medium';
    }
  }

  let scientificConfidence = 0.3; // Default low
  if (speciesSource === 'local') {
    scientificConfidence = 1.0;
  } else if (speciesSource === 'inaturalist') {
    scientificConfidence = 0.75;
  }

  // Research Grade requires:
  // - Verified species selection (userConfirmed === true)
  // - High GPS quality (accuracy <= 15m)
  // - Known species source (local catalog or verified iNaturalist search)
  const researchGrade = userConfirmed && gpsQuality === 'high' && speciesSource !== 'custom';

  return {
    gameMetrics: {
      sizeScore,
      centeringScore,
      rarityMultiplier,
      totalScore
    },
    researchMetrics: {
      gpsQuality,
      gpsAccuracy,
      scientificConfidence,
      researchGrade
    }
  };
}
