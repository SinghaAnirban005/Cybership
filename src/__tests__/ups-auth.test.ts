import nock from 'nock';
import { UpsAuthManager } from '../carriers/ups/ups-auth';
import { HttpClient } from '../infrastructure/http-client';
import { Config } from '../config/config';
import { CarrierIntegrationError } from '../domain/models';

describe('UpsAuthManager Tests', () => {
  let authManager: UpsAuthManager;
  let httpClient: HttpClient;
  let mockConfig: Config;

  beforeAll(() => {
    nock.disableNetConnect();
  });

  afterAll(() => {
    nock.enableNetConnect();
  });

  beforeEach(() => {
    mockConfig = {
      ups: {
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
        accountNumber: 'TEST123',
        baseUrl: 'https://test.ups.com',
        oauthUrl: 'https://test.ups.com/oauth/token',
      },
      http: {
        timeoutMs: 5000,
        maxRetries: 2,
      },
      app: {
        environment: 'development',
        logLevel: 'info',
      },
    };

    httpClient = new HttpClient(mockConfig);
    authManager = new UpsAuthManager(mockConfig, httpClient);
  });

  afterEach(() => {
    nock.cleanAll();
    authManager.clearToken();
  });

  it('should successfully acquire OAuth token', async () => {
    nock('https://test.ups.com')
      .post('/oauth/token', 'grant_type=client_credentials')
      .reply(200, {
        access_token: 'test-access-token-123',
        token_type: 'Bearer',
        expires_in: 3600,
      });

    const token = await authManager.getAccessToken();

    expect(token).toBe('test-access-token-123');
    expect(authManager.hasValidToken()).toBe(true);
  });

  it('should reuse cached valid token', async () => {
    nock('https://test.ups.com')
      .post('/oauth/token')
      .once()
      .reply(200, {
        access_token: 'cached-token',
        token_type: 'Bearer',
        expires_in: 3600,
      });

    const token1 = await authManager.getAccessToken();
    const token2 = await authManager.getAccessToken();

    expect(token1).toBe(token2);
    expect(token1).toBe('cached-token');
  });

  it('should handle authentication failure', async () => {
    nock('https://test.ups.com')
      .post('/oauth/token')
      .reply(401, {
        error: 'invalid_client',
      });

    await expect(authManager.getAccessToken()).rejects.toThrow(
      CarrierIntegrationError
    );
  });

  it('should acquire new token after clearing cache', async () => {
    nock('https://test.ups.com')
      .post('/oauth/token')
      .reply(200, {
        access_token: 'token-1',
        token_type: 'Bearer',
        expires_in: 3600,
      });

    await authManager.getAccessToken();
    authManager.clearToken();

    nock('https://test.ups.com')
      .post('/oauth/token')
      .reply(200, {
        access_token: 'token-2',
        token_type: 'Bearer',
        expires_in: 3600,
      });

    const newToken = await authManager.getAccessToken();
    expect(newToken).toBe('token-2');
  });
});