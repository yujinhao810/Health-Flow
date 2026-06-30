import { Body, Controller, Delete, Get, Param, Post, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth.types';
import { CreateThreadDto } from './dto/create-thread.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { ChatService } from './chat.service';
import { ChatStreamService } from './chat-stream.service';

@Controller('conversations')
@UseGuards(AuthGuard)
export class ChatController {
  constructor(
    private readonly chat: ChatService,
    private readonly stream: ChatStreamService,
  ) {}

  @Post()
  createThread(@CurrentUser() user: AuthUser, @Body() body: CreateThreadDto) {
    return this.chat.createThread(user, body);
  }

  @Get()
  listThreads(@CurrentUser() user: AuthUser) {
    return this.chat.listThreads(user);
  }

  @Get(':id')
  getThread(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.chat.getThread(user, id);
  }

  @Delete(':id')
  removeThread(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.chat.removeThread(user, id);
  }

  @Post(':id/messages')
  addMessage(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: SendMessageDto) {
    return this.chat.addUserMessage(user, id, body);
  }

  @Post(':id/stream')
  async streamMessage(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: SendMessageDto, @Res() res: Response) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const controller = new AbortController();
    res.on('close', () => controller.abort());

    try {
      for await (const event of this.stream.stream(user, id, body, controller.signal)) {
        writeSse(res, event.type, event);
      }
    } catch (error) {
      writeSse(res, 'error', { type: 'error', message: error instanceof Error ? error.message : 'Unknown error' });
    } finally {
      res.end();
    }
  }
}

function writeSse(res: Response, event: string, data: unknown) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
  const flush = (res as Response & { flush?: () => void }).flush;
  if (typeof flush === 'function') flush.call(res);
}
