import { Body, Controller, Delete, Get, Param, Post, Res } from '@nestjs/common';
import { Response } from 'express';
import { CreateThreadDto } from './dto/create-thread.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { ChatService } from './chat.service';
import { ChatStreamService } from './chat-stream.service';

@Controller('conversations')
export class ChatController {
  constructor(
    private readonly chat: ChatService,
    private readonly stream: ChatStreamService,
  ) {}

  @Post()
  createThread(@Body() body: CreateThreadDto) {
    return this.chat.createThread(body);
  }

  @Get()
  listThreads() {
    return this.chat.listThreads();
  }

  @Get(':id')
  getThread(@Param('id') id: string) {
    return this.chat.getThread(id);
  }

  @Delete(':id')
  removeThread(@Param('id') id: string) {
    return this.chat.removeThread(id);
  }

  @Post(':id/messages')
  addMessage(@Param('id') id: string, @Body() body: SendMessageDto) {
    return this.chat.addUserMessage(id, body);
  }

  @Post(':id/stream')
  async streamMessage(@Param('id') id: string, @Body() body: SendMessageDto, @Res() res: Response) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const controller = new AbortController();
    res.on('close', () => controller.abort());

    try {
      for await (const event of this.stream.stream(id, body, controller.signal)) {
        res.write(`event: ${event.type}\n`);
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }
    } catch (error) {
      res.write(`event: error\n`);
      res.write(`data: ${JSON.stringify({ type: 'error', message: error instanceof Error ? error.message : 'Unknown error' })}\n\n`);
    } finally {
      res.end();
    }
  }
}
