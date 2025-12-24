type Logger = {
  debug: (...args: unknown[]) => void;
};

const isDebugEnabled = (): boolean => {
  if (typeof window === 'undefined') {
    return false;
  }
  return (window as any).__DEBUG_LOGS === true;
};

export const logger: Logger = {
  debug: (...args: unknown[]) => {
    if (isDebugEnabled()) {
      console.debug(...args);
    }
  },
};
