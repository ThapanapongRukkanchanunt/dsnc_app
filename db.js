// db.js - IndexedDB Database Module for Doi Suthep Nature Center App

const DB_NAME = 'dsnc_wildlife_db';
const DB_VERSION = 1;

// Curated Doi Suthep species list
const CURATED_SPECIES = [
  {
    id: 'sunda_colugo',
    commonName: 'บ่าง (Sunda Colugo)',
    scientificName: 'Galeopterus variegatus',
    taxonGroup: 'mammal',
    rarity: 'rare',
    rarityMultiplier: 3.0,
    description: 'สัตว์เลี้ยงลูกด้วยนมที่ร่อนได้เหมือนกระรอกบิน! น้องจะหากินตอนกลางคืนและนอนห้อยหัวในตอนกลางวัน กินยอดไม้และผลไม้เป็นอาหารหลักครับ',
    conservationStatus: 'LC',
    ethicalGuidelines: 'ห้ามใช้ไฟฉายสว่างๆ ส่องตาน้องตอนกลางคืนโดยตรงนะ! เพราะจะทำให้น้องตาพร่ามัวและตกลงมาจากต้นไม้ได้ครับ'
  },
  {
    id: 'slow_loris',
    commonName: 'ลิงลมเหนือ (Bengal Slow Loris)',
    scientificName: 'Nycticebus bengalensis',
    taxonGroup: 'mammal',
    rarity: 'legendary',
    rarityMultiplier: 5.0,
    description: 'ลิงลมตัวจิ๋วตาโตกลมบล็อกเคลื่อนที่ช้าๆ บนกิ่งไม้ น้องน่ารักแต่มีฟันที่มีพิษร้ายแรงและเป็นอันตรายนะ!',
    conservationStatus: 'EN',
    ethicalGuidelines: 'น้องใกล้สูญพันธุ์มากๆ ห้ามน้องๆ เข้าใกล้เกิน 10 เมตร และช่วยกันเงียบเสียงเพื่อไม่ให้น้องตกใจกลัวนะครับ'
  },
  {
    id: 'siamese_fireback',
    commonName: 'ไก่ฟ้าพญาลอ (Siamese Fireback)',
    scientificName: 'Lophura diardi',
    taxonGroup: 'bird',
    rarity: 'rare',
    rarityMultiplier: 3.0,
    description: 'นกประจำชาติไทย! ตัวสีเทา หน้าสีแดงก่ำ มีขนหางโค้งยาวสีเขียวเหลือบดำน้ำเงิน สวยสง่าและหาดูได้ยากมาก',
    conservationStatus: 'NT',
    ethicalGuidelines: 'น้องชอบหากินตามพื้นป่า ห้ามเดินออกนอกเส้นทางศึกษาธรรมชาติ เพื่อป้องกันไม่ให้ไปรบกวนหรือเหยียบรังของน้องนะครับ'
  },
  {
    id: 'red_billed_blue_magpie',
    commonName: 'นกขุนแผน (Red-billed Blue Magpie)',
    scientificName: 'Urocissa erythroryncha',
    taxonGroup: 'bird',
    rarity: 'uncommon',
    rarityMultiplier: 1.5,
    description: 'นกแสนฉลาดสีฟ้าสวยสดใส หางยาวมาก จงอยปากและขาสีแดงสะดุดตา ร้องเสียงดังเจื้อยแจ้วทั่วป่าดอยสุเทพ',
    conservationStatus: 'LC',
    ethicalGuidelines: 'นกขุนแผนขี้สงสัยมาก ห้ามโยนเศษอาหารให้หรือเป่านกหวีดเลียนเสียงเรียกน้อง เพราะจะทำให้พฤติกรรมธรรมชาติเสียไปครับ'
  },
  {
    id: 'bent_toed_gecko',
    commonName: 'ตุ๊กแกกายดอยสุเทพ (Doi Suthep Gecko)',
    scientificName: 'Cyrtodactylus doisuthep',
    taxonGroup: 'reptile',
    rarity: 'legendary',
    rarityMultiplier: 5.0,
    description: 'ตุ๊กแกชนิดพิเศษที่ถูกค้นพบและอาศัยอยู่เฉพาะในป่ารอบๆ ดอยสุเทพแห่งนี้ที่เดียวในโลก! ลำตัวมีลายจุดสีน้ำตาลเทาน่ารัก',
    conservationStatus: 'VU',
    ethicalGuidelines: 'หายากและเปราะบางมาก! เดินทางด้วยความระมัดระวังรอบโขดหินหรือโคนไม้ใหญ่ เพื่อไม่ให้เผลอไปเหยียบตัวน้องนะครับ'
  },
  {
    id: 'green_pit_viper',
    commonName: 'งูเขียวหางไหม้ (Green Pit Viper)',
    scientificName: 'Trimeresurus albolabris',
    taxonGroup: 'reptile',
    rarity: 'uncommon',
    rarityMultiplier: 1.5,
    description: 'งูตัวสีเขียวสดใสแต่ปลายหางสีน้ำตาลแดงสะดุดตา น้องชอบขดตัวเงียบๆ บนกิ่งไม้เพื่อรอจับอาหารในตอนกลางคืน',
    conservationStatus: 'LC',
    ethicalGuidelines: 'เป็นงูมีพิษอันตราย! ห้ามน้องๆ เข้าใกล้เกิน 3 เมตรเด็ดขาด และอย่าขยับตัวแรงๆ หรือยื่นมือเข้าไปใกล้กิ่งไม้ที่น้องเกาะอยู่ครับ'
  },
  {
    id: 'atlas_moth',
    commonName: 'ผีเสื้อยักษ์แอตลาส (Atlas Moth)',
    scientificName: 'Attacus atlas',
    taxonGroup: 'insect',
    rarity: 'uncommon',
    rarityMultiplier: 1.5,
    description: 'ผีเสื้อกลางคืนที่ตัวใหญ่ที่สุดในโลกชนิดหนึ่ง! ปีกกว้างถึง 25 เซนติเมตร ปลายปีกมีลวดลายดูคล้ายหัวงูเพื่อใช้ขู่ศัตรู',
    conservationStatus: 'LC',
    ethicalGuidelines: 'ผีเสื้อยักษ์จะไม่มีปากและไม่กินอาหาร มีชีวิตอยู่ได้เพียงไม่กี่วันเพื่อจับคู่ ห้ามไปแตะปีกหรือเขย่ากิ่งไม้ที่น้องเกาะนะครับ'
  },
  {
    id: 'golden_birdwing',
    commonName: 'ผีเสื้อถุงทอง (Golden Birdwing)',
    scientificName: 'Troides aeacus',
    taxonGroup: 'insect',
    rarity: 'common',
    rarityMultiplier: 1.0,
    description: 'ผีเสื้อแสนสวยตัวโต ปีกคู่หลังสีเหลืองทองสว่างไสวเหมือนถุงทองโบราณ เวลาบินเหนือบอกไม้จะดูสง่างามมาก',
    conservationStatus: 'LC',
    ethicalGuidelines: 'ห้ามใช้ตาข่ายจับน้องเด็ดขาด! ให้สังเกตน้องดูดน้ำหวานจากดอกไม้เงียบๆ และเก็บภาพสวยๆ จากระยะห่างที่พอดีนะคร้าบ'
  }
];

