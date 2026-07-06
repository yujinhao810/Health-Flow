import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth.types';
import { AdminGuard } from './admin.guard';
import { AdminUsersService } from './admin-users.service';
import { ListAdminUsersDto, ResetAdminUserPasswordDto, UpdateAdminUserDto } from './dto/admin-users.dto';

@Controller('admin/users')
@UseGuards(AuthGuard, AdminGuard)
export class AdminUsersController {
  constructor(private readonly users: AdminUsersService) {}

  @Get()
  list(@Query() query: ListAdminUsersDto) {
    return this.users.listUsers(query);
  }

  @Patch(':id')
  update(@CurrentUser() admin: AuthUser, @Param('id') id: string, @Body() body: UpdateAdminUserDto) {
    return this.users.updateUser(admin.id, id, body);
  }

  @Post(':id/reset-password')
  resetPassword(@Param('id') id: string, @Body() body: ResetAdminUserPasswordDto) {
    return this.users.resetPassword(id, body);
  }
}
