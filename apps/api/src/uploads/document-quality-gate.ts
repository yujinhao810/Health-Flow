import { BadRequestException } from "@nestjs/common";
import type { ParsedDocument } from "./parsed-document.types";

export function assertDocumentQuality(
  document: ParsedDocument,
  minimumScore = 0.55,
) {
  const failures: string[] = [];
  if (!document.text.trim()) failures.push("没有提取到有效文本");
  if (document.quality.score < minimumScore)
    failures.push(
      `综合质量 ${format(document.quality.score)} 低于 ${format(minimumScore)}`,
    );
  if (document.quality.garbledRatio > 0.08)
    failures.push(`乱码比例 ${format(document.quality.garbledRatio)} 过高`);
  if (document.quality.pageCoverage < 0.45)
    failures.push(
      `有效页面覆盖率 ${format(document.quality.pageCoverage)} 过低`,
    );
  if (
    document.quality.ocrConfidence !== null &&
    document.quality.ocrConfidence !== undefined &&
    document.quality.ocrConfidence < 0.5
  ) {
    failures.push(
      `OCR 平均置信度 ${format(document.quality.ocrConfidence)} 过低`,
    );
  }
  if (failures.length) {
    throw new BadRequestException(
      `文件解析质量未通过：${failures.join("；")}。请上传更清晰的文件或文本型原件。`,
    );
  }
}

function format(value: number) {
  return `${Math.round(value * 100)}%`;
}
