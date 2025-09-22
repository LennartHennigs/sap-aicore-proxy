#!/usr/bin/env node

/**
 * Unit tests for security headers (Helmet.js)
 * Tests CSP, HSTS, X-Frame-Options, and other security headers
 */

import express from 'express';
import request from 'supertest';
import helmet from 'helmet';

interface TestResult {
  success: boolean;
  error?: string;
  data?: any;
}

class SecurityHeadersTests {
  private app: express.Application;
  private appWithoutHelmet: express.Application;

  constructor() {
    this.setupTestApps();
  }

  private setupTestApps(): void {
    // App with Helmet security headers (matches production config)
    this.app = express();
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: ["'none'"]
        }
      },
      crossOriginEmbedderPolicy: false, // Disable for API compatibility
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
      }
    }));

    this.app.get('/test', (req, res) => {
      res.json({ success: true, message: 'Test endpoint with security headers' });
    });

    this.app.post('/test', (req, res) => {
      res.json({ success: true, message: 'POST endpoint with security headers' });
    });

    // App without Helmet for comparison
    this.appWithoutHelmet = express();
    this.appWithoutHelmet.get('/test', (req, res) => {
      res.json({ success: true, message: 'Test endpoint without security headers' });
    });
  }

  // Test 1: Content Security Policy (CSP) header present
  async testCSPHeaderPresent(): Promise<TestResult> {
    try {
      const response = await request(this.app)
        .get('/test')
        .expect(200);

      const cspHeader = response.headers['content-security-policy'];
      
      if (!cspHeader) {
        return {
          success: false,
          error: 'Content-Security-Policy header is missing'
        };
      }

      // Check that CSP contains expected directives
      const expectedDirectives = [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: https:",
        "object-src 'none'",
        "frame-src 'none'"
      ];

      const missingDirectives = expectedDirectives.filter(directive => 
        !cspHeader.includes(directive)
      );

      if (missingDirectives.length > 0) {
        return {
          success: false,
          error: `CSP missing expected directives: ${missingDirectives.join(', ')}`
        };
      }

      return { 
        success: true, 
        data: { csp: cspHeader } 
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  // Test 2: HTTP Strict Transport Security (HSTS) header
  async testHSTSHeader(): Promise<TestResult> {
    try {
      const response = await request(this.app)
        .get('/test')
        .expect(200);

      const hstsHeader = response.headers['strict-transport-security'];
      
      if (!hstsHeader) {
        return {
          success: false,
          error: 'Strict-Transport-Security header is missing'
        };
      }

      // Check HSTS configuration
      const expectedHSTS = [
        'max-age=31536000', // 1 year
        'includeSubDomains',
        'preload'
      ];

      const missingHSTSDirectives = expectedHSTS.filter(directive => 
        !hstsHeader.includes(directive)
      );

      if (missingHSTSDirectives.length > 0) {
        return {
          success: false,
          error: `HSTS missing expected directives: ${missingHSTSDirectives.join(', ')}`
        };
      }

      return { 
        success: true, 
        data: { hsts: hstsHeader } 
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  // Test 3: X-Frame-Options header (clickjacking protection)
  async testXFrameOptionsHeader(): Promise<TestResult> {
    try {
      const response = await request(this.app)
        .get('/test')
        .expect(200);

      const xFrameOptions = response.headers['x-frame-options'];
      
      if (!xFrameOptions) {
        return {
          success: false,
          error: 'X-Frame-Options header is missing'
        };
      }

      // Should be DENY or SAMEORIGIN
      if (xFrameOptions !== 'DENY' && xFrameOptions !== 'SAMEORIGIN') {
        return {
          success: false,
          error: `X-Frame-Options should be DENY or SAMEORIGIN, got: ${xFrameOptions}`
        };
      }

      return { 
        success: true, 
        data: { xFrameOptions } 
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  // Test 4: X-Content-Type-Options header (MIME sniffing protection)
  async testXContentTypeOptionsHeader(): Promise<TestResult> {
    try {
      const response = await request(this.app)
        .get('/test')
        .expect(200);

      const xContentTypeOptions = response.headers['x-content-type-options'];
      
      if (!xContentTypeOptions) {
        return {
          success: false,
          error: 'X-Content-Type-Options header is missing'
        };
      }

      if (xContentTypeOptions !== 'nosniff') {
        return {
          success: false,
          error: `X-Content-Type-Options should be 'nosniff', got: ${xContentTypeOptions}`
        };
      }

      return { 
        success: true, 
        data: { xContentTypeOptions } 
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  // Test 5: Referrer-Policy header
  async testReferrerPolicyHeader(): Promise<TestResult> {
    try {
      const response = await request(this.app)
        .get('/test')
        .expect(200);

      const referrerPolicy = response.headers['referrer-policy'];
      
      if (!referrerPolicy) {
        return {
          success: false,
          error: 'Referrer-Policy header is missing'
        };
      }

      // Common secure values
      const secureValues = [
        'no-referrer',
        'same-origin',
        'strict-origin',
        'strict-origin-when-cross-origin'
      ];

      if (!secureValues.includes(referrerPolicy)) {
        return {
          success: false,
          error: `Referrer-Policy should be a secure value, got: ${referrerPolicy}`
        };
      }

      return { 
        success: true, 
        data: { referrerPolicy } 
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  // Test 6: X-Powered-By header removal
  async testXPoweredByRemoval(): Promise<TestResult> {
    try {
      const response = await request(this.app)
        .get('/test')
        .expect(200);

      const xPoweredBy = response.headers['x-powered-by'];
      
      if (xPoweredBy) {
        return {
          success: false,
          error: `X-Powered-By header should be removed, found: ${xPoweredBy}`
        };
      }

      return { 
        success: true, 
        data: { message: 'X-Powered-By header successfully removed' } 
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  // Test 7: X-DNS-Prefetch-Control header
  async testXDnsPrefetchControlHeader(): Promise<TestResult> {
    try {
      const response = await request(this.app)
        .get('/test')
        .expect(200);

      const xDnsPrefetchControl = response.headers['x-dns-prefetch-control'];
      
      if (!xDnsPrefetchControl) {
        return {
          success: false,
          error: 'X-DNS-Prefetch-Control header is missing'
        };
      }

      if (xDnsPrefetchControl !== 'off') {
        return {
          success: false,
          error: `X-DNS-Prefetch-Control should be 'off', got: ${xDnsPrefetchControl}`
        };
      }

      return { 
        success: true, 
        data: { xDnsPrefetchControl } 
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  // Test 8: Security headers present on POST requests
  async testSecurityHeadersOnPOST(): Promise<TestResult> {
    try {
      const response = await request(this.app)
        .post('/test')
        .send({ test: 'data' })
        .expect(200);

      const securityHeaders = [
        'content-security-policy',
        'strict-transport-security',
        'x-frame-options',
        'x-content-type-options',
        'referrer-policy'
      ];

      const missingHeaders = securityHeaders.filter(header => 
        !response.headers[header]
      );

      if (missingHeaders.length > 0) {
        return {
          success: false,
          error: `POST request missing security headers: ${missingHeaders.join(', ')}`
        };
      }

      return { 
        success: true, 
        data: { 
          message: 'All security headers present on POST request',
          headersCount: securityHeaders.length
        } 
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  // Test 9: Comparison with app without security headers
  async testComparisonWithoutHelmet(): Promise<TestResult> {
    try {
      // Test app with Helmet
      const secureResponse = await request(this.app)
        .get('/test')
        .expect(200);

      // Test app without Helmet
      const insecureResponse = await request(this.appWithoutHelmet)
        .get('/test')
        .expect(200);

      const securityHeaders = [
        'content-security-policy',
        'strict-transport-security',
        'x-frame-options',
        'x-content-type-options'
      ];

      const secureHeadersCount = securityHeaders.filter(header => 
        secureResponse.headers[header]
      ).length;

      const insecureHeadersCount = securityHeaders.filter(header => 
        insecureResponse.headers[header]
      ).length;

      if (secureHeadersCount <= insecureHeadersCount) {
        return {
          success: false,
          error: `Helmet app should have more security headers. Secure: ${secureHeadersCount}, Insecure: ${insecureHeadersCount}`
        };
      }

      // The secure app should have significantly more headers
      if (secureHeadersCount < 3) {
        return {
          success: false,
          error: `Helmet app should have at least 3 security headers, got: ${secureHeadersCount}`
        };
      }

      return { 
        success: true, 
        data: { 
          secureHeadersCount,
          insecureHeadersCount,
          improvement: secureHeadersCount - insecureHeadersCount
        } 
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  // Test 10: CSP blocks inline scripts (security verification)
  async testCSPBlocksInlineScripts(): Promise<TestResult> {
    try {
      // Create a test app that serves HTML with inline script
      const testApp = express();
      testApp.use(helmet({
        contentSecurityPolicy: {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"] // No 'unsafe-inline', should block inline scripts
          }
        }
      }));

      testApp.get('/test-csp', (req, res) => {
        res.send(`
          <!DOCTYPE html>
          <html>
          <head><title>CSP Test</title></head>
          <body>
            <script>console.log('This should be blocked by CSP');</script>
            <p>Test page</p>
          </body>
          </html>
        `);
      });

      const response = await request(testApp)
        .get('/test-csp')
        .expect(200);

      const cspHeader = response.headers['content-security-policy'];

      // Verify CSP header exists and doesn't allow unsafe-inline for scripts
      if (!cspHeader) {
        return {
          success: false,
          error: 'CSP header missing'
        };
      }

      if (cspHeader.includes("script-src 'self' 'unsafe-inline'")) {
        return {
          success: false,
          error: 'CSP allows unsafe-inline scripts, which is insecure'
        };
      }

      // Check that script-src 'self' is present (without unsafe-inline)
      if (!cspHeader.includes("script-src 'self'") || 
          cspHeader.includes("script-src 'self' 'unsafe-inline'")) {
        return {
          success: false,
          error: 'CSP script-src configuration is incorrect'
        };
      }

      return { 
        success: true, 
        data: { 
          message: 'CSP correctly configured to block inline scripts',
          csp: cspHeader
        } 
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  async runAllTests(): Promise<void> {
    console.log('\n🔒 Running Security Headers Tests...\n');

    const tests = [
      { name: 'Content Security Policy (CSP) header present', test: () => this.testCSPHeaderPresent() },
      { name: 'HTTP Strict Transport Security (HSTS) header', test: () => this.testHSTSHeader() },
      { name: 'X-Frame-Options header (clickjacking protection)', test: () => this.testXFrameOptionsHeader() },
      { name: 'X-Content-Type-Options header (MIME sniffing protection)', test: () => this.testXContentTypeOptionsHeader() },
      { name: 'Referrer-Policy header', test: () => this.testReferrerPolicyHeader() },
      { name: 'X-Powered-By header removal', test: () => this.testXPoweredByRemoval() },
      { name: 'X-DNS-Prefetch-Control header', test: () => this.testXDnsPrefetchControlHeader() },
      { name: 'Security headers present on POST requests', test: () => this.testSecurityHeadersOnPOST() },
      { name: 'Comparison with app without security headers', test: () => this.testComparisonWithoutHelmet() },
      { name: 'CSP blocks inline scripts (security verification)', test: () => this.testCSPBlocksInlineScripts() }
    ];

    let passed = 0;
    let failed = 0;

    for (const { name, test } of tests) {
      try {
        const result = await test();
        const status = result.success ? '✅' : '❌';
        console.log(`${status} ${name}`);
        
        if (!result.success) {
          console.log(`   Error: ${result.error}`);
          failed++;
        } else {
          passed++;
          if (result.data) {
            console.log(`   Data: ${JSON.stringify(result.data, null, 2).slice(0, 200)}${JSON.stringify(result.data).length > 200 ? '...' : ''}`);
          }
        }
      } catch (error) {
        console.log(`❌ ${name}`);
        console.log(`   Unexpected error: ${error instanceof Error ? error.message : String(error)}`);
        failed++;
      }
    }

    console.log(`\n📊 Security Headers Test Results: ${passed} passed, ${failed} failed\n`);
  }
}

// Run tests if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const tests = new SecurityHeadersTests();
  tests.runAllTests().catch(console.error);
}

export { SecurityHeadersTests };