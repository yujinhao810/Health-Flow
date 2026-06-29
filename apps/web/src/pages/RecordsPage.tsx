import { Col, Row, Typography } from 'antd';
import { RecordForm } from '../components/records/RecordForm';
import { RecordTimeline } from '../components/records/RecordTimeline';

export function RecordsPage() {
  return (
    <>
      <div className="page-intro">
        <Typography.Title level={2}>健康记录</Typography.Title>
        <Typography.Paragraph type="secondary">
          用温和的方式记录睡眠、运动、心情与就医信息，帮助生成更准确的健康洞察。
        </Typography.Paragraph>
      </div>
      <Row gutter={[18, 18]}>
        <Col xs={24} lg={10}><RecordForm /></Col>
        <Col xs={24} lg={14}><RecordTimeline /></Col>
      </Row>
    </>
  );
}
