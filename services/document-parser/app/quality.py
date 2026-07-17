import re

from .models import ParsedPage, QualityMetrics


def evaluate_quality(pages: list[ParsedPage], expected_pages: int | None = None) -> QualityMetrics:
    text = "\n".join(block.text for page in pages for block in page.blocks).strip()
    page_count = max(expected_pages or len(pages), 1)
    pages_with_text = sum(any(block.text.strip() for block in page.blocks) for page in pages)
    useful = len(re.findall(r"[\w\u4e00-\u9fff，。！？、；：“”‘’（）《》【】,.!?;:'\"()/%+\-]", text))
    replacement = text.count("�")
    garbled_ratio = min(1.0, replacement / max(len(text), 1))
    text_coverage = min(1.0, useful / max(len(text), 1)) if text else 0.0
    page_coverage = min(1.0, pages_with_text / page_count)
    confidences = [block.confidence for page in pages for block in page.blocks if block.confidence is not None]
    ocr_confidence = sum(confidences) / len(confidences) if confidences else None
    structured_blocks = sum(block.type != "paragraph" for page in pages for block in page.blocks)
    total_blocks = sum(len(page.blocks) for page in pages)
    layout_completeness = min(1.0, 0.6 + structured_blocks / max(total_blocks, 1)) if text else 0.0
    tables = [block for page in pages for block in page.blocks if block.type == "table"]
    table_completeness = (
        1.0
        if not tables
        else sum("|" in block.text or "\t" in block.text or "<table" in block.text.lower() for block in tables) / len(tables)
    )
    score = (
        text_coverage * 0.24
        + page_coverage * 0.26
        + (1 - garbled_ratio) * 0.2
        + layout_completeness * 0.15
        + table_completeness * 0.1
        + (ocr_confidence if ocr_confidence is not None else 1.0) * 0.05
    )
    if len(text) < 40:
        score *= 0.45
    return QualityMetrics(
        score=max(0.0, min(1.0, score)),
        textCoverage=text_coverage,
        garbledRatio=garbled_ratio,
        ocrConfidence=ocr_confidence,
        pageCoverage=page_coverage,
        layoutCompleteness=layout_completeness,
        tableCompleteness=table_completeness,
    )
