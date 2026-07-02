import { Segmented, Typography, message } from 'antd';
import { useMutation } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { updatePreferences } from '../../api/auth';
import { useAuth } from '../../hooks/useAuth';
import { formatErrorMessage } from './settings-utils';

const THEME_STORAGE_KEY = 'healthflow.themeMode';
const THEME_OPTIONS = [
  { label: '浅色', value: 'light' },
  { label: '深色', value: 'dark' },
  { label: '跟随系统', value: 'system' },
];

export function AppearanceTab() {
  const { user, refreshUser } = useAuth();
  const [themeMode, setThemeMode] = useState(() => user?.themeMode ?? localStorage.getItem(THEME_STORAGE_KEY) ?? 'system');

  useEffect(() => {
    if (user?.themeMode) setThemeMode(user.themeMode);
  }, [user?.themeMode]);

  const savePreference = useMutation({
    mutationFn: updatePreferences,
    onSuccess: async () => {
      await refreshUser();
      message.success('外观偏好已保存');
    },
    onError: (error) => message.error(`保存失败：${formatErrorMessage(error)}`),
  });

  function handleThemeChange(value: string | number) {
    const nextMode = String(value);
    setThemeMode(nextMode);
    localStorage.setItem(THEME_STORAGE_KEY, nextMode);
    if (nextMode === 'dark') {
      message.info('深色模式正在开发中，当前仅保存偏好，界面暂不变化。');
    }
    savePreference.mutate({ themeMode: nextMode });
  }

  return (
    <div className="settings-tab-panel">
      <Typography.Title level={4}>主题模式</Typography.Title>
      <Segmented value={themeMode} options={THEME_OPTIONS} onChange={handleThemeChange} />
    </div>
  );
}
