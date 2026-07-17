import csv
import io
import json
import tempfile
from functools import lru_cache
from pathlib import Path
from typing import Any

from charset_normalizer import from_bytes

from .detector import detect_mime_type
from .models import ParsedBlock, ParsedDocument, ParsedPage
from .quality import evaluate_quality


TEXT_MIME_TYPES = {"text/plain", "text/markdown", "text/csv", "application/json"}
IMAGE_MIME_TYPES = {"image/png", "image/jpeg", "image/gif", "image/bmp", "image/tiff", "image/webp"}


class DocumentParser:
    def parse(self, data: bytes, filename: str, declared_mime_type: str | None = None) -> ParsedDocument:
        detected = detect_mime_type(data, filename, declared_mime_type)
        if detected in TEXT_MIME_TYPES:
            return self._parse_text(data, filename, detected)
        if detected in IMAGE_MIME_TYPES:
            return self._parse_image(data, filename, detected)
        if detected == "application/pdf" or "officedocument" in detected:
            return self._parse_with_docling(data, filename, detected)
        raise ValueError(f"Unsupported or unrecognized file type: {detected}")

    def _parse_text(self, data: bytes, filename: str, detected: str) -> ParsedDocument:
        match = from_bytes(data).best()
        text = str(match) if match else data.decode("utf-8", errors="replace")
        warnings: list[str] = []
        if detected == "application/json":
            try:
                text = json.dumps(json.loads(text), ensure_ascii=False, indent=2)
            except json.JSONDecodeError:
                warnings.append("JSON syntax is invalid; indexed as plain text")
        elif detected == "text/csv":
            rows = list(csv.reader(io.StringIO(text)))
            text = "\n".join("\t".join(cell.strip() for cell in row) for row in rows)
        blocks = text_to_blocks(text, page_number=1)
        pages = [ParsedPage(pageNumber=1, blocks=blocks)]
        return build_document("native-text", "1", detected, filename, pages, warnings)

    def _parse_with_docling(self, data: bytes, filename: str, detected: str) -> ParsedDocument:
        warnings: list[str] = []
        suffix = extension_for_mime(detected)
        with tempfile.TemporaryDirectory(prefix="healthflow-parse-") as temp_dir:
            path = Path(temp_dir) / f"input{suffix}"
            path.write_bytes(data)
            try:
                converter = build_docling_converter()
                result = converter.convert(path)
                document = result.document
                pages = docling_pages(document)
                expected_pages = len(getattr(document, "pages", {}) or {}) or len(pages)
                parsed = build_document("docling", docling_version(), detected, filename, pages, warnings, expected_pages)
            except Exception as error:
                if detected != "application/pdf":
                    raise RuntimeError(f"Docling failed to parse document: {error}") from error
                warnings.append(f"Docling native PDF parsing failed: {error}")
                parsed = self._ocr_pdf(path, filename, detected, warnings)
            if detected == "application/pdf" and parsed.quality.score < 0.55:
                warnings = [*parsed.warnings, "Native PDF text quality was low; PaddleOCR fallback was used"]
                return self._ocr_pdf(path, filename, detected, warnings)
            return parsed

    def _parse_image(self, data: bytes, filename: str, detected: str) -> ParsedDocument:
        suffix = extension_for_mime(detected)
        with tempfile.TemporaryDirectory(prefix="healthflow-ocr-") as temp_dir:
            path = Path(temp_dir) / f"image{suffix}"
            path.write_bytes(data)
            blocks = paddle_ocr_blocks(path, 1)
        pages = [ParsedPage(pageNumber=1, blocks=blocks)]
        return build_document("paddleocr", paddle_version(), detected, filename, pages, [])

    def _ocr_pdf(self, path: Path, filename: str, detected: str, warnings: list[str]) -> ParsedDocument:
        try:
            import pypdfium2 as pdfium
        except ImportError as error:
            raise RuntimeError("pypdfium2 is required for scanned PDF OCR") from error
        pdf = pdfium.PdfDocument(str(path))
        pages: list[ParsedPage] = []
        with tempfile.TemporaryDirectory(prefix="healthflow-pdf-ocr-") as temp_dir:
            for index in range(len(pdf)):
                page = pdf[index]
                image_path = Path(temp_dir) / f"page-{index + 1}.png"
                page.render(scale=2.2).to_pil().save(image_path)
                width, height = page.get_size()
                pages.append(
                    ParsedPage(
                        pageNumber=index + 1,
                        width=float(width),
                        height=float(height),
                        blocks=paddle_ocr_blocks(image_path, index + 1),
                    )
                )
        return build_document("docling+paddleocr", f"{docling_version()}+{paddle_version()}", detected, filename, pages, warnings, len(pdf))