export class DSNCDatabase {
  constructor() {
    this.db = null;
  }

  async init() {
    if (this.db) return this.db;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Create observations store
        if (!db.objectStoreNames.contains('observations')) {
          db.createObjectStore('observations', { keyPath: 'id' });
        }

        // Create species store
        if (!db.objectStoreNames.contains('species')) {
          db.createObjectStore('species', { keyPath: 'id' });
        }
      };

      request.onsuccess = async (event) => {
        this.db = event.target.result;
        await this._prepopulateSpecies();
        resolve(this.db);
      };

      request.onerror = (event) => {
        console.error('Database open failed:', event.target.error);
        reject(event.target.error);
      };
    });
  }

  async _prepopulateSpecies() {
    return new Promise((resolve) => {
      const transaction = this.db.transaction('species', 'readwrite');
      const store = transaction.objectStore('species');

      transaction.oncomplete = () => {
        console.log('Species database transaction completed successfully.');
        resolve();
      };

      transaction.onerror = (e) => {
        console.error('Species database transaction failed:', e.target.error);
        resolve(); // resolve anyway to prevent app lock
      };

      // Check if we need to migrate English records to Thai
      const getRequest = store.get('sunda_colugo');
      
      getRequest.onsuccess = () => {
        const record = getRequest.result;
        const needsUpdate = !record || record.commonName === 'Sunda Colugo';
        
        if (needsUpdate) {
          console.log('Migrating species database to Thai...');
          store.clear().onsuccess = () => {
            CURATED_SPECIES.forEach((species) => {
              store.put(species);
            });
          };
        } else {
          // If empty for some reason
          const countRequest = store.count();
          countRequest.onsuccess = () => {
            if (countRequest.result === 0) {
              CURATED_SPECIES.forEach((species) => {
                store.put(species);
              });
            }
          };
        }
      };
    });
  }

  // OBSERVATIONS METHODS
  async saveObservation(observation) {
    await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction('observations', 'readwrite');
      const store = transaction.objectStore('observations');
      const request = store.put(observation);

      request.onsuccess = () => resolve(observation);
      request.onerror = (e) => reject(e.target.error);
    });
  }

  async getAllObservations() {
    await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction('observations', 'readonly');
      const store = transaction.objectStore('observations');
      const request = store.getAll();

      request.onsuccess = () => {
        // Sort by timestamp descending
        const results = request.result.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        resolve(results);
      };
      request.onerror = (e) => reject(e.target.error);
    });
  }

  async deleteObservation(id) {
    await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction('observations', 'readwrite');
      const store = transaction.objectStore('observations');
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = (e) => reject(e.target.error);
    });
  }

  async clearAllObservations() {
    await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction('observations', 'readwrite');
      const store = transaction.objectStore('observations');
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = (e) => reject(e.target.error);
    });
  }

  // SPECIES METHODS
  async getSpeciesList() {
    await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction('species', 'readonly');
      const store = transaction.objectStore('species');
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = (e) => reject(e.target.error);
    });
  }

  async getSpeciesById(id) {
    await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction('species', 'readonly');
      const store = transaction.objectStore('species');
      const request = store.get(id);

      request.onsuccess = () => resolve(request.result);
      request.onerror = (e) => reject(e.target.error);
    });
  }
}
