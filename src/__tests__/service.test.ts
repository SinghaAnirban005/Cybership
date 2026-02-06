import nock from 'nock';
import { CarrierIntegrationService, createService } from '../index';
import { Config } from '../config/config';
import { RateRequest } from '../domain/models';

describe('CarrierIntegrationService Tests', () => {
  let service: CarrierIntegrationService;
  let mockConfig: Config;

  const validRateRequest: RateRequest = {
    origin: {
      street1: '100 Market St',
      city: 'San Francisco',
      state: 'CA',
      postalCode: '94105',
      countryCode: 'US',
      isResidential: false,
    },
    destination: {
      street1: '410 Terry Ave N',
      city: 'Seattle',
      state: 'WA',
      postalCode: '98109',
      countryCode: 'US',
      isResidential: false,
    },
    packages: [
      {
        weight: { value: 5, unit: 'LBS' },
        dimensions: { length: 10, width: 8, height: 6, unit: 'IN' },
      },
    ],
  };

  beforeAll(() => {
    nock.disableNetConnect();
  });

  afterAll(() => {
    nock.enableNetConnect();
  });

  beforeEach(() => {
    mockConfig = {
      ups: {
        clientId: 'test-client',
        clientSecret: 'test-secret',
        accountNumber: 'TEST456',
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

    service = createService(mockConfig);

    // Default OAuth stub
    nock('https://test.ups.com')
      .persist()
      .post('/oauth/token')
      .reply(200, {
        access_token: 'test-token',
        token_type: 'Bearer',
        expires_in: 3600,
      });
  });

  afterEach(() => {
    nock.cleanAll();
  });

  it('should get rates from UPS', async () => {
    nock('https://test.ups.com')
      .post('/api/rating/v1/Rate')
      .query({ additionalinfo: 'timeintransit' })
      .reply(200, {
        RateResponse: {
          Response: {
            ResponseStatus: { Code: '1', Description: 'Success' },
          },
          RatedShipment: {
            Service: { Code: '03', Description: 'Ground' },
            TotalCharges: { CurrencyCode: 'USD', MonetaryValue: '18.50' },
          },
        },
      });

    const response = await service.getRates('ups', validRateRequest);

    expect(response.quotes).toHaveLength(1);
    expect(response.quotes[0]?.carrier).toBe('UPS');
    expect(response.quotes[0]?.totalCharge.amount).toBe(18.50);
  });

  it('should throw error for unsupported carrier', async () => {
    await expect(
      service.getRates('nonexistent-carrier', validRateRequest)
    ).rejects.toThrow('Unsupported carrier');
  });

  it('should shop rates and handle failures gracefully', async () => {
    nock('https://test.ups.com')
      .post('/api/rating/v1/Rate')
      .query({ additionalinfo: 'timeintransit' })
      .reply(500, 'Internal Server Error');

    const results = await service.shopRates(['ups'], validRateRequest);

    expect(results.size).toBe(1);
    const upsResult = results.get('ups');
    expect(upsResult).toBeInstanceOf(Error);
  });

  it('should check carrier health successfully', async () => {
    const healthy = await service.checkCarrierHealth('ups');
    expect(healthy).toBe(true);
  });

  it('should detect unhealthy carrier', async () => {
    nock.cleanAll();
    nock('https://test.ups.com').post('/oauth/token').reply(401, 'Unauthorized');

    const healthy = await service.checkCarrierHealth('ups');
    expect(healthy).toBe(false);
  });

  it('should list supported carriers', () => {
    const carriers = service.getSupportedCarriers();
    expect(carriers).toContain('ups');
    expect(Array.isArray(carriers)).toBe(true);
  });
});