@lru_cache(maxsize=1)
def build_docling_converter():
    from docling.datamodel.base_models import InputFormat
    from docling.datamodel.pipeline_options import PdfPipelineOptions
    from docling.document_converter import DocumentConverter, PdfFormatOption

    options = PdfPipelineOptions()
    options.do_ocr = True
    options.do_table_structure = True
    try:
        from docling.datamodel.pipeline_options import PaddleOcrOptions

        options.ocr_options = PaddleOcrOptions(lang=["ch", "en"])
    except (ImportError, TypeError):
        pass
    return DocumentConverter(format_options={InputFormat.PDF: PdfFormatOption(pipeline_options=options)})


def docling_pages(document: Any) -> list[ParsedPage]:
    pages: dict[int, ParsedPage] = {}
    for index, pair in enumerate(document.iterate_items()):
        item = pair[0] if isinstance(pair, tuple) else pair
        label = str(getattr(item, "label", "paragraph")).lower()
        block_type = docling_block_type(label)
        text = item.export_to_markdown() if block_type == "table" and hasattr(item, "export_to_markdown") else str(getattr(item, "text", ""))
        text = text.strip()
        if not text:
            continue
        provenance = (getattr(item, "prov", None) or [None])[0]
        page_number = int(getattr(provenance, "page_no", 1) or 1)
        bbox = bbox_tuple(getattr(provenance, "bbox", None))
        level = int(getattr(item, "level", 1) or 1) if block_type == "heading" else None
        page = pages.setdefault(page_number, ParsedPage(pageNumber=page_number, blocks=[]))
        page.blocks.append(ParsedBlock(id=f"p{page_number}-b{index + 1}", type=block_type, text=text, bbox=bbox, level=level))
    if not pages:
        markdown = document.export_to_markdown()
        pages[1] = ParsedPage(pageNumber=1, blocks=text_to_blocks(markdown, 1))
    return [pages[number] for number in sorted(pages)]


def paddle_ocr_blocks(path: Path, page_number: int) -> list[ParsedBlock]:
    structured = paddle_structure_blocks(path, page_number)
    if structured:
        return structured
    engine = paddle_engine()
    results = engine.predict(str(path))
    blocks: list[ParsedBlock] = []
    counter = 0
    for result in results:
        payload = getattr(result, "json", result)
        if callable(payload):
            payload = payload()
        if isinstance(payload, dict) and isinstance(payload.get("res"), dict):
            payload = payload["res"]
        if not isinstance(payload, dict):
            continue
        texts = payload.get("rec_texts") or []
        scores = payload.get("rec_scores") or []
        polygons = payload.get("rec_polys") or payload.get("dt_polys") or []
        for index, text in enumerate(texts):
            if not str(text).strip():
                continue
            counter += 1
            score = float(scores[index]) if index < len(scores) else None
            blocks.append(
                ParsedBlock(
                    id=f"p{page_number}-ocr-{counter}",
                    type="ocr_text",
                    text=str(text).strip(),
                    confidence=score,
                    bbox=polygon_bbox(polygons[index]) if index < len(polygons) else None,
                )
            )
    return blocks


def paddle_structure_blocks(path: Path, page_number: int) -> list[ParsedBlock]:
    try:
        results = paddle_structure_engine().predict(str(path))
    except Exception:
        return []
    blocks: list[ParsedBlock] = []
    counter = 0
    for result in results:
        payload = result_payload(result)
        parsing_items = payload.get("parsing_res_list") or []
        for item in parsing_items:
            if not isinstance(item, dict):
                continue
            text = str(item.get("block_content") or item.get("text") or "").strip()
            if not text:
                continue
            counter += 1
            label = str(item.get("block_label") or item.get("label") or "paragraph").lower()
            confidence = numeric_confidence(item.get("block_score") or item.get("score"))
            blocks.append(
                ParsedBlock(
                    id=f"p{page_number}-structure-{counter}",
                    type=docling_block_type(label),
                    text=text,
                    bbox=flat_bbox(item.get("block_bbox") or item.get("bbox")),
                    confidence=confidence,
                )
            )
        for item in payload.get("table_res_list") or []:
            if not isinstance(item, dict):
                continue
            table_text = item.get("pred_html") or item.get("table_markdown") or item.get("text")
            if not table_text:
                continue
            counter += 1
            blocks.append(
                ParsedBlock(
                    id=f"p{page_number}-table-{counter}",
                    type="table",
                    text=str(table_text).strip(),
                    bbox=flat_bbox(item.get("table_box") or item.get("bbox")),
                    confidence=numeric_confidence(item.get("confidence") or item.get("score")),
                )
            )
    return blocks


