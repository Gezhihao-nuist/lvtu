import { IsOptional, IsString, MinLength } from 'class-validator';

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
