# HealthFlow Document Parser

Local FastAPI service for structured document extraction. Docling handles native PDF and Office structure; PaddleOCR handles images and scanned-PDF fallback.

```bash
docker compose up -d document-parser
curl http://localhost:8090/health
```

The first OCR request downloads PaddleOCR models into the Docker volume and can take longer than subsequent requests.
