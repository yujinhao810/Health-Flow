from typing import Literal

from pydantic import BaseModel, Field


BlockType = Literal["heading", "paragraph", "table", "list", "image", "ocr_text"]


class ParsedBlock(BaseModel):
    id: str
    type: BlockType
    text: str
    bbox: tuple[float, float, float, float] | None = None
    confidence: float | None = Field(default=None, ge=0, le=1)
    level: int | None = Field(default=None, ge=1, le=12)


class ParsedPage(BaseModel):
    page_number: int = Field(alias="pageNumber", ge=1)
    width: float | None = None
    height: float | None = None
    blocks: list[ParsedBlock] = Field(default_factory=list)

    model_config = {"populate_by_name": True}


class QualityMetrics(BaseModel):
    score: float = Field(ge=0, le=1)
    text_coverage: float = Field(alias="textCoverage", ge=0, le=1)
    garbled_ratio: float = Field(alias="garbledRatio", ge=0, le=1)
    ocr_confidence: float | None = Field(default=None, alias="ocrConfidence", ge=0, le=1)
    page_coverage: float = Field(alias="pageCoverage", ge=0, le=1)
    layout_completeness: float = Field(alias="layoutCompleteness", ge=0, le=1)
    table_completeness: float = Field(alias="tableCompleteness", ge=0, le=1)

    model_config = {"populate_by_name": True}


class ParsedDocument(BaseModel):
    parser: str
    parser_version: str = Field(alias="parserVersion")
    detected_mime_type: str = Field(alias="detectedMimeType")
    title: str | None = None
    language: str | None = None
    text: str
    pages: list[ParsedPage]
    quality: QualityMetrics
    warnings: list[str] = Field(default_factory=list)

    model_config = {"populate_by_name": True}
