import { useState, useEffect } from 'react';
import { Save, Moon, Sun, Database, Key, Trash2, CheckCircle, XCircle, Loader2, Shield, Zap, Info, ExternalLink } from 'lucide-react';
import { useStore } from '@/store';
import { Card, CardContent, CardHeader, Badge } from '@/components/ui/Card';
import { clsx } from 'clsx';
import { toast } from 'sonner';

type ValidationStatus = 'idle' | 'validating' | 'success' | 'error';

export function Settings() {
  const { settings, setSettings } = useStore();
  const [apiKey, setApiKey] = useState(settings.apiKey);
  const [cacheDuration, setCacheDuration] = useState(settings.cacheDuration);
  const [provider, setProvider] = useState<'coinapi' | 'coinalyze'>('coinapi');
  const [validationStatus, setValidationStatus] = useState<ValidationStatus>('idle');
  const [validationMessage, setValidationMessage] = useState('');

  useEffect(() => {
    // Load API key from localStorage on mount
    const storedKey = localStorage.getItem('coinglass_api_key');
    if (storedKey) {
      setApiKey(storedKey);
    }

    // Load provider preference
    const storedProvider = localStorage.getItem('coinglass_provider');
    if (storedProvider === 'coinapi' || storedProvider === 'coinalyze') {
      setProvider(storedProvider);
    }
  }, []);

  const handleSaveApiKey = () => {
    if (!apiKey.trim()) {
      toast.error('Please enter an API key');
      return;
    }

    // Save directly to local storage and unified state
    try {
      localStorage.setItem('coinglass_api_key', apiKey);
      localStorage.setItem('coinglass_provider', provider);
      setSettings({ apiKey });

      toast.success('API settings saved successfully');
      setValidationStatus('success');
      setValidationMessage('API key activated in browser');

      setTimeout(() => {
        setValidationStatus('idle');
        setValidationMessage('');
      }, 3000);
    } catch (e) {
      toast.error('Error saving settings');
    }
  };

  const handleClearCache = () => {
    localStorage.removeItem('coinglass-storage');
    toast.success('Cache cleared successfully');
  };

  const handleThemeToggle = () => {
    const newTheme = settings.theme === 'dark' ? 'light' : 'dark';
    setSettings({ theme: newTheme });
    if (newTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  const handleSaveCache = () => {
    setSettings({ cacheDuration });
    toast.success('Cache settings saved');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-3xl font-bold text-gradient">Settings</h2>
        <p className="text-white/50 mt-1">Configure your dashboard preferences</p>
      </div>

      {/* API Configuration */}
      <Card>
        <CardHeader
          title="API Configuration"
          description="Configure your API keys for data access"
          action={
            apiKey ? (
              <Badge variant="success">Connected</Badge>
            ) : (
              <Badge variant="default">Not Configured</Badge>
            )
          }
        />
        <CardContent className="space-y-6">
          <div>
            <label className="text-sm font-medium text-white/70">Provider</label>
            <div className="mt-2 flex gap-2">
              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value as 'coinapi' | 'coinalyze')}
                className="h-11 min-w-[160px] glass-input px-4 text-sm text-white outline-none cursor-pointer"
              >
                <option value="coinapi" className="bg-gray-900">CoinAPI</option>
                <option value="coinalyze" className="bg-gray-900">CoinALyze</option>
              </select>
            </div>
            <p className="mt-2 text-xs text-white/40">
              Select your data provider for market data
            </p>
          </div>

          <div>
            <label className="text-sm font-medium text-white/70">API Key</label>
            <div className="mt-2 flex gap-3">
              <input
                type="password"
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value);
                  // Reset validation when user types
                  if (validationStatus !== 'idle') {
                    setValidationStatus('idle');
                    setValidationMessage('');
                  }
                }}
                placeholder="Enter your API key"
                className="flex-1 h-11 glass-input px-4 text-sm text-white placeholder:text-white/40 outline-none"
              />
              <button
                onClick={handleSaveApiKey}
                disabled={validationStatus === 'validating'}
                className="glass-button inline-flex h-11 items-center gap-2 px-5 text-sm font-medium text-white disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {validationStatus === 'validating' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Save
              </button>
            </div>

            {/* Validation feedback */}
            {validationStatus === 'validating' && (
              <div className="mt-3 flex items-center gap-2 text-sm text-white/50">
                <Loader2 className="h-4 w-4 animate-spin" />
                Validating API key...
              </div>
            )}

            {validationStatus === 'success' && (
              <div className="mt-3 flex items-center gap-2 text-sm text-green-400">
                <CheckCircle className="h-4 w-4" />
                {validationMessage}
              </div>
            )}

            {validationStatus === 'error' && (
              <div className="mt-3 flex items-center gap-2 text-sm text-red-400">
                <XCircle className="h-4 w-4" />
                {validationMessage}
              </div>
            )}

            <p className="mt-3 text-xs text-white/40">
              Get your API key from the Coinglass API dashboard
            </p>
          </div>

          <div className="glass-card p-4 border-l-4 border-l-blue-500/50">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-liquid-sm bg-blue-500/10 border border-blue-500/20">
                <Shield className="h-5 w-5 text-blue-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-white">API Status</p>
                <p className="text-xs text-white/50 mt-0.5">
                  {apiKey ? 'API key configured' : 'No API key configured'}
                </p>
              </div>
              {apiKey && (
                <Badge variant="info" className="ml-auto">
                  {provider.toUpperCase()}
                </Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Appearance */}
      <Card>
        <CardHeader title="Appearance" description="Customize the look and feel" />
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={clsx(
                'flex h-12 w-12 items-center justify-center rounded-liquid-sm border transition-all duration-300',
                settings.theme === 'dark' 
                  ? 'bg-purple-500/10 border-purple-500/20' 
                  : 'bg-yellow-500/10 border-yellow-500/20'
              )}>
                {settings.theme === 'dark' ? (
                  <Moon className="h-6 w-6 text-purple-400" />
                ) : (
                  <Sun className="h-6 w-6 text-yellow-400" />
                )}
              </div>
              <div>
                <p className="font-semibold text-white">Theme</p>
                <p className="text-sm text-white/50">
                  Currently using {settings.theme === 'dark' ? 'dark' : 'light'} mode
                </p>
              </div>
            </div>
            <button
              onClick={handleThemeToggle}
              className={clsx(
                'relative inline-flex h-7 w-14 items-center rounded-full transition-all duration-300',
                settings.theme === 'dark' 
                  ? 'bg-gradient-to-r from-purple-500 to-blue-500' 
                  : 'bg-white/20'
              )}
            >
              <span
                className={clsx(
                  'inline-block h-5 w-5 transform rounded-full bg-white shadow-lg transition-transform duration-300',
                  settings.theme === 'dark' ? 'translate-x-8' : 'translate-x-1'
                )}
              />
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Cache Settings */}
      <Card>
        <CardHeader
          title="Cache Settings"
          description="Configure data caching preferences"
        />
        <CardContent className="space-y-6">
          <div>
            <label className="text-sm font-medium text-white/70">Cache Duration (minutes)</label>
            <div className="mt-2 flex gap-3">
              <input
                type="number"
                min="1"
                max="60"
                value={cacheDuration}
                onChange={(e) => setCacheDuration(parseInt(e.target.value) || 5)}
                className="h-11 w-32 glass-input px-4 text-sm text-white outline-none"
              />
              <button
                onClick={handleSaveCache}
                className="glass-button inline-flex h-11 items-center gap-2 px-5 text-sm font-medium text-white"
              >
                <Save className="h-4 w-4" />
                Save
              </button>
            </div>
            <p className="mt-2 text-xs text-white/40">
              How long to cache API responses before refreshing (1-60 minutes)
            </p>
          </div>

          <div className="glass-card p-4 border-l-4 border-l-red-500/50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-liquid-sm bg-red-500/10 border border-red-500/20">
                  <Database className="h-5 w-5 text-red-400" />
                </div>
                <div>
                  <p className="font-semibold text-white">Clear Cache</p>
                  <p className="text-sm text-white/50">
                    Remove all cached data
                  </p>
                </div>
              </div>
              <button
                onClick={handleClearCache}
                className="inline-flex items-center gap-2 rounded-liquid-sm border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-400 hover:bg-red-500/20 transition-all duration-300"
              >
                <Trash2 className="h-4 w-4" />
                Clear
              </button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* About */}
      <Card>
        <CardHeader title="About" description="Application information" />
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <span className="text-white/50 flex items-center gap-2">
                <Info className="h-4 w-4" />
                Version
              </span>
              <span className="font-semibold text-white">1.0.0</span>
            </div>
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <span className="text-white/50">React</span>
              <span className="font-medium text-white/70">18.2.0</span>
            </div>
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <span className="text-white/50">TypeScript</span>
              <span className="font-medium text-white/70">5.3.3</span>
            </div>
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <span className="text-white/50">Tailwind CSS</span>
              <span className="font-medium text-white/70">3.4.1</span>
            </div>
            <div className="flex items-center justify-between pt-1">
              <span className="text-white/50 flex items-center gap-2">
                <Zap className="h-4 w-4 text-yellow-400" />
                Liquid Glass Theme
              </span>
              <Badge variant="info">Active</Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
