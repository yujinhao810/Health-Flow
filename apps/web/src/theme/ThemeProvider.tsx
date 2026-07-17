import { ConfigProvider, theme as antdTheme } from 'antd';
import type { ThemeConfig } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useAuth } from '../hooks/useAuth';

export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

type ThemeContextValue = {
  themeMode: ThemeMode;
  resolvedTheme: ResolvedTheme;
  setThemeMode: (mode: ThemeMode) => void;
};

export const THEME_STORAGE_KEY = 'healthflow.themeMode';

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function initializeThemeDocument() {
  const mode = readStoredThemeMode();
  applyThemeToDocument(resolveTheme(mode, systemPrefersDark()));
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [themeMode, setThemeModeState] = useState<ThemeMode>(readStoredThemeMode);
  const [prefersDark, setPrefersDark] = useState(systemPrefersDark);
  const resolvedTheme = resolveTheme(themeMode, prefersDark);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (event: MediaQueryListEvent) => setPrefersDark(event.matches);
    setPrefersDark(media.matches);
    media.addEventListener('change', handleChange);
    return () => media.removeEventListener('change', handleChange);
  }, []);

  useEffect(() => {
    const accountMode = normalizeThemeMode(user?.themeMode);
    if (accountMode) setThemeModeState(accountMode);
  }, [user?.id, user?.themeMode]);

  useLayoutEffect(() => {
    localStorage.setItem(THEME_STORAGE_KEY, themeMode);
    applyThemeToDocument(resolvedTheme);
  }, [resolvedTheme, themeMode]);

  const setThemeMode = useCallback((mode: ThemeMode) => {
    setThemeModeState(mode);
    localStorage.setItem(THEME_STORAGE_KEY, mode);
  }, []);

  const value = useMemo(
    () => ({ themeMode, resolvedTheme, setThemeMode }),
    [resolvedTheme, setThemeMode, themeMode],
  );

  return (
    <ThemeContext.Provider value={value}>
      <ConfigProvider locale={zhCN} theme={buildThemeConfig(resolvedTheme)}>
        {children}
      </ConfigProvider>
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within ThemeProvider');
  return context;
}

function buildThemeConfig(resolvedTheme: ResolvedTheme): ThemeConfig {
  const dark = resolvedTheme === 'dark';
  return {
    algorithm: dark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
    token: {
      colorPrimary: dark ? '#8b83ff' : '#6d5dfc',
      colorInfo: dark ? '#60a5fa' : '#3b82f6',
      colorSuccess: dark ? '#34d399' : '#38bdf8',
      colorWarning: dark ? '#fbbf24' : '#f59e0b',
      colorError: dark ? '#fb7185' : '#ef4444',
      colorBgBase: dark ? '#10131d' : '#f3f0ff',
      colorBgLayout: dark ? '#10131d' : '#f3f0ff',
      colorBgContainer: dark ? '#191d2a' : 'rgba(255, 255, 255, 0.74)',
      colorBgElevated: dark ? '#202535' : '#ffffff',
      colorTextBase: dark ? '#e8ecf7' : '#1e1b4b',
      colorTextHeading: dark ? '#f8fafc' : '#1e1b4b',
      colorTextSecondary: dark ? '#aab3c7' : '#64748b',
      colorBorder: dark ? 'rgba(148, 163, 184, 0.24)' : 'rgba(129, 140, 248, 0.24)',
      borderRadius: 16,
      borderRadiusLG: 22,
      boxShadow: dark ? '0 18px 45px rgba(0, 0, 0, 0.24)' : '0 18px 45px rgba(80, 70, 180, 0.12)',
      wireframe: false,
    },
    components: {
      Layout: {
        bodyBg: 'transparent',
        headerBg: dark ? 'rgba(20, 24, 35, 0.9)' : 'rgba(255, 255, 255, 0.62)',
        siderBg: dark ? 'rgba(20, 24, 35, 0.94)' : 'rgba(255, 255, 255, 0.58)',
      },
      Card: {
        borderRadiusLG: 22,
        boxShadowTertiary: dark ? '0 18px 45px rgba(0, 0, 0, 0.2)' : '0 18px 45px rgba(80, 70, 180, 0.10)',
      },
      Button: {
        borderRadius: 999,
        primaryShadow: dark ? '0 10px 24px rgba(109, 93, 252, 0.2)' : '0 10px 24px rgba(109, 93, 252, 0.26)',
      },
      Input: { borderRadius: 14 },
      InputNumber: { borderRadius: 14 },
      Select: { borderRadius: 14 },
      DatePicker: { borderRadius: 14 },
      Alert: { borderRadiusLG: 18 },
      Menu: {
        itemBorderRadius: 14,
        itemSelectedBg: dark ? 'rgba(139, 131, 255, 0.16)' : 'rgba(109, 93, 252, 0.14)',
        itemSelectedColor: dark ? '#c7c3ff' : '#5b4ee6',
      },
    },
  };
}

function readStoredThemeMode(): ThemeMode {
  return normalizeThemeMode(localStorage.getItem(THEME_STORAGE_KEY)) ?? 'system';
}

function normalizeThemeMode(value?: string | null): ThemeMode | null {
  return value === 'light' || value === 'dark' || value === 'system' ? value : null;
}

function systemPrefersDark() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function resolveTheme(mode: ThemeMode, prefersDark: boolean): ResolvedTheme {
  return mode === 'system' ? (prefersDark ? 'dark' : 'light') : mode;
}

function applyThemeToDocument(theme: ResolvedTheme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}