@lru_cache(maxsize=1)
def paddle_engine():
    from paddleocr import PaddleOCR

    return PaddleOCR(lang="ch", use_doc_orientation_classify=True, use_doc_unwarping=True, use_textline_orientation=True)


@lru_cache(maxsize=1)
def paddle_structure_engine():
    from paddleocr import PPStructureV3

    return PPStructureV3(lang="ch")


def result_payload(result: Any) -> dict[str, Any]:
    payload = getattr(result, "json", result)
    if callable(payload):
        payload = payload()
    if isinstance(payload, dict) and isinstance(payload.get("res"), dict):
        return payload["res"]
    return payload if isinstance(payload, dict) else {}


def numeric_confidence(value: Any):
    try:
        result = float(value)
        return max(0.0, min(1.0, result))
    except (TypeError, ValueError):
        return None


def flat_bbox(value: Any):
    if isinstance(value, (list, tuple)) and len(value) >= 4 and all(isinstance(item, (int, float)) for item in value[:4]):
        return tuple(float(item) for item in value[:4])
    return polygon_bbox(value)


def build_document(
    parser: str,
    version: str,
    detected: str,
    filename: str,
    pages: list[ParsedPage],
    warnings: list[str],
    expected_pages: int | None = None,
) -> ParsedDocument:
    text = "\n\n".join(block.text for page in pages for block in page.blocks if block.text.strip()).strip()
    quality = evaluate_quality(pages, expected_pages)
    return ParsedDocument(
        parser=parser,
        parserVersion=version,
        detectedMimeType=detected,
        title=Path(filename).name,
        language="zh-CN",
        text=text,
        pages=pages,
        quality=quality,
        warnings=warnings,
    )


def text_to_blocks(text: str, page_number: int) -> list[ParsedBlock]:
    blocks: list[ParsedBlock] = []
    for index, piece in enumerate(part.strip() for part in text.split("\n\n") if part.strip()):
        first_line = piece.splitlines()[0].strip()
        is_heading = len(first_line) <= 80 and (first_line.startswith("#") or (len(piece.splitlines()) == 1 and not first_line.endswith(("。", "."))))
        blocks.append(
            ParsedBlock(
                id=f"p{page_number}-b{index + 1}",
                type="heading" if is_heading else "paragraph",
                text=piece.lstrip("# ") if is_heading else piece,
                level=max(1, min(6, len(first_line) - len(first_line.lstrip("#")))) if first_line.startswith("#") else (1 if is_heading else None),
            )
        )
    return blocks


def docling_block_type(label: str):
    if "title" in label or "heading" in label or "section_header" in label:
        return "heading"
    if "table" in label:
        return "table"
    if "list" in label:
        return "list"
    if "picture" in label or "image" in label or "figure" in label:
        return "image"
    return "paragraph"


def bbox_tuple(value: Any):
    if value is None:
        return None
    if hasattr(value, "as_tuple"):
        value = value.as_tuple()
    if isinstance(value, (list, tuple)) and len(value) >= 4:
        return tuple(float(item) for item in value[:4])
    fields = [getattr(value, name, None) for name in ("l", "t", "r", "b")]
    return tuple(float(item) for item in fields) if all(item is not None for item in fields) else None


def polygon_bbox(value: Any):
    if not isinstance(value, (list, tuple)) or not value:
        return None
    points = [point for point in value if isinstance(point, (list, tuple)) and len(point) >= 2]
    if not points:
        return None
    xs = [float(point[0]) for point in points]
    ys = [float(point[1]) for point in points]
    return min(xs), min(ys), max(xs), max(ys)


def extension_for_mime(mime_type: str):
    return {
        "application/pdf": ".pdf",
        "image/png": ".png",
        "image/jpeg": ".jpg",
        "image/gif": ".gif",
        "image/bmp": ".bmp",
        "image/tiff": ".tiff",
        "image/webp": ".webp",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
    }.get(mime_type, ".bin")


def docling_version():
    try:
        from importlib.metadata import version

        return version("docling")
    except Exception:
        return "unknown"


def paddle_version():
    try:
        from importlib.metadata import version

        return version("paddleocr")
    except Exception:
        return "unknown"
