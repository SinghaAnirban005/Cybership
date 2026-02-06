import nock from 'nock';
import { HttpClient } from '../infrastructure/http-client';
import { Config } from '../config/config';
import { ErrorCode, CarrierIntegrationError } from '../domain/models';

describe('HttpClient Tests', () => {
  let httpClient: HttpClient;
  let mockConfig: Config;
  const testUrl = 'https://test-api.com';

  beforeAll(() => {
    nock.disableNetConnect();
  });

  afterAll(() => {
    nock.enableNetConnect();
  });

  beforeEach(() => {
    mockConfig = {
      ups: {
        clientId: 'test-id',
        clientSecret: 'test-secret',
        accountNumber: 'TEST',
        baseUrl: testUrl,
        oauthUrl: `${testUrl}/oauth`,
      },
      http: {
        timeoutMs: 2000,
        maxRetries: 0,
      },
      app: {
        environment: 'development',
        logLevel: 'info',
      },
    };

    httpClient = new HttpClient(mockConfig);
  });

  afterEach(() => {
    nock.cleanAll();
  });

  it('should successfully make GET request', async () => {
    nock(testUrl)
      .get('/api/test')
      .reply(200, { success: true });

    const response = await httpClient.get(`${testUrl}/api/test`);

    expect(response.status).toBe(200);
    expect(response.data).toEqual({ success: true });
  });

  it('should successfully make POST request', async () => {
    nock(testUrl)
      .post('/api/test', { data: 'test' })
      .reply(200, { success: true });

    const response = await httpClient.post(`${testUrl}/api/test`, { data: 'test' });

    expect(response.status).toBe(200);
    expect(response.data).toEqual({ success: true });
  });

  it('should retry on 500 errors', async () => {
    // IMPORTANT: For this specific test, we need retries enabled
    // We create a local instance with retries on just for this case
    const retryConfig = { ...mockConfig, http: { ...mockConfig.http, maxRetries: 2 } };
    const retryClient = new HttpClient(retryConfig);
    
    let attemptCount = 0;

    nock(testUrl)
      .get('/api/test')
      .times(2)
      .reply(() => {
        attemptCount++;
        return [500, { error: 'Internal Server Error' }];
      });

    nock(testUrl)
      .get('/api/test')
      .reply(200, { success: true });

    const response = await retryClient.get(`${testUrl}/api/test`);

    expect(attemptCount).toBe(2);
    expect(response.data).toEqual({ success: true });
  });

  it('should not retry on 4xx errors', async () => {
    let attemptCount = 0;

    nock(testUrl)
      .post('/api/test')
      .reply(() => {
        attemptCount++;
        return [400, { error: 'Bad Request' }];
      })
      .persist();

    try {
      await httpClient.post(`${testUrl}/api/test`, {});
      fail('Should have thrown error');
    } catch (error) {
      expect(error).toBeInstanceOf(CarrierIntegrationError);
      expect((error as CarrierIntegrationError).error.retryable).toBe(false);
    }

    expect(attemptCount).toBe(1);
  });

  it('should transform rate limit errors correctly', async () => {
    nock(testUrl)
      .post('/api/test')
      .reply(429, {
        error: 'Too Many Requests',
      });

    try {
      await httpClient.post(`${testUrl}/api/test`, {});
      fail('Should have thrown rate limit error');
    } catch (error) {
      expect(error).toBeInstanceOf(CarrierIntegrationError);
      const carrierError = error as CarrierIntegrationError;
      expect(carrierError.error.code).toBe(ErrorCode.RATE_LIMIT_EXCEEDED);
      expect(carrierError.error.retryable).toBe(true);
    }
  });

  it('should transform auth errors correctly', async () => {
    nock(testUrl)
      .post('/api/test')
      .reply(401, { error: 'Unauthorized' });

    try {
      await httpClient.post(`${testUrl}/api/test`, {});
      fail('Should have thrown auth error');
    } catch (error) {
      expect(error).toBeInstanceOf(CarrierIntegrationError);
      const carrierError = error as CarrierIntegrationError;
      expect(carrierError.error.code).toBe(ErrorCode.AUTH_FAILED);
      expect(carrierError.error.retryable).toBe(false);
    }
  });

  it('should include custom headers', async () => {
    let capturedHeaders: any;

    nock(testUrl)
      .post('/api/test')
      .reply(function () {
        capturedHeaders = this.req.headers;
        return [200, { success: true }];
      });

    await httpClient.post(
      `${testUrl}/api/test`,
      {},
      {
        headers: {
          'X-Custom-Header': 'test-value',
          Authorization: 'Bearer token123',
        },
      }
    );

    expect(capturedHeaders['x-custom-header']).toBe('test-value');
    expect(capturedHeaders.authorization).toBe('Bearer token123');
  });
});