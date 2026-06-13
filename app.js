// app.js - Main Application Controller for Doi Suthep Wildlife Photography Web App

import { DSNCDatabase } from './db.js';
import { calculateMetrics } from './scorer.js';
import { cameraService } from './camera.js';
import { BoundingBoxOverlay } from './adjuster.js';
import { detectAnimals, identifySpeciesViaCloud } from './detector.js';

function generateUUID() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

class DSNCApp {
  constructor() {
    this.db = new DSNCDatabase();
    
    // App State
    this.currentView = 'welcome';
    this.observations = [];
    this.speciesCatalog = [];
    this.activeObservation = null; // Holds temp data of captured photo before saving
    this.activeGPS = null;
    this.gpsWatchId = null;
    this.boundingBoxOverlay = null;
    
    // Elements Cache
    this.views = {};
  }

  async init() {
    console.log('Initializing Doi Suthep Wildlife App...');
    await this.db.init();
    
    // Load species database
    this.speciesCatalog = await this.db.getSpeciesList();
    
    // Cache views
    document.querySelectorAll('.app-view').forEach(view => {
      this.views[view.id] = view;
    });

    // Load initial observations
    await this.refreshObservations();

    // Bind Button Event Listeners
    this.bindButtons();

    // Render initial dashboard stats
    this.updateStats();

    // Navigate to initial view
    this.navigateTo('view-welcome');
  }

  // --- NAVIGATION & VIEWS ---
  navigateTo(viewId) {
    console.log(`Navigating to ${viewId}`);
    
    // Deactivate current services if leaving specific screens
    if (this.currentView === 'view-camera' && viewId !== 'view-camera') {
      this.stopCameraAndGPS();
    }
    
    if (this.boundingBoxOverlay && viewId !== 'view-analysis') {
      this.boundingBoxOverlay.destroy();
      this.boundingBoxOverlay = null;
    }

    // Hide all views, show target view
    Object.keys(this.views).forEach(id => {
      this.views[id].classList.add('hidden');
    });
    this.views[viewId].classList.remove('hidden');
    this.currentView = viewId;

    // View entering logic
    if (viewId === 'view-dashboard') {
      this.renderDashboardList();
      this.updateStats();
    } else if (viewId === 'view-camera') {
      this.startCameraAndGPS();
    }
  }

  // --- CAMERA & GPS SERVICES ---
  async startCameraAndGPS() {
    const video = document.getElementById('camera-video');
    const simCanvas = document.getElementById('camera-sim-canvas');
    const gpsStatusText = document.getElementById('gps-status-text');
    const gpsAccuracyText = document.getElementById('gps-accuracy-text');
    const swapTargetBtn = document.getElementById('btn-swap-target');
    
    gpsStatusText.textContent = 'กำลังค้นหาสัญญาณ GPS...';
    gpsAccuracyText.textContent = '---';
    this.activeGPS = null;

    // Start Geolocation watch
    if (navigator.geolocation) {
      this.gpsWatchId = navigator.geolocation.watchPosition(
        (position) => {
          this.activeGPS = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: Math.round(position.coords.accuracy),
            altitude: position.coords.altitude
          };
          
          gpsStatusText.textContent = 'สัญญาณ GPS พร้อมใช้งาน';
          gpsStatusText.className = 'text-green-400 font-bold';
          gpsAccuracyText.textContent = `${this.activeGPS.accuracy} เมตร`;
          
          if (this.activeGPS.accuracy <= 15) {
            gpsAccuracyText.className = 'text-green-400 font-bold';
          } else {
            gpsAccuracyText.className = 'text-yellow-400 font-bold';
          }
        },
        (error) => {
          console.warn('GPS error:', error.message);
          gpsStatusText.textContent = 'ไม่มีสัญญาณ GPS';
          gpsStatusText.className = 'text-red-500 font-bold';
          gpsAccuracyText.textContent = 'ไม่มีสัญญาณ';
          gpsAccuracyText.className = 'text-red-500 font-bold';
          this.activeGPS = null;
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    } else {
      gpsStatusText.textContent = 'อุปกรณ์ไม่รองรับ GPS';
      gpsStatusText.className = 'text-red-500 font-bold';
      this.activeGPS = null;
    }

    // Start camera stream
    await cameraService.start(video, simCanvas, (isSim, mockInfo) => {
      if (isSim) {
        // Show simulator UI
        video.classList.add('hidden');
        simCanvas.classList.remove('hidden');
        swapTargetBtn.classList.remove('hidden');
        document.getElementById('camera-mode-badge').textContent = 'โหมดจำลองส่องสัตว์';
        document.getElementById('camera-mode-badge').className = 'bg-yellow-500 text-black px-2 py-0.5 border border-black font-arcade text-[10px] animate-pulse';
        
        // Populate temporary GPS for simulator testing
        if (!this.activeGPS) {
          this.activeGPS = {
            latitude: 18.8021 + (Math.random() - 0.5) * 0.01,
            longitude: 98.9216 + (Math.random() - 0.5) * 0.01,
            accuracy: Math.floor(Math.random() * 8) + 3, // Excellent simulated GPS
            altitude: 350
          };
          gpsStatusText.textContent = 'จำลองพิกัดสำเร็จ';
          gpsStatusText.className = 'text-green-400 font-bold';
          gpsAccuracyText.textContent = `${this.activeGPS.accuracy} เมตร`;
          gpsAccuracyText.className = 'text-green-400 font-bold';
        }
      } else {
        // Show live camera UI
        video.classList.remove('hidden');
        simCanvas.classList.add('hidden');
        swapTargetBtn.classList.add('hidden');
        document.getElementById('camera-mode-badge').textContent = 'โหมดกล้องถ่ายภาพจริง';
        document.getElementById('camera-mode-badge').className = 'bg-red-500 text-white px-2 py-0.5 border border-black font-arcade text-[10px]';
      }
    });
  }

  stopCameraAndGPS() {
    cameraService.stop(document.getElementById('camera-video'));
    if (this.gpsWatchId) {
      navigator.geolocation.clearWatch(this.gpsWatchId);
      this.gpsWatchId = null;
    }
  }

  async handleCapture() {
    try {
      const video = document.getElementById('camera-video');
      const simCanvas = document.getElementById('camera-sim-canvas');
      
      // Play camera beep/click visually
      const flashOverlay = document.createElement('div');
      flashOverlay.className = 'absolute inset-0 bg-white z-50 animate-fade-out pointer-events-none';
      document.getElementById('view-camera').appendChild(flashOverlay);
      setTimeout(() => flashOverlay.remove(), 500);

      const blob = await cameraService.capture(video, simCanvas);
      const photoUrl = URL.createObjectURL(blob);

      // Initial setup for observation metadata
      this.activeObservation = {
        id: generateUUID(),
        timestamp: new Date().toISOString(),
        photoBlob: blob,
        photoUrl: photoUrl, // temp URL for drawing
        photoMetadata: {
          width: 1080,
          height: 1080,
          mimeType: 'image/jpeg'
        },
        gps: this.activeGPS || { latitude: 0, longitude: 0, accuracy: 999, altitude: null },
        boundingBox: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 },
        species: {
          id: '',
          commonName: 'สัตว์ป่าไม่ทราบชนิด',
          scientificName: 'ไม่สามารถระบุได้',
          userConfirmed: false,
          source: 'custom'
        },
        gameMetrics: { sizeScore: 0, centeringScore: 0, rarityMultiplier: 1.0, totalScore: 0 },
        researchMetrics: { gpsQuality: 'low', scientificConfidence: 0.1, researchGrade: false },
        submitted: false
      };

      // If camera is in simulator mode, grab the current mock target's ID
      if (cameraService.isSimulator && cameraService.activeMock) {
        const targetSpecies = this.speciesCatalog.find(s => s.id === cameraService.activeMock.speciesId);
        if (targetSpecies) {
          this.activeObservation.species.id = targetSpecies.id;
          this.activeObservation.species.commonName = targetSpecies.commonName;
          this.activeObservation.species.scientificName = targetSpecies.scientificName;
          this.activeObservation.species.source = 'local';
        }
      }

      // Stop camera and go to analysis loading screen
      this.navigateTo('view-analysis');
      this.runObjectDetection();
    } catch (err) {
      console.error('Error capturing image:', err);
      alert('บันทึกรูปภาพไม่สำเร็จ: ' + err.message);
      this.navigateTo('view-dashboard');
    }
  }

