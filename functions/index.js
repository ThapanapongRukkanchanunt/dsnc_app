// index.js - Firebase Cloud Function Proxy for Google Cloud Vision API
const { onRequest } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");

/**
 * Cloud Function to securely proxy requests to Google Cloud Vision API.
 * Uses Firebase Secret Manager to secure the Vision API Key.
 */
exports.detectSpecies = onRequest({
  cors: true, // Enable CORS so it can be called from localhost and GitHub Pages
  secrets: ["VISION_API_KEY"], // Load the API key securely from GCP Secret Manager
  minInstances: 0
}, async (req, res) => {
  try {
    // Only allow POST requests
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method Not Allowed. Use POST." });
      return;
    }

    // Retrieve image data (base64 string) from request body
    const { image } = req.body;
    if (!image) {
      res.status(400).json({ error: "Bad Request. Missing 'image' field (base64)." });
      return;
    }

    const apiKey = process.env.VISION_API_KEY;
    if (!apiKey) {
      logger.error("VISION_API_KEY is not defined. Please configure secrets.");
      res.status(500).json({ error: "Internal Server Error. API configuration missing." });
      return;
    }

    logger.info("Calling Google Cloud Vision API...");

    // Send request to Google Cloud Vision API using native Node fetch
    const response = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        requests: [
          {
            image: {
              content: image
            },
            features: [
              {
                type: "LABEL_DETECTION",
                maxResults: 15
              },
              {
                type: "OBJECT_LOCALIZATION",
                maxResults: 5
              }
            ]
          }
        ]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      logger.error("Vision API Error Response:", errText);
      res.status(502).json({ error: "Bad Gateway. Vision API returned an error." });
      return;
    }

    const result = await response.json();
    const visionResponse = result.responses && result.responses[0] ? result.responses[0] : {};

    // Format the annotations nicely for the frontend client
    const labels = (visionResponse.labelAnnotations || []).map(label => ({
      description: label.description.toLowerCase(),
      score: label.score
    }));

    const objects = (visionResponse.localizedObjectAnnotations || []).map(obj => ({
      name: obj.name.toLowerCase(),
      score: obj.score,
      // Google returns normalized vertices [0, 1]
      vertices: obj.boundingPoly && obj.boundingPoly.normalizedVertices ? obj.boundingPoly.normalizedVertices : []
    }));

    logger.info(`Successfully processed image. Detected labels: ${labels.slice(0, 3).map(l => l.description).join(", ")}`);

    res.status(200).json({
      success: true,
      labels,
      objects
    });
  } catch (err) {
    logger.error("Exception in detectSpecies cloud function:", err);
    res.status(500).json({ error: "Internal Server Error." });
  }
});
