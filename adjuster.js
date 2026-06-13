// adjuster.js - Interactive Bounding Box Overlay for Manual Correction

export class BoundingBoxOverlay {
  /**
   * @param {HTMLElement} container - Container element to render the adjuster in
   * @param {string} imageSrc - Object URL or base64 source of the captured image
   * @param {Object} initialBox - Initial normalized box { x, y, width, height }
   * @param {Function} onChange - Callback on drag/resize: (box) => {}
   */
  constructor(container, imageSrc, initialBox = { x: 0.25, y: 0.25, width: 0.5, height: 0.5 }, onChange = null) {
    this.container = container;
    this.imageSrc = imageSrc;
    this.box = { ...initialBox };
    this.onChange = onChange;
    
    this.isDragging = false;
    this.activeHandle = null; // 'center' or 'tl' | 'tr' | 'bl' | 'br'
    this.dragStart = { x: 0, y: 0 };
    this.boxStart = { ...this.box };

    this.initDOM();
    this.bindEvents();
  }

  initDOM() {
    this.container.innerHTML = '';
    this.container.className = 'relative w-full aspect-square bg-neutral-900 border-4 border-black select-none overflow-hidden';

    // 1. The Photo
    this.img = document.createElement('img');
    this.img.src = this.imageSrc;
    this.img.className = 'w-full h-full object-cover pointer-events-none';
    this.container.appendChild(this.img);

    // 2. SVG overlay for masking and rendering handles
    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.setAttribute('class', 'absolute inset-0 w-full h-full cursor-crosshair');
    this.container.appendChild(this.svg);

    // Define mask
    this.mask = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    this.mask.setAttribute('fill', 'rgba(0, 0, 0, 0.65)');
    this.mask.setAttribute('fill-rule', 'evenodd');
    this.svg.appendChild(this.mask);

    // Bounding Box Rect
    this.rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    this.rect.setAttribute('stroke', '#00e1d9');
    this.rect.setAttribute('stroke-width', '3');
    this.rect.setAttribute('fill', 'transparent');
    this.rect.setAttribute('class', 'cursor-move');
    this.svg.appendChild(this.rect);

    // Corner brackets inside the rect (Retro arcade camera look)
    this.brackets = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    this.brackets.setAttribute('stroke', '#ff007f');
    this.brackets.setAttribute('stroke-width', '2');
    this.brackets.setAttribute('fill', 'none');
    this.svg.appendChild(this.brackets);

    // Realtime Size label overlay
    this.sizeLabel = document.createElement('div');
    this.sizeLabel.className = 'absolute bg-pink-600 text-white font-mono text-[10px] px-1.5 py-0.5 border border-black uppercase font-bold pointer-events-none select-none z-10';
    this.sizeLabel.textContent = 'ZOOM: 100%';
    this.container.appendChild(this.sizeLabel);

    // Create 4 corner handles
    this.handles = {};
    const handleIds = ['tl', 'tr', 'bl', 'br'];
    const handleCursors = {
      tl: 'nwse-resize',
      tr: 'nesw-resize',
      bl: 'nesw-resize',
      br: 'nwse-resize'
    };

    handleIds.forEach(id => {
      const circ = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circ.setAttribute('r', '8');
      circ.setAttribute('fill', '#f3e600');
      circ.setAttribute('stroke', '#000');
      circ.setAttribute('stroke-width', '2');
      circ.setAttribute('class', `cursor-${handleCursors[id]}`);
      this.svg.appendChild(circ);
      this.handles[id] = circ;
    });

    this.updateOverlay();
  }

  updateOverlay() {
    const w = this.container.clientWidth || 400;
    const h = this.container.clientHeight || 400;

    // Denormalize coordinates
    const px = this.box.x * w;
    const py = this.box.y * h;
    const pw = this.box.width * w;
    const ph = this.box.height * h;

    // 1. Update Box rect
    this.rect.setAttribute('x', px.toString());
    this.rect.setAttribute('y', py.toString());
    this.rect.setAttribute('width', pw.toString());
    this.rect.setAttribute('height', ph.toString());

    // 2. Update Mask path (donut cutout mask)
    // Outer rect clockwise, inner cutout counter-clockwise
    const maskPath = `M 0 0 h ${w} v ${h} h -${w} Z M ${px} ${py} v ${ph} h ${pw} v -${ph} Z`;
    this.mask.setAttribute('d', maskPath);

    // 3. Update inner camera brackets
    const bSize = Math.min(15, pw / 3, ph / 3);
    const bracketPath = `
      M ${px + bSize} ${py} H ${px} V ${py + bSize}
      M ${px + pw - bSize} ${py} H ${px + pw} V ${py + bSize}
      M ${px} ${py + ph - bSize} V ${py + ph} H ${px + bSize}
      M ${px + pw} ${py + ph - bSize} V ${py + ph} H ${px + pw - bSize}
    `;
    this.brackets.setAttribute('d', bracketPath);

    // 4. Update handles positioning
    this.handles.tl.setAttribute('cx', px.toString());
    this.handles.tl.setAttribute('cy', py.toString());

    this.handles.tr.setAttribute('cx', (px + pw).toString());
    this.handles.tr.setAttribute('cy', py.toString());

    this.handles.bl.setAttribute('cx', px.toString());
    this.handles.bl.setAttribute('cy', (py + ph).toString());

    this.handles.br.setAttribute('cx', (px + pw).toString());
    this.handles.br.setAttribute('cy', (py + ph).toString());

    // 5. Update Size label location (centered above the bounding box or in top corner)
    const areaPercent = Math.round((this.box.width * this.box.height) * 100);
    this.sizeLabel.textContent = `SIZE: ${areaPercent}%`;
    
    // Position label slightly above top-left of box
    let labelY = py - 20;
    if (labelY < 5) labelY = py + 5; // keep inside bounds
    let labelX = px;
    if (labelX + 80 > w) labelX = w - 85;

    this.sizeLabel.style.left = `${labelX}px`;
    this.sizeLabel.style.top = `${labelY}px`;
  }

