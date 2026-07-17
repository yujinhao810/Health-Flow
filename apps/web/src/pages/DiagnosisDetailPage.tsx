import { ArrowLeftOutlined } from "@ant-design/icons";
import {
  Alert,
  Button,
  Card,
  Empty,
  Space,
  Spin,
  Tag,
  Typography,
  message,
} from "antd";
import { useNavigate, useParams } from "react-router-dom";
import { DiagnosisResult } from "../components/diagnosis/DiagnosisResult";
import {
  useDiagnosisDetail,
  useDiagnosisRetry,
  useDiagnosisSupplement,
} from "../hooks/useDiagnosis";

export function DiagnosisDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const detail = useDiagnosisDetail(id);
  const supplement = useDiagnosisSupplement(id);
  const retry = useDiagnosisRetry(id);

  async function handleSupplement(additionalInformation: string) {
    try {
      await supplement.mutateAsync({ additionalInformation });
      message.success("补充信息已合并，会诊结果已更新");
    } catch (error) {
      message.error(
        error instanceof Error ? error.message : "补充信息提交失败",
      );
      throw error;
    }
  }

  async function handleRetry() {
    try {
      await retry.mutateAsync();
      message.success("会诊结果已更新");
    } catch (error) {
      message.error(error instanceof Error ? error.message : "重新会诊失败");
    }
  }

  function renderContent() {
    if (!id) {
      return (
        <Card>
          <Empty description="辅助分诊记录不存在" />
        </Card>
      );
    }

    if (detail.isLoading) {
      return (
        <Card>
          <div style={{ padding: "36px 0", textAlign: "center" }}>
            <Spin tip="正在加载辅助分诊结果..." />
          </div>
        </Card>
      );
    }

    if (detail.isError) {
      return (
        <Alert
          type="error"
          showIcon
          message="加载辅助分诊记录失败"
          description={
            detail.error instanceof Error
              ? detail.error.message
              : "请稍后重试，或返回辅助分诊页面重新查看历史记录。"
          }
          action={
            <Button onClick={() => navigate("/diagnosis")}>返回辅助分诊</Button>
          }
        />
      );
    }

    if (!detail.data) {
      return (
        <Card>
          <Empty description="辅助分诊记录不存在" />
        </Card>
      );
    }

    return (
      <DiagnosisResult
        session={detail.data}
        onSupplement={handleSupplement}
        supplementLoading={supplement.isPending}
        onRetry={handleRetry}
        retryLoading={retry.isPending}
      />
    );
  }

  return (
    <main className="diagnosis-report-page">
      <header className="diagnosis-report-header">
        <Button
          className="diagnosis-report-back"
          type="text"
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate("/diagnosis")}
        >
          返回辅助分诊
        </Button>
        <Typography.Text className="diagnosis-report-kicker">
          健康会诊报告
        </Typography.Text>
        <Typography.Title level={2}>辅助分诊汇总建议</Typography.Title>
        <Space className="diagnosis-report-meta" size={8} wrap>
          {detail.data?.createdAt ? (
            <Typography.Text type="secondary">
              生成时间：{new Date(detail.data.createdAt).toLocaleString()}
            </Typography.Text>
          ) : null}
          {detail.data?.generationStatus?.degraded ? (
            <Tag color="orange">部分生成</Tag>
          ) : null}
        </Space>
      </header>
      {renderContent()}
    </main>
  );
}
