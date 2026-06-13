// camera.js - Camera Service for Doi Suthep Nature Center App

const MOCK_WILDLIFE = [
  { path: 'assets/wildlife/colugo.png', name: 'Sunda Colugo', speciesId: 'sunda_colugo' },
  { path: 'assets/wildlife/slow_loris.png', name: 'Bengal Slow Loris', speciesId: 'slow_loris' },
  { path: 'assets/wildlife/magpie.png', name: 'Red-billed Blue Magpie', speciesId: 'red_billed_blue_magpie' },
  { path: 'assets/wildlife/butterfly.png', name: 'Golden Birdwing Butterfly', speciesId: 'golden_birdwing' }
];

export class CameraService {
  constructor() {
    this.stream = null;
    this.isSimulator = false;
    this.simulatorInterval = null;
    this.currentMockIndex = 0;
    this.simulatedTime = 0;
    this.activeMock = null;
  }

  /**
   * Initializes the video stream. If it fails, starts simulator mode.
   * 
   * @param {HTMLVideoElement} videoElement 
   * @param {HTMLCanvasElement} simulatorCanvas 
   * @param {Function} onModeChange - callback (isSimulator: boolean, activeMock: Object | null)
   */
  async start(videoElement, simulatorCanvas, onModeChange) {
    this.stop(videoElement);
    this.isSimulator = false;
    this.activeMock = null;

    try {
      // Try to open WebRTC camera (environment facing)
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1080 },
          height: { ideal: 1080 },
          aspectRatio: { ideal: 1.0 }
        },
        audio: false
      });
      
      videoElement.srcObject = this.stream;
      videoElement.play();
      
      if (onModeChange) onModeChange(false, null);
    } catch (err) {
      console.warn('Camera access denied or unavailable. Switching to Simulator Mode:', err.message);
      this.isSimulator = true;
      this.startSimulator(simulatorCanvas, onModeChange);
    }
  }

  /**
   * Starts simulated viewfinder drawing on a canvas
   */
  startSimulator(canvas, onModeChange) {
    this.isSimulator = true;
    const ctx = canvas.getContext('2d');
    
    // Choose a random starting animal
    this.currentMockIndex = Math.floor(Math.random() * MOCK_WILDLIFE.length);
    this.activeMock = MOCK_WILDLIFE[this.currentMockIndex];
    this.simulatedTime = 0;

    if (onModeChange) onModeChange(true, this.activeMock);

    // Preload all mock images
    const images = MOCK_WILDLIFE.map(item => {
      const img = new Image();
      img.src = item.path;
      return img;
    });

    const drawFrame = () => {
      if (!this.isSimulator) return;

      const img = images[this.currentMockIndex];
      this.activeMock = MOCK_WILDLIFE[this.currentMockIndex];
      
      if (img.complete) {
        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Calculate a panning / breathing effect
        // Animates scale between 1.0 and 1.25, and pans center coordinates
        this.simulatedTime += 0.015;
        const scale = 1.1 + Math.sin(this.simulatedTime) * 0.08;
        const panX = Math.cos(this.simulatedTime * 0.7) * 25;
        const panY = Math.sin(this.simulatedTime * 0.5) * 25;

        const w = canvas.width;
        const h = canvas.height;
        const destW = w * scale;
        const destH = h * scale;
        const destX = (w - destW) / 2 + panX;
        const destY = (h - destH) / 2 + panY;

        ctx.drawImage(img, destX, destY, destW, destH);
      } else {
        // Draw loading text
        ctx.fillStyle = '#09090b';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#ff007f';
        ctx.font = '16px "Press Start 2P", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('กำลังเริ่มต้นโหมดจำลอง...', canvas.width / 2, canvas.height / 2);
      }

      // Draw camera lines (viewfinder, bounds, crosshair) in simulator
      this.drawRetroOverlay(canvas, ctx);

      this.simulatorInterval = requestAnimationFrame(drawFrame);
    };

    this.simulatorInterval = requestAnimationFrame(drawFrame);
  }

  nextMockAnimal(onModeChange) {
    if (!this.isSimulator) return;
    this.currentMockIndex = (this.currentMockIndex + 1) % MOCK_WILDLIFE.length;
    this.activeMock = MOCK_WILDLIFE[this.currentMockIndex];
    if (onModeChange) onModeChange(true, this.activeMock);
  }

  drawRetroOverlay(canvas, ctx) {
    const w = canvas.width;
    const h = canvas.height;

    // Grid lines (rule of thirds)
    ctx.strokeStyle = 'rgba(0, 225, 217, 0.15)';
    ctx.lineWidth = 1;
    // vertical
    ctx.beginPath();
    ctx.moveTo(w / 3, 0); ctx.lineTo(w / 3, h);
    ctx.moveTo((w / 3) * 2, 0); ctx.lineTo((w / 3) * 2, h);
    // horizontal
    ctx.moveTo(0, h / 3); ctx.lineTo(w, h / 3);
    ctx.moveTo(0, (h / 3) * 2); ctx.lineTo(w, (h / 3) * 2);
    ctx.stroke();

    // Viewfinder brackets
    ctx.strokeStyle = '#00e1d9';
    ctx.lineWidth = 3;
    const size = 30;
    const pad = 20;

    // Top Left
    ctx.beginPath();
    ctx.moveTo(pad, pad + size); ctx.lineTo(pad, pad); ctx.lineTo(pad + size, pad);
    // Top Right
    ctx.moveTo(w - pad - size, pad); ctx.lineTo(w - pad, pad); ctx.lineTo(w - pad, pad + size);
    // Bottom Left
    ctx.moveTo(pad, h - pad - size); ctx.lineTo(pad, h - pad); ctx.lineTo(pad + size, h - pad);
    // Bottom Right
    ctx.moveTo(w - pad - size, h - pad); ctx.lineTo(w - pad, h - pad); ctx.lineTo(w - pad, h - pad - size);
    ctx.stroke();

    // Center Crosshair
    ctx.strokeStyle = '#ff007f';
    ctx.lineWidth = 2;
    ctx.beginPath();
    // vertical center
    ctx.moveTo(w / 2, h / 2 - 15); ctx.lineTo(w / 2, h / 2 + 15);
    // horizontal center
    ctx.moveTo(w / 2 - 15, h / 2); ctx.lineTo(w / 2 + 15, h / 2);
    ctx.stroke();
    // Center dot
    ctx.fillStyle = '#ff007f';
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  /**
   * Captures the current frame and returns a Blob
   */
  async capture(videoElement, simulatorCanvas) {
    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1080;
    const ctx = canvas.getContext('2d');

    if (this.isSimulator) {
      // Capture the current canvas frame of simulator
      ctx.drawImage(simulatorCanvas, 0, 0, 1080, 1080);
    } else {
      // Capture the live video stream (crop to square)
      let vWidth = videoElement.videoWidth;
      let vHeight = videoElement.videoHeight;

      // Fallback if dimensions are 0 (e.g. metadata not ready)
      if (!vWidth || !vHeight) {
        vWidth = videoElement.clientWidth || 640;
        vHeight = videoElement.clientHeight || 480;
      }

      const minDim = Math.min(vWidth, vHeight);
      const sx = (vWidth - minDim) / 2;
      const sy = (vHeight - minDim) / 2;

      ctx.drawImage(videoElement, sx, sy, minDim, minDim, 0, 0, 1080, 1080);
    }

    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        resolve(blob);
      }, 'image/jpeg', 0.85);
    });
  }

  /**
   * Stops the camera stream or simulator
   */
  stop(videoElement) {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    
    if (videoElement) {
      videoElement.srcObject = null;
    }

    if (this.isSimulator && this.simulatorInterval) {
      cancelAnimationFrame(this.simulatorInterval);
      this.simulatorInterval = null;
    }
    this.isSimulator = false;
  }
}
export const cameraService = new CameraService();
export default cameraService;
