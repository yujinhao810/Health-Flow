export function formatErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return simplifyApiError(error.message);
  }
  return '未知错误';
}

export function simplifyApiError(messageText: string) {
  const fallback = '无法连接后端 API，请确认 API 服务已经启动并监听 http://localhost:3001';
  if (!messageText.trim()) return fallback;
  const directMessage = toFriendlyApiError(messageText);
  if (directMessage) return directMessage;

  try {
    const parsed = JSON.parse(messageText) as { message?: unknown; error?: string };
    if (Array.isArray(parsed.message)) {
      return parsed.message.map((item) => toFriendlyApiError(String(item)) ?? String(item)).join('；');
    }
    if (typeof parsed.message === 'string') return toFriendlyApiError(parsed.message) ?? parsed.message;
    if (parsed.error) return toFriendlyApiError(parsed.error) ?? parsed.error;
    return messageText;
  } catch {
    return messageText;
  }
}

function toFriendlyApiError(messageText: string) {
  const normalized = messageText.toLowerCase();
  if (messageText === 'Failed to fetch' || normalized.includes('econnrefused')) {
    return '无法连接服务，请确认本地服务已启动，或稍后重试。';
  }
  if (normalized.includes('timeout') || normalized.includes('timed out') || normalized.includes('aborterror')) {
    return '连接超时，请检查网络或稍后重试。';
  }
  if (normalized.includes('fetch failed') || messageText.includes('无法连接到模型服务') || messageText.includes('无法连接到 Anthropic')) {
    return '无法连接模型服务，请检查网络、Base URL，或稍后重试。';
  }
  if (normalized.includes('401') || normalized.includes('403') || messageText.includes('认证失败')) {
    return 'API Key 无效、已过期或权限不足，请检查后重试。';
  }
  if (normalized.includes('404') || messageText.includes('模型不存在') || messageText.includes('接口或模型不存在')) {
    return '模型 ID 或 API 地址不存在，请到提供商控制台确认后重试。';
  }
  return null;
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
