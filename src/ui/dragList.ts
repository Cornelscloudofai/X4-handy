// Sortieren per Ziehen, auch auf dem Handy: Nur der Griff startet das Ziehen (touch-action: none),
// dadurch scrollt die Seite nicht mit. Nahe am Rand scrollt die Liste kontrolliert weiter.

let active = false;

export function isDragging(): boolean {
  return active;
}

export function initDragLists(onDrop: (list: HTMLElement, uid: string, toIndex: number) => void): void {
  document.addEventListener('pointerdown', (e) => {
    const handle = (e.target as HTMLElement).closest<HTMLElement>('[data-drag-handle]');
    if (!handle || e.button > 0) return;
    const row = handle.closest<HTMLElement>('[data-uid]');
    const list = handle.closest<HTMLElement>('[data-draglist]');
    if (!row || !list) return;
    e.preventDefault();
    const rows = [...list.querySelectorAll<HTMLElement>('[data-uid]')];
    const from = rows.indexOf(row);
    const scroller = list.closest<HTMLElement>('.sheet-body') ?? document.scrollingElement as HTMLElement;
    const startScroll = scroller.scrollTop;
    const startY = e.clientY;
    const mids = rows.map((r) => { const b = r.getBoundingClientRect(); return b.top + b.height / 2; });
    const height = row.getBoundingClientRect().height;
    let lastY = e.clientY;
    let to = from;
    let raf = 0;
    active = true;
    handle.setPointerCapture(e.pointerId);
    row.classList.add('dragging');
    list.classList.add('is-dragging');
    navigator.vibrate?.(8);

    const layout = () => {
      const dy = lastY - startY + (scroller.scrollTop - startScroll);
      row.style.transform = `translateY(${dy}px)`;
      const center = mids[from] + dy;
      to = from;
      rows.forEach((r, i) => {
        if (i === from) return;
        let shift = 0;
        if (i > from && center > mids[i]) { shift = -height; to = Math.max(to, i); }
        if (i < from && center < mids[i]) { shift = height; to = Math.min(to, i); }
        r.style.transform = shift ? `translateY(${shift}px)` : '';
      });
    };
    const tick = () => {
      // Randnahes Scrollen, damit lange Listen erreichbar bleiben
      const box = scroller.getBoundingClientRect();
      const edge = 70;
      let v = 0;
      if (lastY < box.top + edge) v = -Math.ceil((box.top + edge - lastY) / 6);
      else if (lastY > box.bottom - edge) v = Math.ceil((lastY - (box.bottom - edge)) / 6);
      if (v) { scroller.scrollTop += v; layout(); }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      ev.preventDefault();
      lastY = ev.clientY;
      layout();
    };
    const end = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      cancelAnimationFrame(raf);
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', end);
      handle.removeEventListener('pointercancel', end);
      rows.forEach((r) => (r.style.transform = ''));
      row.classList.remove('dragging');
      list.classList.remove('is-dragging');
      active = false;
      if (ev.type === 'pointerup' && to !== from) onDrop(list, row.dataset.uid!, to);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  });
}
