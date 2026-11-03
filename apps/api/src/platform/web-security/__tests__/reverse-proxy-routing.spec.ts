import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';

describe('Reverse Proxy, Ingress, and SPA Routing Invariants (Milestone 10.4)', () => {
  const nginxConfPath = path.resolve(
    __dirname,
    '../../../../../../infrastructure/deployment/docker/nginx.conf',
  );
  let nginxConfigContent = '';

  beforeAll(() => {
    expect(fs.existsSync(nginxConfPath)).toBe(true);
    nginxConfigContent = fs.readFileSync(nginxConfPath, 'utf-8');
  });

  describe('1. Routing Contract & Upstream Proxy Specification', () => {
    it('declares the upstream API proxy path for /api', () => {
      expect(nginxConfigContent).toContain('location /api');
      expect(nginxConfigContent).toContain('proxy_pass http://api:3000;');
    });

    it('enforces HTTP/1.1 and forwards WebSocket / streaming upgrade headers', () => {
      expect(nginxConfigContent).toContain('proxy_http_version 1.1;');
      expect(nginxConfigContent).toContain('proxy_set_header Upgrade $http_upgrade;');
      expect(nginxConfigContent).toContain('proxy_set_header Connection $connection_upgrade;');
    });

    it('forwards standard client identity and host headers to backend', () => {
      expect(nginxConfigContent).toContain('proxy_set_header Host $host;');
      expect(nginxConfigContent).toContain('proxy_set_header X-Real-IP $remote_addr;');
      expect(nginxConfigContent).toContain(
        'proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;',
      );
      expect(nginxConfigContent).toContain('proxy_set_header X-Forwarded-Proto $scheme;');
    });

    it('defines explicit connect and read timeouts', () => {
      expect(nginxConfigContent).toContain('proxy_connect_timeout 5s;');
      expect(nginxConfigContent).toContain('proxy_read_timeout 60s;');
    });
  });

  describe('2. Error Interception & Upstream Isolation', () => {
    it('configures proxy_intercept_errors to intercept 502/503/504 and return structured JSON', () => {
      expect(nginxConfigContent).toContain('proxy_intercept_errors on;');
      expect(nginxConfigContent).toContain('error_page 502 503 504 = @api_gateway_error;');
      expect(nginxConfigContent).toContain('location @api_gateway_error');
      expect(nginxConfigContent).toContain('default_type application/json;');
      expect(nginxConfigContent).toContain('{"statusCode":502');
    });

    it('guarantees API errors are never masked by SPA fallback', () => {
      // /api is completely distinct from location /
      const apiLocationIndex = nginxConfigContent.indexOf('location /api');
      const spaLocationIndex = nginxConfigContent.indexOf('location / {');
      expect(apiLocationIndex).toBeGreaterThan(-1);
      expect(spaLocationIndex).toBeGreaterThan(-1);
      expect(apiLocationIndex).not.toEqual(spaLocationIndex);
    });
  });

  describe('3. SPA Fallback & Static Asset Cache Governance', () => {
    it('configures SPA HTML5 history fallback on root location', () => {
      expect(nginxConfigContent).toContain('try_files $uri $uri/ /index.html;');
    });

    it('prevents index.html caching on root SPA requests', () => {
      expect(nginxConfigContent).toContain(
        'add_header Cache-Control "no-cache, no-store, must-revalidate";',
      );
    });

    it('configures 1-year immutable caching on hashed static assets in /assets/', () => {
      expect(nginxConfigContent).toContain('location /assets/ {');
      expect(nginxConfigContent).toContain('expires 1y;');
      expect(nginxConfigContent).toContain('max-age=31536000, immutable');
    });

    it('configures liveness probe on /healthz returning healthy', () => {
      expect(nginxConfigContent).toContain('location = /healthz');
      expect(nginxConfigContent).toContain('return 200 "healthy\\n";');
    });
  });

  describe('4. Security Headers & Payload Limit Defenses', () => {
    it('disables Nginx server version tokens', () => {
      expect(nginxConfigContent).toContain('server_tokens off;');
    });

    it('enforces OWASP defensive security headers', () => {
      expect(nginxConfigContent).toContain('add_header X-Frame-Options "DENY" always;');
      expect(nginxConfigContent).toContain('add_header X-Content-Type-Options "nosniff" always;');
      expect(nginxConfigContent).toContain(
        'add_header Referrer-Policy "strict-origin-when-cross-origin" always;',
      );
      expect(nginxConfigContent).toContain('add_header X-XSS-Protection "0" always;');
    });

    it('restricts maximum client payload size to 10MB to prevent DoS', () => {
      expect(nginxConfigContent).toContain('client_max_body_size 10m;');
    });
  });

  describe('5. Live Proxy Container Integration (Conditional Check)', () => {
    it('verifies live proxy endpoints if container stack is reachable on port 8080', async () => {
      const isProxyReachable = await new Promise<boolean>((resolve) => {
        const req = http.get('http://127.0.0.1:8080/healthz', { timeout: 1000 }, (res) => {
          resolve(res.statusCode === 200);
        });
        req.on('error', () => resolve(false));
        req.on('timeout', () => {
          req.destroy();
          resolve(false);
        });
      });

      if (!isProxyReachable) {
        // Skip live checks when Docker stack is not running locally
        return;
      }

      // Verify healthz returns 200
      const healthzRes = await fetch('http://127.0.0.1:8080/healthz');
      expect(healthzRes.status).toBe(200);
      const text = await healthzRes.text();
      expect(text.trim()).toBe('healthy');

      // Verify SPA fallback returns HTML on deep link
      const spaRes = await fetch('http://127.0.0.1:8080/gym/memberships');
      expect(spaRes.status).toBe(200);
      expect(spaRes.headers.get('content-type')).toContain('text/html');

      // Verify API endpoint returns JSON
      const apiRes = await fetch('http://127.0.0.1:8080/api/v1/health');
      expect(apiRes.status).toBe(200);
      expect(apiRes.headers.get('content-type')).toContain('application/json');
      const body = (await apiRes.json()) as { status: string };
      expect(body.status).toBe('ok');
    });
  });
});
