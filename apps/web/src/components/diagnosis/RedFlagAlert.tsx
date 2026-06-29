import { Alert } from 'antd';
import type { IntegratedDiagnosisResult } from '@health/shared';

export function RedFlagAlert({ result }: { result?: IntegratedDiagnosisResult | null }) {
  if (!result?.mustSeekImmediateCare) return null;
  return (
    <Alert
      type="error"
      showIcon
      message="建议立即就医"
      description={result.immediateCareReasons.length ? result.immediateCareReasons.join('；') : '当前信息包含需要立即线下评估的风险信号。'}
      style={{ marginBottom: 16 }}
    />
  );
}
