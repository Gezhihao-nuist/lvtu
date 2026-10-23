import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  /** 校验前先 trim + 小写,避免大小写/空格导致重复账号 */
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  email: string;

  /** 至少 8 位且同时包含字母和数字(弱口令直接 400) */
  @IsString()
  @MinLength(8)
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/, {
    message: '密码需至少 8 位且同时包含字母和数字',
  })
  password: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  nickname: string;
}
