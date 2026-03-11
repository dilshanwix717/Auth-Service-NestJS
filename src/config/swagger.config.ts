/**
 * Swagger / OpenAPI Configuration
 *
 * Configures and mounts the Swagger UI for the Auth Service API.
 * The interactive documentation is served at /api-docs and includes
 * bearer-token and internal-API-key authentication schemes so that
 * developers can test protected endpoints directly from the browser.
 *
 * Call `setupSwagger(app)` from main.ts after creating the NestJS app.
 */

import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

/**
 * Builds the OpenAPI document and mounts Swagger UI on the given app.
 *
 * @param app - The NestJS application instance
 *
 * @example
 * // main.ts
 * const app = await NestFactory.create(AppModule);
 * setupSwagger(app);
 * await app.listen(3000);
 */
export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    /** API title shown in the Swagger UI header */
    .setTitle('Auth Service API')
    /** High-level description of what the API provides */
    .setDescription(
      'Authentication and authorisation service providing user registration, ' +
        'login, JWT token management, password reset, and session management.',
    )
    /** Semantic version of the API */
    .setVersion('1.0')
    /** Bearer token auth – used for user-facing endpoints */
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Enter your JWT access token',
      },
      'bearer', // security scheme name referenced by @ApiBearerAuth('bearer')
    )
    /** Internal API key header – used for service-to-service calls */
    .addApiKey(
      {
        type: 'apiKey',
        in: 'header',
        name: 'x-internal-api-key',
        description: 'Internal API key for service-to-service authentication',
      },
      'internal-api-key', // security scheme name referenced by @ApiSecurity('internal-api-key')
    )
    .build();

  /** Create the OpenAPI document from the app's registered controllers */
  const document = SwaggerModule.createDocument(app, config);

  /** Mount Swagger UI at /api-docs */
  SwaggerModule.setup('api-docs', app, document, {
    /** Swagger UI options */
    swaggerOptions: {
      /** Keep auth credentials across page reloads */
      persistAuthorization: true,
    },
  });
}
