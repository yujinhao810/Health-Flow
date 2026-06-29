import { Typography } from 'antd';
import { SnapshotCard } from '../components/snapshots/SnapshotCard';

export function SnapshotsPage() {
  return (
    <>
      <div className="page-intro">
        <Typography.Title level={2}>健康快照</Typography.Title>
        <Typography.Paragraph type="secondary">
          汇总近期健康记录，生成更清晰的状态观察与温和建议。
        </Typography.Paragraph>
      </div>
      <SnapshotCard />
    </>
  );
}
