import { PrismaClient } from "@prisma/client";

const baseUrl = process.env.API_SMOKE_BASE_URL || "http://127.0.0.1:3001";
const email = `healthflow-smoke-${Date.now()}@example.com`;
const password = "SmokeTest-2026!";
let token: string | undefined;
let knowledgeUploadId: string | undefined;

async function request<T>(path: string, init?: RequestInit) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });
  const payload = (await response.json()) as {
    data?: T;
    error?: { message?: string };
    message?: string;
  };
  if (!response.ok)
    throw new Error(
      `${init?.method ?? "GET"} ${path}: ${payload.error?.message || payload.message || response.status}`,
    );
  return (payload.data ?? payload) as T;
}

async function main() {
  const cleanup = new PrismaClient();
  await cleanup.user
    .deleteMany({ where: { email: { startsWith: "healthflow-smoke-" } } })
    .finally(() => cleanup.$disconnect());
  try {
    const auth = await request<{ token: string }>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password, displayName: "Smoke Test" }),
    });
    token = auth.token;

    await request("/llm/config", {
      method: "POST",
      body: JSON.stringify({
        provider: "mock",
        model: "mock-health-assistant",
        diagnosisWesternModel: "mock-health-assistant",
        diagnosisTcmModel: "mock-health-assistant",
        diagnosisReviewerModel: "mock-health-assistant",
        diagnosisIntegratorModel: "mock-health-assistant",
        ragEnabled: true,
        ragTopK: 5,
        visionEnabled: false,
      }),
    });

    const knowledgeForm = new FormData();
    knowledgeForm.append(
      "file",
      new Blob([createPdf("MAGIC-PARSER-2026: hydration guidance.")], {
        type: "application/pdf",
      }),
      "parser-smoke.pdf",
    );
    knowledgeForm.append("purpose", "knowledge_source");
    const knowledgeResponse = await fetch(`${baseUrl}/uploads`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: knowledgeForm,
    });
    const knowledgePayload = (await knowledgeResponse.json()) as {
      data?: {
        id: string;
        status: string;
        chunkCount?: number;
        parser?: string;
        parsingQualityScore?: number;
      };
      id?: string;
      status?: string;
      chunkCount?: number;
      parser?: string;
      parsingQualityScore?: number;
      message?: string;
    };
    if (!knowledgeResponse.ok) {
      throw new Error(
        `知识文档上传失败：${knowledgePayload.message ?? knowledgeResponse.status}`,
      );
    }
    const knowledgeUpload = knowledgePayload.data ?? knowledgePayload;
    knowledgeUploadId = knowledgeUpload.id;
    if (
      !knowledgeUploadId ||
      knowledgeUpload.status !== "ready" ||
      !knowledgeUpload.chunkCount ||
      !knowledgeUpload.parser ||
      knowledgeUpload.parsingQualityScore === undefined
    ) {
      throw new Error("知识文档没有完成解析、语义切块和入库");
    }

    const session = await request<{
      id: string;
      status: string;
      generationStatus?: { roleModels?: Record<string, string> };
    }>("/integrative-diagnosis", {
      method: "POST",
      body: JSON.stringify({
        chiefComplaint: "最近两天睡眠较差，白天有些疲劳",
        symptoms: [
          {
            name: "睡眠差",
            severity: 3,
            duration: "2天",
            triggers: [],
            relievers: [],
            associatedSymptoms: [],
          },
        ],
        vitals: {},
        lifestyleSignals: { sleepHours: 5 },
        medicalContext: {
          chronicConditions: [],
          medications: [],
          allergies: [],
          recentDiagnoses: [],
        },
        tcmObservations: {},
        includeRecentHealthContext: false,
      }),
    });
    if (!session.id || !["completed", "degraded"].includes(session.status))
      throw new Error("初次会诊未完成");
    if (!session.generationStatus?.roleModels?.western)
      throw new Error("角色模型审计信息缺失");

    const updated = await request<{ id: string; status: string }>(
      `/integrative-diagnosis/${session.id}/supplement`,
      {
        method: "POST",
        body: JSON.stringify({
          additionalInformation: "没有胸痛或呼吸困难，昨晚入睡用了大约一小时。",
        }),
      },
    );
    if (updated.id !== session.id) throw new Error("补充信息没有更新原会话");
    if (!["completed", "degraded"].includes(updated.status))
      throw new Error(`否定红旗被错误升级为 ${updated.status}`);

    const runs = await request<
      Array<{ id: string; diagnosisSessionId?: string | null }>
    >("/agent-runs?limit=10");
    const diagnosisRun = runs.find(
      (run) => run.diagnosisSessionId === session.id,
    );
    if (!diagnosisRun) throw new Error("会诊 AgentRun 记录缺失");
    const runDetail = await request<{
      diagnosisSession?: {
        generationStatus?: {
          pipelineVersion?: string;
          coordinator?: {
            events?: unknown[];
            steps?: Array<{ name?: string }>;
          };
        } | null;
      } | null;
    }>(`/agent-runs/${diagnosisRun.id}`);
    const audit = runDetail.diagnosisSession?.generationStatus;
    if (!audit?.pipelineVersion?.includes("langgraph"))
      throw new Error("AgentRun 缺少 LangGraph pipeline 版本");
    if (!audit.coordinator?.events?.length)
      throw new Error("AgentRun 缺少协调器执行事件");
    const coordinatorSteps = new Set(
      audit.coordinator.steps?.map((step) => step.name),
    );
    if (
      !coordinatorSteps.has("western_initial") ||
      !coordinatorSteps.has("tcm_initial")
    ) {
      throw new Error("AgentRun 缺少并行初评节点");
    }
    console.log(
      `PASS API smoke: ${knowledgeUpload.parser} parsed PDF; session ${session.id} updated in place (${updated.status})`,
    );
  } finally {
    if (token) {
      if (knowledgeUploadId) {
        await request(`/uploads/${knowledgeUploadId}`, {
          method: "DELETE",
        }).catch(() => undefined);
      }
      await request("/auth/account", { method: "DELETE" }).catch(
        () => undefined,
      );
    } else {
      const prisma = new PrismaClient();
      await prisma.user
        .deleteMany({ where: { email } })
        .finally(() => prisma.$disconnect());
    }
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

function createPdf(text: string) {
  const content = `BT\n/F1 18 Tf\n72 720 Td\n(${escapePdfString(text)}) Tj\nET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let body = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(body, "latin1"));
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(body, "latin1");
  const xref = [
    "xref",
    `0 ${objects.length + 1}`,
    "0000000000 65535 f ",
    ...offsets
      .slice(1)
      .map((offset) => `${String(offset).padStart(10, "0")} 00000 n `),
    "trailer",
    `<< /Size ${objects.length + 1} /Root 1 0 R >>`,
    "startxref",
    String(xrefOffset),
    "%%EOF",
  ].join("\n");
  return Buffer.from(`${body}${xref}\n`, "latin1");
}

function escapePdfString(value: string) {
  return value.replace(/([\\()])/g, "\\$1");
}
