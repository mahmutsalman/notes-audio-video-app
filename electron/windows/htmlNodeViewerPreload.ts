import { ipcRenderer, webFrame } from 'electron';

window.addEventListener('DOMContentLoaded', () => {
  let currentZoom = 1.0;

  const toolbar = document.createElement('div');
  toolbar.id = '__zoom_toolbar__';
  toolbar.style.cssText = `
    position: fixed;
    top: 12px;
    right: 16px;
    z-index: 2147483647;
    display: flex;
    align-items: center;
    gap: 6px;
    background: rgba(30, 30, 30, 0.88);
    backdrop-filter: blur(8px);
    border: 1px solid rgba(255,255,255,0.15);
    border-radius: 8px;
    padding: 5px 10px;
    font-family: -apple-system, BlinkMacSystemFont, sans-serif;
    font-size: 13px;
    color: #f0f0f0;
    user-select: none;
    box-shadow: 0 2px 12px rgba(0,0,0,0.4);
    transition: padding 0.2s;
  `;

  const btnStyle = `
    background: rgba(255,255,255,0.1);
    border: 1px solid rgba(255,255,255,0.15);
    border-radius: 5px;
    color: #f0f0f0;
    cursor: pointer;
    font-size: 16px;
    line-height: 1;
    padding: 2px 8px;
    transition: background 0.15s, opacity 0.2s, max-width 0.2s;
    overflow: hidden;
    max-width: 0;
    opacity: 0;
    pointer-events: none;
    border: none;
    padding-left: 0;
    padding-right: 0;
  `;

  const label = document.createElement('span');
  label.textContent = '100%';
  label.style.cssText = 'min-width: 42px; text-align: center; font-variant-numeric: tabular-nums;';

  const makeBtn = (text: string, title: string): HTMLButtonElement => {
    const btn = document.createElement('button');
    btn.textContent = text;
    btn.title = title;
    btn.style.cssText = btnStyle;
    btn.onmouseenter = () => { btn.style.background = 'rgba(255,255,255,0.2)'; };
    btn.onmouseleave = () => { btn.style.background = 'rgba(255,255,255,0.1)'; };
    return btn;
  };

  const applyZoom = (factor: number) => {
    currentZoom = Math.min(4.0, Math.max(0.25, +factor.toFixed(2)));
    label.textContent = Math.round(currentZoom * 100) + '%';
    webFrame.setZoomFactor(currentZoom);
  };

  // Trackpad pinch (reported as wheel + ctrlKey) and Cmd+scroll wheel (metaKey)
  window.addEventListener('wheel', (e: WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      applyZoom(currentZoom * (1 - e.deltaY * 0.005));
    }
  }, { passive: false });

  const btnOut = makeBtn('−', 'Zoom out');
  btnOut.onclick = () => applyZoom(currentZoom - 0.1);

  const btnIn = makeBtn('+', 'Zoom in');
  btnIn.onclick = () => applyZoom(currentZoom + 0.1);

  const btnReset = makeBtn('↺', 'Reset zoom');
  btnReset.style.fontSize = '14px';
  btnReset.onclick = () => applyZoom(1.0);

  const showButtons = () => {
    for (const btn of [btnOut, btnIn, btnReset]) {
      btn.style.maxWidth = '48px';
      btn.style.opacity = '1';
      btn.style.pointerEvents = 'auto';
      btn.style.border = '1px solid rgba(255,255,255,0.15)';
      btn.style.paddingLeft = '8px';
      btn.style.paddingRight = '8px';
    }
    toolbar.style.gap = '6px';
  };

  const hideButtons = () => {
    for (const btn of [btnOut, btnIn, btnReset]) {
      btn.style.maxWidth = '0';
      btn.style.opacity = '0';
      btn.style.pointerEvents = 'none';
      btn.style.border = 'none';
      btn.style.paddingLeft = '0';
      btn.style.paddingRight = '0';
    }
    toolbar.style.gap = '0';
  };

  toolbar.addEventListener('mouseenter', showButtons);
  toolbar.addEventListener('mouseleave', hideButtons);

  toolbar.appendChild(btnOut);
  toolbar.appendChild(label);
  toolbar.appendChild(btnIn);
  toolbar.appendChild(btnReset);

  setTimeout(() => document.documentElement.appendChild(toolbar), 100);
});
