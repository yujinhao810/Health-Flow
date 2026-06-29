import { Injectable } from '@nestjs/common';

@Injectable()
export class RedactionService {
  redact(text: string) {
    return text
      .replace(/sk-[a-zA-Z0-9-_]+/g, '[REDACTED_KEY]')
      .replace(/Bearer\s+[A-Za-z0-9-_.]+/g, 'Bearer [REDACTED]');
  }
}
