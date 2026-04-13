import { useState, useEffect } from 'react';

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export default function SettingsPage() {
  const [obsEnabled, setObsEnabled] = useState(false);
  const [obsHost, setObsHost] = useState('127.0.0.1');
  const [obsPort, setObsPort] = useState('4455');
  const [obsPassword, setObsPassword] = useState('');
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [statusMessage, setStatusMessage] = useState('');
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [saveConfigMsg, setSaveConfigMsg] = useState('');

  // Load initial settings
  useEffect(() => {
    async function loadSettings() {
      try {
        const [enabled, host, port, password] = await Promise.all([
          window.electronAPI.settings.get('obs_enabled'),
          window.electronAPI.settings.get('obs_host'),
          window.electronAPI.settings.get('obs_port'),
          window.electronAPI.settings.get('obs_password'),
        ]);
        setObsEnabled(enabled === 'true');
        setObsHost(host || '127.0.0.1');
        setObsPort(port || '4455');
        setObsPassword(password || '');
      } catch (err) {
        console.error('Failed to load OBS settings:', err);
      }
    }
    loadSettings();
  }, []);

  // Listen for OBS status changes
  useEffect(() => {
    const cleanup = window.electronAPI.obs.onStatusChange((status) => {
      if (status.isConnected) {
        setConnectionStatus('connected');
        setStatusMessage('Connected');
      } else if (status.isConnecting) {
        setConnectionStatus('connecting');
        setStatusMessage('Connecting…');
      } else if (status.connectionStatus === 'error') {
        setConnectionStatus('error');
        setStatusMessage('Connection failed');
      } else {
        setConnectionStatus('disconnected');
        setStatusMessage('Disconnected');
      }
    });
    // Check current status
    window.electronAPI.obs.getStatus().then((status) => {
      if (status.isConnected) {
        setConnectionStatus('connected');
        setStatusMessage('Connected');
      } else if (status.isConnecting) {
        setConnectionStatus('connecting');
        setStatusMessage('Connecting…');
      } else {
        setConnectionStatus('disconnected');
        setStatusMessage('');
      }
    }).catch(() => {});
    return cleanup;
  }, []);

  const handleToggleObs = async (enabled: boolean) => {
    setObsEnabled(enabled);
    try {
      await window.electronAPI.settings.toggleObs(enabled);
      if (enabled) {
        setConnectionStatus('connecting');
        setStatusMessage('Connecting…');
      } else {
        setConnectionStatus('disconnected');
        setStatusMessage('');
      }
    } catch (err) {
      console.error('Failed to toggle OBS:', err);
      setObsEnabled(!enabled);
    }
  };

  const handleSaveConfig = async () => {
    setIsSavingConfig(true);
    setSaveConfigMsg('');
    try {
      await window.electronAPI.settings.saveObsConfig({ host: obsHost, port: obsPort, password: obsPassword });
      setSaveConfigMsg('Saved');
      setTimeout(() => setSaveConfigMsg(''), 2000);
    } catch (err) {
      setSaveConfigMsg('Failed to save');
    } finally {
      setIsSavingConfig(false);
    }
  };

  const handleReconnect = async () => {
    if (isReconnecting) return;
    setIsReconnecting(true);
    setConnectionStatus('connecting');
    setStatusMessage('Connecting…');
    try {
      await window.electronAPI.obs.connect();
    } catch (err) {
      setConnectionStatus('error');
      setStatusMessage('Connection failed');
    } finally {
      setIsReconnecting(false);
    }
  };

  const statusBadge = () => {
    switch (connectionStatus) {
      case 'connected':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            Connected
          </span>
        );
      case 'connecting':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
            <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse" />
            Connecting…
          </span>
        );
      case 'error':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
            Error
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400">
            <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
            Disconnected
          </span>
        );
    }
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">Settings</h1>

      {/* OBS Integration */}
      <section className="bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-border rounded-xl p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">OBS Integration</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              Control OBS recording with F10 and stamp duration marks
            </p>
          </div>
          {/* Toggle */}
          <button
            onClick={() => handleToggleObs(!obsEnabled)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
              obsEnabled ? 'bg-indigo-500' : 'bg-gray-300 dark:bg-gray-600'
            }`}
            title={obsEnabled ? 'Disable OBS integration' : 'Enable OBS integration'}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                obsEnabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {obsEnabled && (
          <>
            {/* Connection status row */}
            <div className="flex items-center gap-3 mb-5 p-3 bg-gray-50 dark:bg-dark-hover rounded-lg">
              <span className="text-sm text-gray-600 dark:text-gray-400">Status:</span>
              {statusBadge()}
              {statusMessage && connectionStatus !== 'connected' && connectionStatus !== 'connecting' && (
                <span className="text-xs text-gray-400">{statusMessage}</span>
              )}
              <button
                onClick={handleReconnect}
                disabled={isReconnecting || connectionStatus === 'connecting'}
                className="ml-auto text-xs px-3 py-1.5 rounded-lg bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400 hover:bg-indigo-200 dark:hover:bg-indigo-800/40 transition-colors disabled:opacity-50"
              >
                {isReconnecting ? 'Connecting…' : 'Reconnect'}
              </button>
            </div>

            {/* Config fields */}
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Host
                </label>
                <input
                  type="text"
                  value={obsHost}
                  onChange={(e) => setObsHost(e.target.value)}
                  placeholder="127.0.0.1"
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-hover text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Port
                </label>
                <input
                  type="text"
                  value={obsPort}
                  onChange={(e) => setObsPort(e.target.value)}
                  placeholder="4455"
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-hover text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Password <span className="text-gray-400 font-normal">(leave blank if none)</span>
              </label>
              <input
                type="password"
                value={obsPassword}
                onChange={(e) => setObsPassword(e.target.value)}
                placeholder="No password"
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-hover text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleSaveConfig}
                disabled={isSavingConfig}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-indigo-500 text-white hover:bg-indigo-600 transition-colors disabled:opacity-50"
              >
                {isSavingConfig ? 'Saving…' : 'Save Configuration'}
              </button>
              {saveConfigMsg && (
                <span className={`text-sm ${saveConfigMsg === 'Saved' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                  {saveConfigMsg}
                </span>
              )}
            </div>

            {/* Open status window button */}
            <div className="mt-4">
              <button
                onClick={() => window.electronAPI.obs.showStatusWindow()}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-gray-700 text-white hover:bg-gray-600 transition-colors"
              >
                Open Status Window
              </button>
            </div>

            {/* Usage hint */}
            <div className="mt-4 p-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg border border-indigo-100 dark:border-indigo-800/30">
              <p className="text-xs font-medium text-indigo-700 dark:text-indigo-400 mb-1">F10 Shortcut</p>
              <ul className="text-xs text-indigo-600 dark:text-indigo-300 space-y-0.5">
                <li>• Not recording → Start OBS recording</li>
                <li>• Recording → Pause + show mark overlay</li>
                <li>• Paused → Save mark & resume recording</li>
              </ul>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
