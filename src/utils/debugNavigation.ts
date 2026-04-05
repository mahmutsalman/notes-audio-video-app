/**
 * Debug utility: detect fixed-position elements from inactive tabs that can
 * intercept clicks and cause "navigation stuck" symptoms.
 *
 * Two failure modes this catches:
 *  A) Inactive tab has a `position:fixed` element still in its DOM subtree.
 *     Chromium/Electron does not reliably suppress hit-testing for fixed
 *     descendants of `display:none` containers — so these eat clicks.
 *  B) A React portal (e.g. ContextMenu) was rendered to `document.body`
 *     while in an inactive tab and was never cleaned up.
 *
 * Usage:
 *   scanFixedInterceptors(activeTabId)  — returns a report
 *   logNavDebug(activeTabId)            — prints to console, returns warning count
 */

export interface FixedInterceptor {
  kind: 'inactive-tab' | 'orphan-portal';
  tabId: string | null;   // which tab it belongs to (null = unknown portal)
  element: Element;
  tagName: string;
  classes: string;        // first 120 chars of className
  zIndex: string;
  boundingRect: DOMRect;
  guessedComponent: string;
}

/** Heuristically guess which React component owns the element. */
function guessComponent(el: Element): string {
  const cls = el.className ?? '';
  if (cls.includes('inset-0') && cls.includes('z-50')) return 'ImageLightbox / Modal / ScreenRecordingModal';
  if (cls.includes('bottom-8') && cls.includes('right-8')) return 'QuickRecord FAB';
  if (cls.includes('bottom-8') && cls.includes('right-32')) return 'QuickWrittenNote FAB';
  if (cls.includes('bottom-6') && cls.includes('left-6')) return 'QuickScreenRecord FAB';
  if (cls.includes('bottom-8') && cls.includes('right-72')) return 'QuickReaderNote FAB';
  if (cls.includes('bottom-8') && cls.includes('right-52')) return 'QuickBookNote FAB';
  if (cls.includes('bottom-0') && cls.includes('left-0') && cls.includes('right-0')) return 'Audio/Recording PlayerBar';
  if (cls.includes('z-[200]')) return 'TagModal / CaptionModal (z-200)';
  if (cls.includes('min-w-') && cls.includes('py-1')) return 'ContextMenu';
  if (cls.includes('z-[69]') || cls.includes('z-[60]')) return 'ImageAudioPlayerBar overlay';
  return el.tagName.toLowerCase();
}

export function scanFixedInterceptors(activeTabId: string): FixedInterceptor[] {
  const interceptors: FixedInterceptor[] = [];

  // ── Mode A: fixed elements inside hidden tab containers ──────────────────
  const tabContainers = document.querySelectorAll<HTMLElement>('[data-tab-id]');
  tabContainers.forEach(container => {
    const tabId = container.getAttribute('data-tab-id') ?? '';
    if (tabId === activeTabId) return; // active tab — fine
    if (container.style.display !== 'none') return; // unexpected but skip

    // Walk ALL descendants looking for position:fixed elements
    const descendants = container.querySelectorAll('*');
    descendants.forEach(el => {
      const cs = window.getComputedStyle(el);
      if (cs.position === 'fixed' && cs.display !== 'none' && cs.visibility !== 'hidden') {
        // Skip elements that can't intercept clicks: zero bounding rect or pointer-events:none
        const rect = el.getBoundingClientRect();
        if ((rect.width === 0 && rect.height === 0) || cs.pointerEvents === 'none') return;
        interceptors.push({
          kind: 'inactive-tab',
          tabId,
          element: el,
          tagName: el.tagName.toLowerCase(),
          classes: el.className?.toString().slice(0, 120) ?? '',
          zIndex: cs.zIndex,
          boundingRect: el.getBoundingClientRect(),
          guessedComponent: guessComponent(el),
        });
      }
    });
  });

  // ── Mode B: portal elements attached to document.body ────────────────────
  // These are direct children of body that are NOT the root app container
  // and NOT the tab shell — they were portalled in from some tab.
  const bodyChildren = Array.from(document.body.children);
  bodyChildren.forEach(el => {
    // Skip the React root
    if (el.id === 'root') return;
    const cs = window.getComputedStyle(el);
    if (cs.position === 'fixed' && cs.display !== 'none') {
      const rect = el.getBoundingClientRect();
      if ((rect.width === 0 && rect.height === 0) || cs.pointerEvents === 'none') return;
      interceptors.push({
        kind: 'orphan-portal',
        tabId: null,
        element: el,
        tagName: el.tagName.toLowerCase(),
        classes: el.className?.toString().slice(0, 120) ?? '',
        zIndex: cs.zIndex,
        boundingRect: el.getBoundingClientRect(),
        guessedComponent: guessComponent(el),
      });
    }
  });

  return interceptors;
}

/**
 * Print a formatted report to the console and return the number of warnings.
 * Call this after every tab switch.
 */
export function logNavDebug(activeTabId: string): number {
  const found = scanFixedInterceptors(activeTabId);

  if (found.length === 0) {
    console.log(`%c[NAV-DEBUG] ✅ No fixed interceptors detected (active: ${activeTabId})`, 'color: #22c55e');
    return 0;
  }

  console.warn(
    `%c[NAV-DEBUG] ⚠️ ${found.length} fixed element(s) may be blocking navigation! (active: ${activeTabId})`,
    'color: #ef4444; font-weight: bold'
  );

  found.forEach((item, i) => {
    const rect = item.boundingRect;
    const rectStr = `x:${Math.round(rect.x)} y:${Math.round(rect.y)} w:${Math.round(rect.width)} h:${Math.round(rect.height)}`;
    if (item.kind === 'inactive-tab') {
      console.warn(
        `%c  [${i + 1}] INACTIVE TAB "${item.tabId}" — ${item.guessedComponent}\n` +
        `       z-index: ${item.zIndex} | rect: ${rectStr}\n` +
        `       classes: ${item.classes}`,
        'color: #f97316'
      );
    } else {
      console.warn(
        `%c  [${i + 1}] ORPHAN PORTAL (document.body) — ${item.guessedComponent}\n` +
        `       z-index: ${item.zIndex} | rect: ${rectStr}\n` +
        `       classes: ${item.classes}`,
        'color: #a855f7'
      );
    }
    console.warn('       element:', item.element);
  });

  return found.length;
}
