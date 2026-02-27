import { useState, useEffect } from 'react';
import { Save, Moon, Sun, Database, Key, RefreshCw, Trash2 } from 'lucide-react';
import { useStore } from '@/store';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { clsx } from 'clsx';
import { toast } from 'sonner';

export function Settings() {
  const { settings, setSettings } = useStore();
  const [apiKey, setApiKey] = useState(settings.apiKey);
  const [cacheDuration, setCacheDuration] = useState(settings.cacheDuration);

  useEffect(() => {
    // Load API key from localStorage on mount
    const storedKey = localStorage.getItem('coinglass_api_key');
    if (storedKey) {
      setApiKey(storedKey);
    }
  }, []);

  const handleSaveApiKey = () => {
    localStorage.setItem('coinglass_api_key', apiKey);
    setSettings({ apiKey });
    toast.success('API Key saved successfully');
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
        <h2 className="text-2xl font-bold">Settings</h2>
        <p className="text-muted-foreground">Configure your dashboard preferences</p>
      </div>

      {/* API Configuration */}
      <Card>
        <CardHeader
          title="API Configuration"
          description="Configure your API keys for data access"
        />
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium">API Key</label>
            <div className="mt-2 flex gap-2">
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Enter your API key"
                className="flex-1 h-10 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
              <button
                onClick={handleSaveApiKey}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                <Save className="h-4 w-4" />
                Save
              </button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Get your API key from the Coinglass API dashboard
            </p>
          </div>

          <div className="rounded-lg bg-muted p-4">
            <div className="flex items-center gap-2">
              <Key className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">API Status</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {apiKey ? 'API key configured' : 'No API key configured'}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Appearance */}
      <Card>
        <CardHeader title="Appearance" description="Customize the look and feel" />
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {settings.theme === 'dark' ? (
                <Moon className="h-5 w-5" />
              ) : (
                <Sun className="h-5 w-5" />
              )}
              <div>
                <p className="font-medium">Theme</p>
                <p className="text-sm text-muted-foreground">
                  Current: {settings.theme === 'dark' ? 'Dark' : 'Light'} mode
                </p>
              </div>
            </div>
            <button
              onClick={handleThemeToggle}
              className={clsx(
                'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                settings.theme === 'dark' ? 'bg-primary' : 'bg-muted'
              )}
            >
              <span
                className={clsx(
                  'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                  settings.theme === 'dark' ? 'translate-x-6' : 'translate-x-1'
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
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium">Cache Duration (minutes)</label>
            <div className="mt-2 flex gap-2">
              <input
                type="number"
                min="1"
                max="60"
                value={cacheDuration}
                onChange={(e) => setCacheDuration(parseInt(e.target.value) || 5)}
                className="h-10 w-32 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
              <button
                onClick={handleSaveCache}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                <Save className="h-4 w-4" />
                Save
              </button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              How long to cache API responses before refreshing (1-60 minutes)
            </p>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border p-4">
            <div className="flex items-center gap-3">
              <Database className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="font-medium">Clear Cache</p>
                <p className="text-sm text-muted-foreground">
                  Remove all cached data
                </p>
              </div>
            </div>
            <button
              onClick={handleClearCache}
              className="inline-flex items-center gap-2 rounded-md border border-destructive px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="h-4 w-4" />
              Clear
            </button>
          </div>
        </CardContent>
      </Card>

      {/* About */}
      <Card>
        <CardHeader title="About" description="Application information" />
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <span className="text-muted-foreground">Version</span>
              <span className="font-medium">1.0.0</span>
            </div>
            <div className="flex items-center justify-between border-b border-border pb-3">
              <span className="text-muted-foreground">React</span>
              <span className="font-medium">18.2.0</span>
            </div>
            <div className="flex items-center justify-between border-b border-border pb-3">
              <span className="text-muted-foreground">TypeScript</span>
              <span className="font-medium">5.3.3</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Tailwind CSS</span>
              <span className="font-medium">3.4.1</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
