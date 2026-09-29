// Bedienung des Vollbild-Fließdiagramms: Verschieben, Zoomen (Pinch/Mausrad), Kästchen ziehen.
// Buttons im Diagramm (data-act) bleiben normale Klicks.

export interface EditorHooks {
  view(): { x: number; y: number; k: number };
  setView(v: { x: number; y: number; k: number }): void;
  nodePos(ware: string): { x: number; y: number } | null;
  moveNode(ware: string, x: number, y: number, done: boolean): void;
  tapNode(ware: string): void;
}

let busy = false;
export function editorBusy(): boolean {
  return busy;
}

export function initDiagramEditor(h: EditorHooks): void {
  const pointers = new Map<number, { x: number; y: number }>();
  let mode: 'none' | 'pan' | 'node' | 'pinch' = 'none';
  let start = { x: 0, y: 0 };
  let startView = { x: 0, y: 0, k: 1 };
  let node = '';
  let nodeStart = { x: 0, y: 0 };
  let moved = false;
  let pinch = { d: 0, cx: 0, cy: 0 };

  const svgOf = (t: EventTarget | null) => (t as Element | null)?.closest?.('svg.dg-editor') as SVGSVGElement | null;
  const applyView = (svg: SVGSVGElement, v: { x: number; y: number; k: number }) => {
    h.setView(v);
    svg.querySelector('#dg-view')?.setAttribute('transform', `translate(${v.x.toFixed(1)} ${v.y.toFixed(1)}) scale(${v.k.toFixed(4)})`);
  };
  const zoomAround = (svg: SVGSVGElement, base: { x: number; y: number; k: number }, factor: number, cx: number, cy: number) => {
    const k = Math.max(0.2, Math.min(3, base.k * factor));
    const r = svg.getBoundingClientRect();
    const px = cx - r.left, py = cy - r.top;
    // Punkt unter dem Finger bleibt stehen
    const wx = (px - base.x) / base.k, wy = (py - base.y) / base.k;
    applyView(svg, { x: px - wx * k, y: py - wy * k, k });
  };

  document.addEventListener('pointerdown', (e) => {
    const svg = svgOf(e.target);
    if (!svg) return;
    if ((e.target as Element).closest('[data-act]')) return; // ± und Empfehlungen sind Buttons
    e.preventDefault();
    svg.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    busy = true;
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      mode = 'pinch';
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
      startView = { ...h.view() };
      return;
    }
    start = { x: e.clientX, y: e.clientY };
    startView = { ...h.view() };
    moved = false;
    const g = (e.target as Element).closest('[data-node]');
    node = g?.getAttribute('data-node') ?? '';
    const p = node ? h.nodePos(node) : null;
    if (node && p) { mode = 'node'; nodeStart = p; } else mode = 'pan';
  });

  document.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    const svg = svgOf(e.target) ?? document.querySelector<SVGSVGElement>('svg.dg-editor');
    if (!svg) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (mode === 'pinch' && pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      const base = { ...startView, x: startView.x + (cx - pinch.cx), y: startView.y + (cy - pinch.cy) };
      zoomAround(svg, base, d / Math.max(1, pinch.d), cx, cy);
      return;
    }
    const dx = e.clientX - start.x, dy = e.clientY - start.y;
    if (!moved && Math.hypot(dx, dy) < 6) return;
    moved = true;
    if (mode === 'pan') applyView(svg, { ...startView, x: startView.x + dx, y: startView.y + dy });
    else if (mode === 'node') {
      const k = h.view().k;
      h.moveNode(node, nodeStart.x + dx / k, nodeStart.y + dy / k, false);
    }
  });

  const end = (e: PointerEvent) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    if (mode === 'pinch') {
      if (pointers.size === 0) { mode = 'none'; busy = false; }
      else { const [p] = [...pointers.values()]; start = { x: p.x, y: p.y }; startView = { ...h.view() }; mode = 'pan'; moved = true; }
      return;
    }
    if (pointers.size) return;
    if (mode === 'node') {
      if (moved) {
        const k = h.view().k;
        h.moveNode(node, nodeStart.x + (e.clientX - start.x) / k, nodeStart.y + (e.clientY - start.y) / k, true);
      } else if (e.type === 'pointerup') h.tapNode(node);
    }
    mode = 'none';
    busy = false;
  };
  document.addEventListener('pointerup', end);
  document.addEventListener('pointercancel', end);

  document.addEventListener('wheel', (e) => {
    const svg = svgOf(e.target);
    if (!svg) return;
    e.preventDefault();
    zoomAround(svg, h.view(), Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY);
  }, { passive: false });
}

/** Ansicht so wählen, dass alle Kästchen ins Fenster passen */
export function fitView(svg: SVGSVGElement, bounds: { x: number; y: number; w: number; h: number }): { x: number; y: number; k: number } {
  const r = svg.getBoundingClientRect();
  const k = Math.max(0.2, Math.min(1.2, Math.min(r.width / bounds.w, r.height / bounds.h)));
  return { k, x: (r.width - bounds.w * k) / 2 - bounds.x * k, y: (r.height - bounds.h * k) / 2 - bounds.y * k };
}
