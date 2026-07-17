import io
import zipfile
from pathlib import Path


OOXML_TYPES = {
    "word/document.xml": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "xl/workbook.xml": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "ppt/presentation.xml": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
}

TEXT_EXTENSIONS = {".txt", ".md", ".markdown", ".csv", ".json"}


def detect_mime_type(data: bytes, filename: str, declared_mime_type: str | None = None) -> str:
    if data.startswith(b"%PDF-"):
        return "application/pdf"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if data.startswith((b"GIF87a", b"GIF89a")):
        return "image/gif"
    if data.startswith(b"BM"):
        return "image/bmp"
    if data[:4] in (b"II*\x00", b"MM\x00*"):
        return "image/tiff"
    if data.startswith(b"RIFF") and data[8:12] == b"WEBP":
        return "image/webp"
    if data.startswith(b"PK\x03\x04"):
        try:
            with zipfile.ZipFile(io.BytesIO(data)) as archive:
                names = set(archive.namelist())
            for marker, mime_type in OOXML_TYPES.items():
                if marker in names:
                    return mime_type
        except zipfile.BadZipFile:
            pass

    extension = Path(filename).suffix.lower()
    if extension in TEXT_EXTENSIONS and looks_like_text(data):
        return {
            ".md": "text/markdown",
            ".markdown": "text/markdown",
            ".csv": "text/csv",
            ".json": "application/json",
        }.get(extension, "text/plain")
    if declared_mime_type in {"text/plain", "text/markdown", "text/csv", "application/json"} and looks_like_text(data):
        return declared_mime_type
    return "application/octet-stream"


def looks_like_text(data: bytes) -> bool:
    sample = data[:8192]
    if not sample or b"\x00" in sample:
        return False
    control = sum(byte < 9 or 13 < byte < 32 for byte in sample)
    return control / len(sample) < 0.03