  // --- AI DETECTION & ADJUSTMENT ---
  async runObjectDetection() {
    const analysisImg = document.getElementById('analysis-image-element');
    const loadingText = document.getElementById('analysis-loading-text');
    const adjusterContainer = document.getElementById('adjuster-container');
    const adjusterInstructions = document.getElementById('adjuster-instructions');
    const adjusterActions = document.getElementById('adjuster-actions');

    // Show loading, hide canvas container
    loadingText.classList.remove('hidden');
    adjusterContainer.classList.add('hidden');
    adjusterInstructions.classList.add('hidden');
    adjusterActions.classList.add('hidden');

    // Set source of analysis image (hidden DOM img used for TF.js)
    analysisImg.src = this.activeObservation.photoUrl;

    // Wait for image to load before running TF
    await new Promise((resolve) => {
      analysisImg.onload = resolve;
    });

    // Run TensorFlow model detection
    const result = await detectAnimals(analysisImg);
    this.activeObservation.boundingBox = result.boundingBox;

    // Setup interactive overlay adjuster
    loadingText.classList.add('hidden');
    adjusterContainer.classList.remove('hidden');
    adjusterInstructions.classList.remove('hidden');
    adjusterActions.classList.remove('hidden');

    this.boundingBoxOverlay = new BoundingBoxOverlay(
      adjusterContainer,
      this.activeObservation.photoUrl,
      this.activeObservation.boundingBox,
      (newBox) => {
        this.activeObservation.boundingBox = newBox;
      }
    );
  }

  async handleAnalysisProceed() {
    if (this.boundingBoxOverlay) {
      this.activeObservation.boundingBox = this.boundingBoxOverlay.getBox();
    }

    const loadingText = document.getElementById('analysis-loading-text');
    const adjusterContainer = document.getElementById('adjuster-container');
    const adjusterInstructions = document.getElementById('adjuster-instructions');
    const adjusterActions = document.getElementById('adjuster-actions');

    // Show loading spinner, hide crop adjuster controls
    loadingText.classList.remove('hidden');
    adjusterContainer.classList.add('hidden');
    adjusterInstructions.classList.add('hidden');
    adjusterActions.classList.add('hidden');

    // Update loading text to reflect Cloud AI processing
    const pulseText = loadingText.querySelector('.animate-pulse');
    const descText = loadingText.querySelector('.font-body');
    const originalPulse = pulseText.textContent;
    const originalDesc = descText.textContent;

    pulseText.textContent = 'พี่ซายม่อนกำลังวิเคราะห์จำแนกสัตว์ด้วย Cloud AI...';
    descText.textContent = 'ระบบกำลังส่งภาพที่ครอปไปยังคลาวด์เพื่อตรวจจับรายละเอียดสายพันธุ์อย่างแม่นยำ กรุณารอสักครู่นะครับ!';

    try {
      // 1. Crop image to bounding box & get base64
      const croppedBase64 = await this.getCroppedImageBase64();

      // 2. Call Firebase Cloud Function
      const cloudResult = await identifySpeciesViaCloud(croppedBase64);
      console.log('Cloud Identification Result:', cloudResult);

      // 3. Keep results in active observation
      this.activeObservation.cloudVisionLabels = cloudResult.success ? cloudResult.labels : [];
      
      // Auto-match or find best suggestion from our curated catalog
      const bestMatch = this.findBestSpeciesMatch(this.activeObservation.cloudVisionLabels);
      if (bestMatch) {
        this.activeObservation.species = {
          id: bestMatch.id,
          commonName: bestMatch.commonName,
          scientificName: bestMatch.scientificName,
          userConfirmed: false, // will be confirmed by user on next screen
          source: 'local'
        };
      } else {
        this.activeObservation.species = {
          id: '',
          commonName: '',
          scientificName: '',
          userConfirmed: false,
          source: 'local'
        };
      }
    } catch (err) {
      console.error('Error in species recognition:', err);
      this.activeObservation.species = {
        id: '',
        commonName: '',
        scientificName: '',
        userConfirmed: false,
        source: 'local'
      };
    } finally {
      // Restore loading text for next captures
      pulseText.textContent = originalPulse;
      descText.textContent = originalDesc;

      // Navigate to species selection screen
      this.navigateTo('view-species');
      this.setupSpeciesSelector();
    }
  }

