// Minimaler DOM-Abgleich: HTML-Strings werden in bestehende Knoten eingearbeitet,
// damit Fokus, Scrollposition und laufende Berührungen erhalten bleiben.

export function esc(s: string | number): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

const tpl = document.createElement('template');

/** Wird für Elemente mit data-tween aufgerufen (Zielwert im Attribut, fertiger Text als Rückfall) */
let tweenHook: ((el: HTMLElement, finalText: string, prev: string | null) => void) | null = null;
export function setTweenHook(fn: (el: HTMLElement, finalText: string, prev: string | null) => void): void {
  tweenHook = fn;
}

export function morph(container: Element, html: string): void {
  tpl.innerHTML = html;
  patchChildren(container, tpl.content);
}

function patchChildren(target: Node, source: Node): void {
  const tChildren = Array.from(target.childNodes);
  const sChildren = Array.from(source.childNodes);
  for (let i = 0; i < sChildren.length; i++) {
    const s = sChildren[i];
    const t = tChildren[i];
    if (!t) {
      target.appendChild(s.cloneNode(true));
      continue;
    }
    if (!sameKind(t, s)) {
      target.replaceChild(s.cloneNode(true), t);
      continue;
    }
    if (s.nodeType === Node.TEXT_NODE || s.nodeType === Node.COMMENT_NODE) {
      if (t.nodeValue !== s.nodeValue) t.nodeValue = s.nodeValue;
      continue;
    }
    patchElement(t as Element, s as Element);
  }
  for (let i = tChildren.length - 1; i >= sChildren.length; i--) target.removeChild(tChildren[i]);
}

function sameKind(a: Node, b: Node): boolean {
  if (a.nodeType !== b.nodeType) return false;
  if (a.nodeType !== Node.ELEMENT_NODE) return true;
  const ea = a as Element, eb = b as Element;
  if (ea.tagName !== eb.tagName) return false;
  const ka = ea.getAttribute('data-key'), kb = eb.getAttribute('data-key');
  return ka === kb;
}

function patchElement(t: Element, s: Element): void {
  const prevTween = t.getAttribute('data-tween');
  // Attribute
  for (const attr of Array.from(t.attributes)) if (!s.hasAttribute(attr.name)) t.removeAttribute(attr.name);
  for (const attr of Array.from(s.attributes)) if (t.getAttribute(attr.name) !== attr.value) t.setAttribute(attr.name, attr.value);
  if (t instanceof HTMLInputElement && s instanceof HTMLInputElement) {
    if (document.activeElement !== t && t.value !== s.value) t.value = s.value;
    if (t.checked !== s.hasAttribute('checked')) t.checked = s.hasAttribute('checked');
  }
  if (t.hasAttribute('data-static')) return;
  // Zahlen mit data-tween gleiten zum neuen Wert (siehe tween.ts) statt zu springen
  if (tweenHook && t.hasAttribute('data-tween')) {
    tweenHook(t as HTMLElement, s.textContent ?? '', prevTween);
    return;
  }
  patchChildren(t, s);
}

export function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error('Element fehlt: ' + id);
  return el;
}
