import {
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';

export class GenerateTripDto {
  @IsOptional()
  @IsString()
  preferences?: string;
}

export class ChatDto {
  @IsString()
  @MinLength(1)
  message: string;
}

export class ImportTripDto {
  /** 攻略原文(粘贴文本或 URL 抓取结果,前端已让用户确认过内容) */
  @IsString()
  @MinLength(20)
  @MaxLength(20_000)
  content: string;
}

export class FetchUrlDto {
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  url: string;
}
