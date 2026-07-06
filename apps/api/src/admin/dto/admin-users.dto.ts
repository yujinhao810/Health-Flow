import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class ListAdminUsersDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;
}

export class UpdateAdminUserDto {
  @IsOptional()
  @IsString()
  @IsIn(['user', 'admin'])
  role?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  disabled?: boolean;
}

export class ResetAdminUserPasswordDto {
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;
}
