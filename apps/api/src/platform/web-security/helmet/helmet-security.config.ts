import { HelmetOptions } from 'helmet';

/**
 * Production-ready Helmet configuration aligned with OWASP Secure Headers recommendations.
 */
export const helmetSecurityOptions: HelmetOptions = {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"], // Enabled for Swagger UI & API docs
      styleSrc: ["'self'", "'unsafe-inline'"], // Enabled for Swagger UI styling
      imgSrc: ["'self'", 'data:', 'blob:'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false, // Compatibility for cross-origin assets & Swagger UI
  crossOriginOpenerPolicy: { policy: 'same-origin' },
  crossOriginResourcePolicy: { policy: 'same-site' },
  dnsPrefetchControl: { allow: false },
  frameguard: { action: 'deny' }, // X-Frame-Options: DENY
  hidePoweredBy: true, // Removes X-Powered-By header
  hsts: {
    maxAge: 31536000, // 1 Year in seconds
    includeSubDomains: true,
    preload: true,
  },
  ieNoOpen: true,
  noSniff: true, // X-Content-Type-Options: nosniff
  originAgentCluster: true,
  permittedCrossDomainPolicies: { permittedPolicies: 'none' },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  xssFilter: true,
};