  bindEvents() {
    // Event listener helper
    const getCoordinates = (e) => {
      const rect = this.container.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      return {
        x: (clientX - rect.left) / rect.width,
        y: (clientY - rect.top) / rect.height
      };
    };

    const handleStart = (e, handle) => {
      e.preventDefault();
      this.isDragging = true;
      this.activeHandle = handle;
      const coords = getCoordinates(e);
      this.dragStart = coords;
      this.boxStart = { ...this.box };
    };

    // Rect drag (moves the box)
    this.rect.addEventListener('mousedown', (e) => handleStart(e, 'center'));
    this.rect.addEventListener('touchstart', (e) => handleStart(e, 'center'));

    // Handle drags
    Object.keys(this.handles).forEach(key => {
      this.handles[key].addEventListener('mousedown', (e) => handleStart(e, key));
      this.handles[key].addEventListener('touchstart', (e) => handleStart(e, key));
    });

    const handleMove = (e) => {
      if (!this.isDragging) return;
      e.preventDefault();
      
      const coords = getCoordinates(e);
      const dx = coords.x - this.dragStart.x;
      const dy = coords.y - this.dragStart.y;

      const minSize = 0.1; // 10% min dimension

      if (this.activeHandle === 'center') {
        // Dragging the whole box
        let newX = this.boxStart.x + dx;
        let newY = this.boxStart.y + dy;

        // Constraint check
        if (newX < 0) newX = 0;
        if (newY < 0) newY = 0;
        if (newX + this.boxStart.width > 1) newX = 1 - this.boxStart.width;
        if (newY + this.boxStart.height > 1) newY = 1 - this.boxStart.height;

        this.box.x = newX;
        this.box.y = newY;
      } else {
        // Resizing using handles
        let left = this.boxStart.x;
        let top = this.boxStart.y;
        let right = this.boxStart.x + this.boxStart.width;
        let bottom = this.boxStart.y + this.boxStart.height;

        if (this.activeHandle === 'tl') {
          left = Math.min(right - minSize, Math.max(0, this.boxStart.x + dx));
          top = Math.min(bottom - minSize, Math.max(0, this.boxStart.y + dy));
        } else if (this.activeHandle === 'tr') {
          right = Math.max(left + minSize, Math.min(1, this.boxStart.x + this.boxStart.width + dx));
          top = Math.min(bottom - minSize, Math.max(0, this.boxStart.y + dy));
        } else if (this.activeHandle === 'bl') {
          left = Math.min(right - minSize, Math.max(0, this.boxStart.x + dx));
          bottom = Math.max(top + minSize, Math.min(1, this.boxStart.y + this.boxStart.height + dy));
        } else if (this.activeHandle === 'br') {
          right = Math.max(left + minSize, Math.min(1, this.boxStart.x + this.boxStart.width + dx));
          bottom = Math.max(top + minSize, Math.min(1, this.boxStart.y + this.boxStart.height + dy));
        }

        this.box = {
          x: left,
          y: top,
          width: right - left,
          height: bottom - top
        };
      }

      this.updateOverlay();
      if (this.onChange) this.onChange({ ...this.box });
    };

    const handleEnd = () => {
      this.isDragging = false;
      this.activeHandle = null;
    };

    // Bind document move and end to avoid losing track if dragging fast
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('touchmove', handleMove, { passive: false });
    window.addEventListener('mouseup', handleEnd);
    window.addEventListener('touchend', handleEnd);

    // Keep references to remove later if needed
    this._moveListener = handleMove;
    this._endListener = handleEnd;

    // Handle container resize
    this._resizeObserver = new ResizeObserver(() => this.updateOverlay());
    this._resizeObserver.observe(this.container);
  }

  getBox() {
    return { ...this.box };
  }

  destroy() {
    window.removeEventListener('mousemove', this._moveListener);
    window.removeEventListener('touchmove', this._moveListener);
    window.removeEventListener('mouseup', this._endListener);
    window.removeEventListener('touchend', this._endListener);
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
    }
  }
}
