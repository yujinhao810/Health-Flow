import asyncio

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from starlette.concurrency import run_in_threadpool

from .parsers import DocumentParser


app = FastAPI(title="HealthFlow Document Parser", version="1.0.0")
parser = DocumentParser()
parse_lock = asyncio.Lock()
MAX_UPLOAD_BYTES = 25 * 1024 * 1024


@app.get("/health")
def health():
    return {"status": "ok", "engines": ["docling", "paddleocr"]}


@app.post("/v1/parse")
async def parse_document(
    file: UploadFile = File(...),
    declared_mime_type: str | None = Form(default=None, alias="declaredMimeType"),
):
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Uploaded file exceeds 25 MB parser limit")
    try:
        async with parse_lock:
            document = await run_in_threadpool(parser.parse, data, file.filename or "upload", declared_mime_type or file.content_type)
        return document.model_dump(by_alias=True)
    except ValueError as error:
        raise HTTPException(status_code=415, detail=str(error)) from error
    except Exception as error:
        raise HTTPException(status_code=422, detail=f"Document parsing failed: {error}") from error
