// detector.js - TensorFlow.js Animal Detection Service for Doi Suthep App

let model = null;
let isModelLoading = false;

/**
 * Loads the COCO-SSD model if not already loaded.
 */
export async function loadDetectionModel() {
  if (model) return model;
  if (isModelLoading) {
    // Wait for model to load
    while (isModelLoading) {
      await new Promise(r => setTimeout(r, 100));
    }
    return model;
  }

  if (typeof window.cocoSsd === 'undefined') {
    console.warn('TensorFlow.js COCO-SSD library is not loaded on window.');
    return null;
  }

  isModelLoading = true;
  try {
    console.log('Loading client-side COCO-SSD model...');
    model = await window.cocoSsd.load({
      base: 'lite_mobilenet_v2' // Lightweight for mobile browsers
    });
    console.log('COCO-SSD model loaded successfully.');
  } catch (err) {
    console.error('Failed to load COCO-SSD model:', err);
  } finally {
    isModelLoading = false;
  }

  return model;
}

/**
 * Detects animals in an HTML Image element.
 * Returns normalized bounding box { x, y, width, height } (0 to 1) and details.
 * Falls back to a default centered box if no animal is detected.
 * 
 * @param {HTMLImageElement} imageElement
 * @returns {Promise<Object>} { boundingBox, detectedLabel, confidence, success }
 */
export async function detectAnimals(imageElement) {
  const defaultBox = { x: 0.25, y: 0.25, width: 0.5, height: 0.5 };
  
  try {
    const loadedModel = await loadDetectionModel();
    if (!loadedModel) {
      console.warn('Object detector unavailable. Using manual fallback.');
      return {
        boundingBox: defaultBox,
        detectedLabel: 'animal',
        confidence: 0,
        success: false,
        reason: 'model_not_loaded'
      };
    }

    // Run prediction
    const predictions = await loadedModel.detect(imageElement);
    console.log('Raw predictions:', predictions);

    // Filter for common animal classes in COCO-SSD
    const animalClasses = [
      'bird', 'cat', 'dog', 'horse', 'sheep', 'cow', 'elephant', 'bear', 'zebra', 'giraffe', 'butterfly', 'insect', 'reptile', 'snake'
    ];

    // Find the highest confidence animal prediction
    const animalPrediction = predictions
      .filter(p => animalClasses.includes(p.class) || p.class === 'person') // person is included just in case for testing, or we filter strictly to animal
      .filter(p => animalClasses.includes(p.class)) // Keep strictly animals
      .sort((a, b) => b.score - a.score)[0];

    if (animalPrediction) {
      const imgWidth = imageElement.naturalWidth || imageElement.width;
      const imgHeight = imageElement.naturalHeight || imageElement.height;
      const [px, py, pWidth, pHeight] = animalPrediction.bbox;

      // Normalize coordinates
      const box = {
        x: Math.max(0, px / imgWidth),
        y: Math.max(0, py / imgHeight),
        width: Math.min(1, pWidth / imgWidth),
        height: Math.min(1, pHeight / imgHeight)
      };

      console.log('Detected animal:', animalPrediction.class, 'Box:', box);
      
      return {
        boundingBox: box,
        detectedLabel: animalPrediction.class,
        confidence: animalPrediction.score,
        success: true
      };
    } else {
      console.log('No animals detected in image. Using default centered box.');
      return {
        boundingBox: defaultBox,
        detectedLabel: 'wildlife',
        confidence: 0,
        success: false,
        reason: 'no_animal_detected'
      };
    }
  } catch (err) {
    console.error('Error in object detection:', err);
    return {
      boundingBox: defaultBox,
      detectedLabel: 'wildlife',
      confidence: 0,
      success: false,
      reason: 'detection_error'
    };
  }
}