  /**
   * Crops the observation image to the user's bounding box and returns a base64 string.
   */
  async getCroppedImageBase64() {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        try {
          const box = this.activeObservation.boundingBox;
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');

          const nw = img.naturalWidth || img.width;
          const nh = img.naturalHeight || img.height;

          // Calculate pixel boundaries from normalized coordinates [0, 1]
          const sx = Math.floor(box.x * nw);
          const sy = Math.floor(box.y * nh);
          const sWidth = Math.floor(box.width * nw);
          const sHeight = Math.floor(box.height * nh);

          // Prevent 0 width/height canvas errors
          canvas.width = Math.max(1, sWidth);
          canvas.height = Math.max(1, sHeight);

          // Draw cropped section to canvas
          ctx.drawImage(
            img,
            sx, sy, sWidth, sHeight,
            0, 0, canvas.width, canvas.height
          );

          // Export as compressed JPEG
          resolve(canvas.toDataURL('image/jpeg', 0.8));
        } catch (err) {
          reject(err);
        }
      };
      img.onerror = (err) => reject(err);
      img.src = this.activeObservation.photoUrl;
    });
  }

  /**
   * Tries to find a match in our local catalog based on Google Cloud Vision labels.
   */
  findBestSpeciesMatch(labels) {
    if (!labels || labels.length === 0) return null;

    // Label mapping (lowercase Vision label -> local catalog ID)
    const labelMapping = {
      'flying lemur': 'sunda_colugo',
      'colugo': 'sunda_colugo',
      'galeopterus': 'sunda_colugo',
      
      'slow loris': 'slow_loris',
      'loris': 'slow_loris',
      'nycticebus': 'slow_loris',
      'primate': 'slow_loris',
      
      'pheasant': 'siamese_fireback',
      'fireback': 'siamese_fireback',
      'lophura': 'siamese_fireback',
      
      'magpie': 'red_billed_blue_magpie',
      'blue magpie': 'red_billed_blue_magpie',
      'urocissa': 'red_billed_blue_magpie',
      
      'gecko': 'bent_toed_gecko',
      'lizard': 'bent_toed_gecko',
      
      'viper': 'green_pit_viper',
      'pit viper': 'green_pit_viper',
      'trimeresurus': 'green_pit_viper',
      
      'moth': 'atlas_moth',
      'atlas moth': 'atlas_moth',
      'attacus': 'atlas_moth',
      
      'butterfly': 'golden_birdwing',
      'birdwing': 'golden_birdwing',
      'troides': 'golden_birdwing'
    };

    // Find first matching keyword with highest confidence
    for (const label of labels) {
      const desc = label.description.toLowerCase();
      if (labelMapping[desc]) {
        const speciesId = labelMapping[desc];
        const match = this.speciesCatalog.find(s => s.id === speciesId);
        if (match) return match;
      }
      
      // Substring check
      for (const key of Object.keys(labelMapping)) {
        if (desc.includes(key)) {
          const speciesId = labelMapping[key];
          const match = this.speciesCatalog.find(s => s.id === speciesId);
          if (match) return match;
        }
      }
    }

    return null;
  }

  /**
   * Helper to check if any of the labels indicate a domestic animal.
   */
  checkIfDomesticAnimal(labels) {
    if (!labels) return false;
    const domesticKeywords = ['dog', 'cat', 'domestic cat', 'canine', 'puppy', 'kitten', 'felidae', 'canidae'];
    return labels.some(label => domesticKeywords.includes(label.description.toLowerCase()));
  }

  // --- SPECIES SELECTOR & ONLINE SEARCH ---
  setupSpeciesSelector() {
    const photoThumb = document.getElementById('species-photo-thumbnail');
    photoThumb.src = this.activeObservation.photoUrl;

    // Reset search input fields
    document.getElementById('species-search-input').value = '';
    this.renderSpeciesList(this.speciesCatalog);
    
    const speechBubble = document.getElementById('scimon-speech-bubble');
    const labels = this.activeObservation.cloudVisionLabels || [];
    const isDomestic = this.checkIfDomesticAnimal(labels);

    if (isDomestic) {
      speechBubble.innerHTML = `⚠️ <strong>นั่นมันสัตว์เลี้ยงนี่นา! 🐶🐱</strong> พี่ซายม่อนตรวจพบสัตว์เลี้ยงบ้านครับ แอปนี้สร้างขึ้นสำหรับสัตว์ป่าตามธรรมชาติบนดอยสุเทพเท่านั้นนะคร้าบ ลองไปหาส่องสัตว์ป่ามาบันทึกใหม่นะ!`;
    } else if (this.activeObservation.species.id) {
      const match = this.speciesCatalog.find(s => s.id === this.activeObservation.species.id);
      if (match) {
        this.selectSpecies(match);
        speechBubble.innerHTML = `✨ <strong>พี่ซายม่อนชี้แนะ:</strong> ผลการวิเคราะห์เสร็จสิ้น! ตรวจพบลักษณะภาพคล้ายกับ <strong>"${match.commonName}"</strong> ลองตรวจสอบความถูกต้องและรายละเอียดด้านขวาได้เลยครับ!`;
        return;
      }
    } else {
      const topLabels = labels.slice(0, 3).map(l => l.description).join(', ');
      if (topLabels) {
        speechBubble.innerHTML = `🔍 <strong>พี่ซายม่อนชี้แนะ:</strong> พี่ซายม่อนไม่คุ้นตัวนี้เลย! ป้ายกำกับที่ Cloud AI แนะนำคือ: <em>${topLabels}</em> ลองเลือกจากตารางที่ใกล้เคียง หรือค้นเพิ่มบน iNaturalist นะครับ!`;
      } else {
        speechBubble.innerHTML = `"เลือกชื่อของสัตว์ตัวในภาพจากตารางตรงกลางได้เลยครับ ยิ่งตัวที่ระดับความหายากสูงๆ จะทวีคูณคะแนนให้เยอะเลยล่ะครับน้องๆ!"`;
      }
    }

    // Default select first item if nothing pre-selected
    this.selectSpecies(this.speciesCatalog[0]);
  }


  renderSpeciesList(list, highlightId = null) {
    const container = document.getElementById('species-list-container');
    container.innerHTML = '';

    const rarityColors = {
      common: 'text-neutral-400',
      uncommon: 'text-blue-400',
      rare: 'text-pink-500',
      legendary: 'text-yellow-400 animate-pulse font-bold'
    };

    const rarityTh = {
      common: 'ทั่วไป',
      uncommon: 'ค่อนข้างยาก',
      rare: 'พบยาก',
      legendary: 'หายากระดับตำนาน! 🌟'
    };

    list.forEach(item => {
      const btn = document.createElement('button');
      btn.className = `w-full text-left px-3 py-2 border-2 border-black flex justify-between items-center transition-all ${
        highlightId === item.id 
          ? 'bg-yellow-400 text-black font-bold retro-border-yellow' 
          : 'bg-neutral-800 text-neutral-200 border-neutral-700 hover:bg-neutral-700'
      }`;
      btn.onclick = () => this.selectSpecies(item);

      btn.innerHTML = `
        <div>
          <div class="font-bold font-body text-sm text-white group-hover:text-black">${item.commonName}</div>
          <div class="text-xs italic text-neutral-400">${item.scientificName}</div>
        </div>
        <div class="font-body text-xs font-bold uppercase ${rarityColors[item.rarity] || 'text-white'}">
          ${rarityTh[item.rarity] || item.rarity}
        </div>
      `;
      container.appendChild(btn);
    });
  }

  selectSpecies(species) {
    // Save to active observation
    this.activeObservation.species = {
      id: species.id,
      commonName: species.commonName,
      scientificName: species.scientificName,
      userConfirmed: true,
      source: species.source || 'local'
    };

    // Update details panel
    document.getElementById('species-detail-name').textContent = species.commonName;
    document.getElementById('species-detail-scientific').textContent = species.scientificName;
    document.getElementById('species-detail-description').textContent = species.description;
    
    const conservationBadge = document.getElementById('species-detail-conservation');
    conservationBadge.textContent = `IUCN: ${species.conservationStatus}`;
    
    // Status colors
    const conservationColors = {
      'LC': 'bg-green-600 text-white',
      'NT': 'bg-green-700 text-white',
      'VU': 'bg-yellow-500 text-black',
      'EN': 'bg-orange-600 text-white',
      'CR': 'bg-red-600 text-white animate-pulse'
    };
    conservationBadge.className = `px-2 py-0.5 border border-black text-xs font-bold ${conservationColors[species.conservationStatus] || 'bg-neutral-700 text-white'}`;

    // Rarity Badge
    const rarityTh = {
      common: 'ทั่วไป',
      uncommon: 'ค่อนข้างยาก',
      rare: 'พบยาก',
      legendary: 'หายากระดับตำนาน! 🌟'
    };
    const rarityBadge = document.getElementById('species-detail-rarity');
    rarityBadge.textContent = `${rarityTh[species.rarity] || species.rarity} (${species.rarityMultiplier} เท่า)`;
    const rarityBadgeColors = {
      common: 'bg-neutral-700 text-white',
      uncommon: 'bg-blue-600 text-white',
      rare: 'bg-pink-600 text-white',
      legendary: 'bg-yellow-400 text-black font-bold animate-pulse'
    };
    rarityBadge.className = `px-2 py-0.5 border border-black text-xs font-bold ${rarityBadgeColors[species.rarity] || 'bg-neutral-700 text-white'}`;

    // Guidelines Box
    document.getElementById('species-detail-guidelines').textContent = species.ethicalGuidelines;

    // Refresh highlighted list item
    if (species.source === 'inaturalist') {
      this.renderSpeciesList(this.speciesCatalog, null); // remove highlights on local list
    } else {
      this.renderSpeciesList(this.speciesCatalog, species.id);
    }
  }

  async handleOnlineSearch() {
    const query = document.getElementById('species-search-input').value.trim();
    const resultsHeader = document.getElementById('species-list-header');
    
    if (!query) {
      resultsHeader.textContent = 'สัตว์ป่าที่พบบ่อยบนดอยสุเทพ:';
      this.renderSpeciesList(this.speciesCatalog, this.activeObservation.species.id);
      return;
    }

    resultsHeader.textContent = 'กำลังสแกนหาบน iNaturalist...';

    try {
      const response = await fetch(`https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(query)}&rank=species&per_page=10`);
      if (!response.ok) throw new Error('Search failed');
      const data = await response.json();
      
      const searchResults = data.results.map(item => {
        const nameTh = item.preferred_common_name || item.name;
        
        let rarity = 'common';
        let rarityMultiplier = 1.0;
        if (item.observations_count < 100) {
          rarity = 'legendary';
          rarityMultiplier = 5.0;
        } else if (item.observations_count < 2000) {
          rarity = 'rare';
          rarityMultiplier = 3.0;
        } else if (item.observations_count < 10000) {
          rarity = 'uncommon';
          rarityMultiplier = 1.5;
        }

        const conservationStatus = item.threatened ? 'VU' : 'LC';

        return {
          id: `inat_${item.id}`,
          commonName: nameTh,
          scientificName: item.name,
          taxonGroup: item.iconic_taxon_name ? item.iconic_taxon_name.toLowerCase() : 'other',
          rarity,
          rarityMultiplier,
          description: `ดาวน์โหลดข้อมูลผ่านระบบ iNaturalist สถิติการพบเจอทั่วโลก: ${item.observations_count} ครั้ง`,
          conservationStatus,
          ethicalGuidelines: 'สัตว์นอกสารระบบดอยสุเทพ กรุณาเฝ้าสังเกตการณ์ระยะไกลและห้ามให้อาหารสัตว์ป่าทุกชนิดโดยเด็ดขาดครับ',
          source: 'inaturalist'
        };
      });

      resultsHeader.textContent = `พบสายพันธุ์อื่นๆ (${searchResults.length}):`;
      if (searchResults.length === 0) {
        const container = document.getElementById('species-list-container');
        container.innerHTML = '<div class="text-neutral-500 font-body text-center py-4">ไม่พบข้อมูลชื่อสัตว์ชนิดนี้เลยครับ ลองตรวจสอบความถูกต้องนะ</div>';
      } else {
        this.renderSpeciesList(searchResults, this.activeObservation.species.id);
      }
    } catch (err) {
      console.error('Online search error:', err);
      resultsHeader.textContent = 'การเชื่อมต่อขัดข้อง (ออฟไลน์?)';
    }
  }

  // --- RESULTS & SCORING ANIMATION ---
  handleConfirmSpecies() {
    this.navigateTo('view-results');
    this.runScoringAnimation();
  }

  runScoringAnimation() {
    let selectedSpecies = null;
    if (this.activeObservation.species.source === 'local') {
      selectedSpecies = this.speciesCatalog.find(s => s.id === this.activeObservation.species.id);
    }
    
    const multiplier = selectedSpecies ? selectedSpecies.rarityMultiplier : (this.activeObservation.species.rarityMultiplier || 1.0);
    const rarityName = selectedSpecies ? selectedSpecies.rarity : 'common';

    const metrics = calculateMetrics(
      this.activeObservation.boundingBox,
      multiplier,
      this.activeObservation.gps,
      this.activeObservation.species.userConfirmed,
      this.activeObservation.species.source
    );

    this.activeObservation.gameMetrics = metrics.gameMetrics;
    this.activeObservation.researchMetrics = metrics.researchMetrics;

    const rarityTh = {
      common: 'ทั่วไป',
      uncommon: 'ค่อนข้างยาก',
      rare: 'พบยาก',
      legendary: 'หายากระดับตำนาน! 🌟'
    };

    // Render details
    document.getElementById('results-species-name').textContent = this.activeObservation.species.commonName;
    document.getElementById('results-rarity-badge').textContent = rarityTh[rarityName] || rarityName;
    document.getElementById('results-gps-latlng').textContent = `พิกัด: ละติจูด ${this.activeObservation.gps.latitude.toFixed(6)} | ลองจิจูด ${this.activeObservation.gps.longitude.toFixed(6)}`;
    document.getElementById('results-gps-accuracy').textContent = `ความแม่นยำสัญญาณดาวเทียม GPS: ±${this.activeObservation.gps.accuracy} เมตร`;
    
    // Setup Mascot Warning speech
    const warningText = selectedSpecies ? selectedSpecies.ethicalGuidelines : 'กรุณาเฝ้าสังเกตสัตว์ป่าในระยะปลอดภัย ไม่รบกวนหรือขัดขวางวิถีชีวิตธรรมชาติของน้องๆ นะคร้าบ!';
    document.getElementById('results-mascot-warning-text').textContent = warningText;

    // Counters
    const sizeVal = document.getElementById('results-size-val');
    const centeringVal = document.getElementById('results-centering-val');
    const multiplierVal = document.getElementById('results-multiplier-val');
    const totalVal = document.getElementById('results-total-val');

    sizeVal.textContent = '0';
    centeringVal.textContent = '0';
    multiplierVal.textContent = '0.0 เท่า';
    totalVal.textContent = '0';

    const researchBadge = document.getElementById('results-grade-badge');
    researchBadge.classList.add('hidden');

    let currentSize = 0;
    let currentCentering = 0;
    const targetSize = metrics.gameMetrics.sizeScore;
    const targetCentering = metrics.gameMetrics.centeringScore;

    const countInterval = setInterval(() => {
      let done = true;
      if (currentSize < targetSize) {
        currentSize = Math.min(targetSize, currentSize + Math.ceil(targetSize / 15));
        sizeVal.textContent = currentSize;
        done = false;
      }
      if (currentCentering < targetCentering) {
        currentCentering = Math.min(targetCentering, currentCentering + Math.ceil(targetCentering / 15));
        centeringVal.textContent = currentCentering;
        done = false;
      }

      if (done) {
        clearInterval(countInterval);
        
        setTimeout(() => {
          multiplierVal.textContent = `${multiplier.toFixed(1)} เท่า`;
          multiplierVal.classList.add('scale-125', 'text-yellow-400');
          
          let curTotal = 0;
          const targetTotal = metrics.gameMetrics.totalScore;
          const totalInterval = setInterval(() => {
            if (curTotal < targetTotal) {
              curTotal = Math.min(targetTotal, curTotal + Math.ceil(targetTotal / 10));
              totalVal.textContent = curTotal;
            } else {
              clearInterval(totalInterval);
              multiplierVal.classList.remove('scale-125');
              
              if (metrics.researchMetrics.researchGrade) {
                researchBadge.classList.remove('hidden');
                researchBadge.classList.add('animate-bounce');
              }
            }
          }, 40);
        }, 300);
      }
    }, 30);
  }

  async handleSaveObservation() {
    if (!this.activeObservation) return;

    try {
      await this.db.saveObservation({
        id: this.activeObservation.id,
        timestamp: this.activeObservation.timestamp,
        photoBlob: this.activeObservation.photoBlob,
        photoMetadata: this.activeObservation.photoMetadata,
        gps: this.activeObservation.gps,
        boundingBox: this.activeObservation.boundingBox,
        species: this.activeObservation.species,
        gameMetrics: this.activeObservation.gameMetrics,
        researchMetrics: this.activeObservation.researchMetrics,
        submitted: false
      });

      URL.revokeObjectURL(this.activeObservation.photoUrl);
      this.activeObservation = null;

      await this.refreshObservations();
      this.navigateTo('view-dashboard');
    } catch (err) {
      console.error('Error saving observation:', err);
      alert('ไม่สามารถเซฟบันทึกรูปภาพได้: ' + err.message);
    }
  }

  // --- JOURNAL & STATS ---
  async refreshObservations() {
    this.observations = await this.db.getAllObservations();
  }

  updateStats() {
    const totalScore = this.observations.reduce((sum, obs) => sum + obs.gameMetrics.totalScore, 0);
    const uniqueSpecies = new Set(this.observations.map(obs => obs.species.id)).size;
    const researchGradeCount = this.observations.filter(obs => obs.researchMetrics.researchGrade).length;

    document.getElementById('stat-total-score').textContent = totalScore;
    document.getElementById('stat-species-found').textContent = uniqueSpecies;
    document.getElementById('stat-research-records').textContent = researchGradeCount;

    // Calculate unsent observations count
    const unsentCount = this.observations.filter(obs => !obs.submitted).length;
    const syncCountEl = document.getElementById('sync-count');
    if (syncCountEl) {
      syncCountEl.textContent = unsentCount;
    }
  }

  renderDashboardList() {
    const container = document.getElementById('journal-list-container');
    container.innerHTML = '';

    if (this.observations.length === 0) {
      container.innerHTML = `
        <div class="col-span-full border-4 border-dashed border-neutral-700 py-12 px-4 text-center rounded-xl">
          <div class="text-neutral-500 font-arcade text-xs mb-3">คลังสมุดบันทึกภาพยังว่างเปล่า</div>
          <div class="text-neutral-400 font-body text-sm max-w-xs mx-auto">กดปุ่ม "📸 เริ่มส่องสัตว์ป่า" เพื่อเก็บสะสมแต้มคะแนนและถ่ายภาพสัตว์ตัวแรกบนดอยสุเทพกันนะคร้าบ!</div>
        </div>
      `;
      return;
    }

    this.observations.forEach(obs => {
      const card = document.createElement('div');
      card.className = 'bg-neutral-900 border-4 border-black retro-border flex flex-col md:flex-row hover:border-pink-500 transition-colors group cursor-pointer';
      
      const imgUrl = URL.createObjectURL(obs.photoBlob);
      
      card.onclick = () => {
        this.showObservationDetailModal(obs, imgUrl);
      };

      const dateStr = new Date(obs.timestamp).toLocaleDateString('th-TH', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });

      const researchGradeTag = obs.researchMetrics.researchGrade 
        ? `<span class="bg-green-500 text-black px-1.5 py-0.5 border border-black font-body text-[9px] font-bold">บันทึกวิจัยคุณภาพ</span>`
        : `<span class="bg-neutral-800 text-neutral-400 px-1.5 py-0.5 border border-neutral-700 font-body text-[9px]">บันทึกเก็บแต้มทั่วไป</span>`;

      const syncTag = obs.submitted
        ? `<span class="bg-green-600/30 border border-green-500 text-green-400 px-1.5 py-0.5 font-body text-[8px] rounded">ส่งแล็บแล้ว</span>`
        : `<span class="bg-yellow-500/20 border border-yellow-500 text-yellow-400 px-1.5 py-0.5 font-body text-[8px] rounded animate-pulse">รอส่งแล็บ</span>`;

      card.innerHTML = `
        <div class="w-full md:w-32 aspect-square relative bg-neutral-950 flex-shrink-0">
          <img src="${imgUrl}" class="w-full h-full object-cover" onload="window.URL.revokeObjectURL('${imgUrl}')" />
          <div class="absolute bottom-1 left-1 font-arcade text-[8px] bg-black/80 text-pink-500 px-1 border border-black">
            +${obs.gameMetrics.totalScore}
          </div>
        </div>
        <div class="p-3 flex-grow flex flex-col justify-between">
          <div>
            <div class="flex justify-between items-start">
              <h4 class="font-body font-bold text-sm text-retro-yellow group-hover:text-pink-500 transition-colors">${obs.species.commonName}</h4>
              <div class="flex flex-col items-end gap-1.5">
                ${researchGradeTag}
                ${syncTag}
              </div>
            </div>
            <p class="text-xs italic text-neutral-400 font-body mt-0.5">${obs.species.scientificName}</p>
          </div>
          <div class="flex justify-between items-end mt-4 pt-2 border-t border-neutral-800">
            <div class="text-[9px] font-mono text-neutral-400">
              📍 ${obs.gps.latitude.toFixed(4)}, ${obs.gps.longitude.toFixed(4)} (±${obs.gps.accuracy} ม.)
            </div>
            <div class="text-[9px] font-mono text-neutral-400">
              ${dateStr}
            </div>
          </div>
        </div>
      `;
      container.appendChild(card);
    });
  }

  showObservationDetailModal(obs, tempUrl) {
    const modal = document.getElementById('detail-modal');
    const modalImg = document.getElementById('modal-img');
    const modalTitle = document.getElementById('modal-title');
    const modalScientific = document.getElementById('modal-scientific');
    const modalTime = document.getElementById('modal-time');
    const modalLocation = document.getElementById('modal-location');
    const modalScore = document.getElementById('modal-score');
    const modalResearchStatus = document.getElementById('modal-research-status');
    const modalDeleteBtn = document.getElementById('modal-delete-btn');

    const fullImgUrl = URL.createObjectURL(obs.photoBlob);
    modalImg.src = fullImgUrl;
    modalImg.onload = () => URL.revokeObjectURL(fullImgUrl);

    modalTitle.textContent = obs.species.commonName;
    modalScientific.textContent = obs.species.scientificName;
    modalTime.textContent = new Date(obs.timestamp).toLocaleString('th-TH');
    modalLocation.textContent = `ละติจูด ${obs.gps.latitude.toFixed(6)}, ลองจิจูด ${obs.gps.longitude.toFixed(6)} (ความคลาดเคลื่อน GPS: ±${obs.gps.accuracy} เมตร)`;
    
    // Detailed score breakup
    modalScore.innerHTML = `
      <div>คะแนนขนาดรูปภาพ (ความพอดี): <span class="text-yellow-400 font-bold">${obs.gameMetrics.sizeScore} คะแนน</span></div>
      <div>คะแนนจัดตำแหน่งโฟกัส (อยู่ตรงกลาง): <span class="text-yellow-400 font-bold">${obs.gameMetrics.centeringScore} คะแนน</span></div>
      <div>ตัวคูณความหายากสายพันธุ์: <span class="text-pink-500 font-bold">${obs.gameMetrics.rarityMultiplier.toFixed(1)} เท่า</span></div>
      <div class="border-t border-neutral-700 mt-1 pt-1 font-body text-xs font-bold">คะแนนสะสมภาพนี้: <span class="text-retro-yellow">${obs.gameMetrics.totalScore} คะแนน</span></div>
    `;

    if (obs.researchMetrics.researchGrade) {
      modalResearchStatus.innerHTML = `
        <div class="bg-green-600/20 border border-green-500 p-2 text-green-400 text-xs font-body rounded">
          ⭐️ <strong>ผ่านเกณฑ์ข้อมูลวิจัยคุณภาพ</strong><br/>
          รูปภาพนี้มีพิกัดแม่นยำดีเยี่ยม (±${obs.gps.accuracy} เมตร) และได้รับการยืนยันสายพันธุ์ เหมาะสำหรับนำไปปักหมุดประเมินป่าไม้ครับ
        </div>
      `;
    } else {
      let reason = 'ความคลาดเคลื่อนสัญญาณดาวเทียม GPS สูงเกินเกณฑ์ (>15 เมตร) ครับ';
      if (!obs.species.userConfirmed) reason = 'น้องๆ ยังไม่ได้กดยืนยันการจำแนกประเภทชนิดพันธุ์ครับ';
      modalResearchStatus.innerHTML = `
        <div class="bg-neutral-800 border border-neutral-700 p-2 text-neutral-400 text-xs font-body rounded">
          ⚠️ <strong>ข้อมูลบันทึกเก็บแต้มทั่วไป</strong><br/>
          เหตุผลที่ไม่ผ่านเกณฑ์วิจัย: ${reason}
        </div>
      `;
    }

    modalDeleteBtn.onclick = async () => {
      if (confirm(`น้องๆ แน่ใจใช่ไหมครับว่าจะลบรูปภาพบันทึกของ ${obs.species.commonName} ออกจากสมุดบันทึก?`)) {
        await this.db.deleteObservation(obs.id);
        await this.refreshObservations();
        this.renderDashboardList();
        this.updateStats();
        modal.classList.add('hidden');
      }
    };

    modal.classList.remove('hidden');
  }

  // --- DATA EXPORTS ---
  async exportJSON() {
    if (this.observations.length === 0) {
      alert('น้องๆ ยังไม่มีรูปภาพในสมุดบันทึกภาพเลยครับ ลองส่องตัวแรกก่อนนะ!');
      return;
    }

    const items = [];
    for (const obs of this.observations) {
      const base64Photo = await this.blobToBase64(obs.photoBlob);
      items.push({
        id: obs.id,
        timestamp: obs.timestamp,
        photo_base64: base64Photo,
        photo_metadata: obs.photoMetadata,
        gps: {
          latitude: obs.gps.latitude,
          longitude: obs.gps.longitude,
          accuracy_meters: obs.gps.accuracy,
          altitude_meters: obs.gps.altitude
        },
        bounding_box: obs.boundingBox,
        species: {
          id: obs.species.id,
          common_name: obs.species.commonName,
          scientific_name: obs.species.scientificName,
          user_confirmed: obs.species.userConfirmed,
          source: obs.species.source
        },
        game_metrics: obs.gameMetrics,
        research_metrics: obs.researchMetrics
      });
    }

    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(items, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `dsnc_wildlife_export_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  }

  async exportCSV() {
    if (this.observations.length === 0) {
      alert('น้องๆ ยังไม่มีรูปภาพในสมุดบันทึกภาพเลยครับ ลองส่องตัวแรกก่อนนะ!');
      return;
    }

    let csvContent = 'data:text/csv;charset=utf-8,';
    csvContent += 'ObservationID,Timestamp,SpeciesName,ScientificName,Latitude,Longitude,GPSAccuracyMeters,SizeScore,CenteringScore,RarityMultiplier,TotalScore,ResearchGrade\n';

    this.observations.forEach(obs => {
      const row = [
        obs.id,
        obs.timestamp,
        `"${obs.species.commonName.replace(/"/g, '""')}"`,
        `"${obs.species.scientificName.replace(/"/g, '""')}"`,
        obs.gps.latitude,
        obs.gps.longitude,
        obs.gps.accuracy,
        obs.gameMetrics.sizeScore,
        obs.gameMetrics.centeringScore,
        obs.gameMetrics.rarityMultiplier,
        obs.gameMetrics.totalScore,
        obs.researchMetrics.researchGrade ? 'TRUE' : 'FALSE'
      ].join(',');
      csvContent += row + '\n';
    });

    const encodedUri = encodeURI(csvContent);
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', encodedUri);
    downloadAnchor.setAttribute('download', `dsnc_wildlife_research_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  }

  blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  async handleSyncLab() {
    const unsentObservations = this.observations.filter(obs => !obs.submitted);

    if (unsentObservations.length === 0) {
      alert('ไม่มีข้อมูลบันทึกชุดใหม่ที่จะส่งเลยครับน้องๆ ลองไปส่องสัตว์เพิ่มก่อนนะ! 📸');
      return;
    }

    const syncBtn = document.getElementById('btn-sync-lab');
    const originalText = syncBtn.innerHTML;
    syncBtn.disabled = true;
    syncBtn.innerHTML = '⏳ กำลังส่ง...';

    try {
      // Simulate network delay of 1.5s
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Mark all unsent records as submitted in database
      for (const obs of unsentObservations) {
        obs.submitted = true;
        await this.db.saveObservation(obs);
      }

      await this.refreshObservations();
      this.renderDashboardList();
      this.updateStats();

      alert(`🚀 ส่งรูปภาพบันทึกใหม่ ${unsentObservations.length} รายการไปห้องวิจัยของซายม่อนสำเร็จแล้ว! ขอบใจน้องๆ มากนะคร้าบ 🔬🧬`);
    } catch (err) {
      console.error('Error syncing to SciMon Lab:', err);
      alert('การส่งข้อมูลไปห้องวิจัยขัดข้อง: ' + err.message);
    } finally {
      syncBtn.disabled = false;
      this.updateStats(); // restores correct count/icon
    }
  }

  async handleResetData() {
    if (confirm('⚠️ คำเตือน: น้องๆ แน่ใจใช่ไหมครับว่าจะลบรูปภาพสัตว์ป่าทั้งหมดในสมุดบันทึก? ข้อมูลคะแนนจะหายไปทั้งหมดเลยนะ!')) {
      await this.db.clearAllObservations();
      await this.refreshObservations();
      this.renderDashboardList();
      this.updateStats();
    }
  }

  // --- BUTTON EVENT BINDINGS ---
  bindButtons() {
    // Welcome View
    document.getElementById('btn-start-welcome').onclick = () => this.navigateTo('view-dashboard');

    // Dashboard View
    document.getElementById('btn-start-observe').onclick = () => this.navigateTo('view-camera');
    document.getElementById('btn-sync-lab').onclick = () => this.handleSyncLab();
    
    // Camera View
    document.getElementById('btn-camera-capture').onclick = () => this.handleCapture();
    document.getElementById('btn-camera-cancel').onclick = () => this.navigateTo('view-dashboard');
    document.getElementById('btn-swap-target').onclick = () => {
      cameraService.nextMockAnimal((isSim, mockInfo) => {
        const badge = document.getElementById('camera-mode-badge');
        // Translate mock wildlife names for display badge
        const animalMap = {
          'Sunda Colugo': 'บ่าง',
          'Bengal Slow Loris': 'ลิงลมเหนือ',
          'Red-billed Blue Magpie': 'นกขุนแผน',
          'Golden Birdwing Butterfly': 'ผีเสื้อถุงทอง'
        };
        const nameTh = animalMap[mockInfo.name] || mockInfo.name;
        badge.textContent = `เป้าหมาย: ${nameTh}`;
        setTimeout(() => {
          if (cameraService.isSimulator) {
            badge.textContent = 'โหมดจำลองส่องสัตว์';
          }
        }, 1500);
      });
    };

    // Analysis View
    document.getElementById('btn-analysis-proceed').onclick = () => this.handleAnalysisProceed();
    document.getElementById('btn-analysis-retry').onclick = () => this.navigateTo('view-camera');

    // Species View
    document.getElementById('species-search-btn').onclick = () => this.handleOnlineSearch();
    document.getElementById('species-search-input').onkeyup = (e) => {
      if (e.key === 'Enter') this.handleOnlineSearch();
    };
    document.getElementById('btn-confirm-species').onclick = () => this.handleConfirmSpecies();

    // Results View
    document.getElementById('btn-save-journal').onclick = () => this.handleSaveObservation();

    // Detail Modal Close
    document.getElementById('modal-close-btn').onclick = () => {
      document.getElementById('detail-modal').classList.add('hidden');
    };
    document.getElementById('detail-modal').onclick = (e) => {
      if (e.target === document.getElementById('detail-modal')) {
        document.getElementById('detail-modal').classList.add('hidden');
      }
    };
  }
}

// Instantiate and start app on page load
window.addEventListener('DOMContentLoaded', () => {
  const app = new DSNCApp();
  app.init();
});
