// Kamera mit Verschieben, Pinch-Zoom und Trägheit
export class Camera {
  x = 0;
  z = 0;
  zoom = 1; // Pixel pro km
  w = 1;
  h = 1;
  minZoom = 0.5;
  maxZoom = 40;
  vx = 0;
  vz = 0;
  /** Zoom der Gesamtansicht (Sektor passt aufs Display) – Bezug für mitwachsende Symbole */
  fitZoom = 1;
  /** Zielwerte für sanfte Kamerafahrten */
  private target: { x: number; z: number; zoom: number } | null = null;

  /**
   * Symbolmaßstab: in der Gesamtansicht klein (≈ 0,55), wächst beim Heranzoomen bis 1,5.
   * Stationen, Schiffe, Tore und Beschriftungen nutzen ihn, damit der Sektor nicht überladen wirkt.
   */
  iconScale(): number {
    const rel = this.zoom / (this.fitZoom || 1);
    return Math.max(0.45, Math.min(1.5, 0.55 + 0.45 * Math.log2(Math.max(0.5, rel))));
  }

  toScreen(x: number, z: number): [number, number] {
    return [(x - this.x) * this.zoom + this.w / 2, (z - this.z) * this.zoom + this.h / 2];
  }

  toWorld(sx: number, sy: number): [number, number] {
    return [(sx - this.w / 2) / this.zoom + this.x, (sy - this.h / 2) / this.zoom + this.z];
  }

  fit(radius: number, bottomPad = 0, topPad = 0): void {
    const usableH = this.h - bottomPad - topPad;
    this.zoom = Math.min(this.w / (radius * 2.08), usableH / (radius * 1.85));
    this.fitZoom = this.zoom;
    this.minZoom = this.zoom * 0.6;
    this.x = 0;
    this.z = (bottomPad - topPad) / 2 / this.zoom;
  }

  flyTo(x: number, z: number, zoom?: number): void {
    this.target = { x, z, zoom: zoom ?? this.zoom };
    this.vx = this.vz = 0;
  }

  cancelFlight(): void {
    this.target = null;
  }

  zoomAt(factor: number, sx: number, sy: number): void {
    const [wx, wz] = this.toWorld(sx, sy);
    this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoom * factor));
    const [nx, nz] = this.toWorld(sx, sy);
    this.x += wx - nx;
    this.z += wz - nz;
    this.target = null;
  }

  update(dt: number, limit: number): void {
    if (this.target) {
      const k = 1 - Math.exp(-dt * 6);
      this.x += (this.target.x - this.x) * k;
      this.z += (this.target.z - this.z) * k;
      this.zoom *= Math.pow(this.target.zoom / this.zoom, k);
      if (Math.abs(this.target.x - this.x) < 0.05 && Math.abs(this.target.z - this.z) < 0.05 && Math.abs(this.target.zoom / this.zoom - 1) < 0.002) this.target = null;
    } else if (this.vx || this.vz) {
      this.x += this.vx * dt;
      this.z += this.vz * dt;
      const decay = Math.exp(-dt * 5);
      this.vx *= decay;
      this.vz *= decay;
      if (Math.hypot(this.vx, this.vz) * this.zoom < 5) this.vx = this.vz = 0;
    }
    const m = Math.hypot(this.x, this.z);
    if (m > limit) {
      this.x *= limit / m;
      this.z *= limit / m;
    }
  }
}

export interface InputHandlers {
  onTap: (sx: number, sy: number) => void;
  onLongPress?: (sx: number, sy: number) => void;
}

/** Touch- und Maussteuerung für eine Kamera */
export function attachInput(el: HTMLElement, cam: () => Camera, handlers: InputHandlers): void {
  const pointers = new Map<number, { x: number; y: number; sx: number; sy: number; t: number }>();
  let pinchDist = 0;
  let moved = false;
  let lastMove = { t: 0, x: 0, y: 0 };
  let longTimer = 0;

  el.addEventListener('pointerdown', (e) => {
    el.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now() });
    const c = cam();
    c.vx = c.vz = 0;
    c.cancelFlight();
    if (pointers.size === 1) {
      moved = false;
      lastMove = { t: performance.now(), x: e.clientX, y: e.clientY };
      clearTimeout(longTimer);
      if (handlers.onLongPress) {
        const r = el.getBoundingClientRect();
        const lx = e.clientX - r.left, ly = e.clientY - r.top;
        longTimer = window.setTimeout(() => { if (!moved && pointers.size === 1) { moved = true; handlers.onLongPress!(lx, ly); } }, 550);
      }
    }
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      moved = true;
    }
  });

  el.addEventListener('pointermove', (e) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    const c = cam();
    const r = el.getBoundingClientRect();
    if (pointers.size === 1) {
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      if (Math.hypot(e.clientX - p.sx, e.clientY - p.sy) > 8) moved = true;
      if (moved) {
        c.x -= dx / c.zoom;
        c.z -= dy / c.zoom;
        const now = performance.now();
        const dtm = Math.max(1, now - lastMove.t) / 1000;
        c.vx = -((e.clientX - lastMove.x) / c.zoom) / dtm;
        c.vz = -((e.clientY - lastMove.y) / c.zoom) / dtm;
        lastMove = { t: now, x: e.clientX, y: e.clientY };
      }
    }
    p.x = e.clientX;
    p.y = e.clientY;
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchDist > 0) c.zoomAt(d / pinchDist, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
      pinchDist = d;
      c.vx = c.vz = 0;
    }
  });

  const end = (e: PointerEvent) => {
    const p = pointers.get(e.pointerId);
    pointers.delete(e.pointerId);
    clearTimeout(longTimer);
    if (!p) return;
    const c = cam();
    if (performance.now() - lastMove.t > 80) c.vx = c.vz = 0;
    if (!moved && pointers.size === 0 && e.type === 'pointerup') {
      const r = el.getBoundingClientRect();
      handlers.onTap(e.clientX - r.left, e.clientY - r.top);
    }
    if (pointers.size < 2) pinchDist = 0;
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);

  el.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = el.getBoundingClientRect();
    cam().zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
  }, { passive: false });
}
