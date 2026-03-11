/**
 * @file token-introspect-response.dto.ts
 * @description Response DTO returned by the token introspection endpoint.
 *
 * Mirrors the claims embedded in a JWT and adds an `active` flag indicating
 * whether the token is currently valid (not expired, not revoked). This is an
 * outgoing payload — no validation decorators are needed; only Swagger
 * `@ApiProperty` decorators are applied for documentation.
 */

import { ApiProperty } from '@nestjs/swagger';

export class TokenIntrospectResponseDto {
  @ApiProperty({
    description: 'Whether the token is currently valid',
    example: true,
  })
  active!: boolean;

  @ApiProperty({
    description: 'Subject — the user ID the token was issued to',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  sub!: string;

  @ApiProperty({
    description: 'Email address of the token owner',
    example: 'user@example.com',
  })
  email!: string;

  @ApiProperty({
    description: 'Roles assigned to the user',
    example: ['USER'],
    type: [String],
  })
  roles!: string[];

  @ApiProperty({
    description: 'Expiration timestamp (Unix epoch seconds)',
    example: 1717027200,
  })
  exp!: number;

  @ApiProperty({
    description: 'Issued-at timestamp (Unix epoch seconds)',
    example: 1717026300,
  })
  iat!: number;

  @ApiProperty({
    description: 'Unique JWT identifier (JTI)',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  jti!: string;

  @ApiProperty({
    description: 'Type of token (e.g. "access" or "refresh")',
    example: 'access',
  })
  tokenType!: string;
}
