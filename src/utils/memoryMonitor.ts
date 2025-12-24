export type MemoryAlertLevel = 'warning' | 'critical';

export type MemoryAlert = {
  level: MemoryAlertLevel;
  ratio: number;
  usedBytes: number;
  limitBytes: number;
  timestamp: number;
};

type MemoryMonitorOptions = {
  interval: number;
  warningThreshold: number;
  criticalThreshold: number;
  onAlert: (alert: MemoryAlert) => void;
};

type PerformanceMemory = {
  usedJSHeapSize: number;
  jsHeapSizeLimit: number;
};

class MemoryMonitor {
  private timerId: number | null = null;
  private lastLevel: MemoryAlertLevel | null = null;
  private warnedMissingAPI = false;

  start(options: MemoryMonitorOptions) {
    this.stop();

    if (typeof performance === 'undefined' || !(performance as any).memory) {
      if (!this.warnedMissingAPI) {
        console.warn('[MemoryMonitor] performance.memory is not available in this environment');
        this.warnedMissingAPI = true;
      }
      return;
    }

    this.timerId = window.setInterval(() => {
      const memory = (performance as any).memory as PerformanceMemory | undefined;
      if (!memory || memory.jsHeapSizeLimit <= 0) {
        return;
      }

      const ratio = memory.usedJSHeapSize / memory.jsHeapSizeLimit;
      let level: MemoryAlertLevel | null = null;
      if (ratio >= options.criticalThreshold) {
        level = 'critical';
      } else if (ratio >= options.warningThreshold) {
        level = 'warning';
      }

      if (!level) {
        this.lastLevel = null;
        return;
      }

      const alert: MemoryAlert = {
        level,
        ratio,
        usedBytes: memory.usedJSHeapSize,
        limitBytes: memory.jsHeapSizeLimit,
        timestamp: Date.now(),
      };

      if (level !== this.lastLevel) {
        this.lastLevel = level;
      }

      options.onAlert(alert);
    }, options.interval);
  }

  stop() {
    if (this.timerId !== null) {
      window.clearInterval(this.timerId);
      this.timerId = null;
    }
    this.lastLevel = null;
  }
}

export const memoryMonitor = new MemoryMonitor();
