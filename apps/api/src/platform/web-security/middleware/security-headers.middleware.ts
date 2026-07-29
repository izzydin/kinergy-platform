import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

/**
 * NestJS Middleware applying additional OWASP-recommended security headers
 * complement to Helmet.
 */
@Injectable()
export class SecurityHeadersMiddleware implements NestMiddleware {
  use(_req: Request, res: Response, next: NextFunction): void {
    // Restrict browser features & APIs
    res.setHeader(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=(), payment=(), usb=(), display-capture=()',
    );

    // Prevent Flash / Adobe cross-domain requests
    res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');

    // Prevent IE from executing downloads in site's context
    res.setHeader('X-Download-Options', 'noopen');

    next();
  }
}
