import { UnorderedListOutlined } from '@ant-design/icons';
import { Button, Col, Row, Typography } from 'antd';
import { useState } from 'react';
import { GradientText } from '../components/effects/GradientText';
import { RecordForm } from '../components/records/RecordForm';
import { RecordTimeline } from '../components/records/RecordTimeline';

export function RecordsPage() {
  const [showRecentRecords, setShowRecentRecords] = useState(false);

  return (
    <>
      <div className="page-intro">
        <Typography.Title className="page-gradient-title" level={2}>
          <GradientText pauseOnHover>健康记录</GradientText>
        </Typography.Title>
        <Typography.Paragraph type="secondary">
          用温和的方式记录睡眠、运动、心情与就医信息，帮助生成更准确的健康洞察。
        </Typography.Paragraph>
      </div>
      {showRecentRecords ? (
        <Row gutter={[18, 18]}>
          <Col xs={24} lg={10}><RecordForm /></Col>
          <Col xs={24} lg={14}><RecordTimeline onCollapse={() => setShowRecentRecords(false)} /></Col>
        </Row>
      ) : (
        <div className="records-collapsed-layout">
          <Button type="primary" icon={<UnorderedListOutlined />} onClick={() => setShowRecentRecords(true)}>
            查看最近记录
          </Button>
          <Row gutter={[18, 18]} justify="center">
            <Col xs={24} md={18} lg={12} xl={10}><RecordForm /></Col>
          </Row>
        </div>
      )}
    </>
  );
}
