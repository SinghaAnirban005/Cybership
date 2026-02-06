import nock from 'nock';
import { UpsCarrier } from '../carriers/ups/ups-carrier';
import { HttpClient } from '../infrastructure/http-client';
import { Config } from '../config/config';
import {
  RateRequest,
  ErrorCode,
  CarrierIntegrationError,
} from '../domain/models';

describe('UpsCarrier Tests', () => {
  let carrier: UpsCarrier;
  let httpClient: HttpClient;
  let mockConfig: Config;

  const validRateRequest: RateRequest = {
    origin: {
      street1: '123 Main St',
      city: 'New York',
      state: 'NY',
      postalCode: '10001',
      countryCode: 'US',
      isResidential: false,
    },
    destination: {
      street1: '456 Market St',
      city: 'Los Angeles',
      state: 'CA',
      postalCode: '90001',
      countryCode: 'US',
      isResidential: true,
    },
    packages: [
      {
        weight: { value: 10, unit: 'LBS' },
        dimensions: { length: 12, width: 10, height: 8, unit: 'IN' },
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
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
        accountNumber: 'A1B2C3',
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
    carrier = new UpsCarrier(mockConfig, httpClient);

    // Stub OAuth for all tests
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

  it('should get single rate quote', async () => {
    const rateRequest: RateRequest = {
      ...validRateRequest,
      serviceLevel: 'GROUND',
    };

    nock('https://test.ups.com')
      .post('/api/rating/v1/Rate')
      .query({ additionalinfo: 'timeintransit' })
      .reply(200, {
        RateResponse: {
          Response: {
            ResponseStatus: {
              Code: '1',
              Description: 'Success',
            },
          },
          RatedShipment: {
            Service: {
              Code: '03',
              Description: 'Ground',
            },
            TotalCharges: {
              CurrencyCode: 'USD',
              MonetaryValue: '45.67',
            },
            TimeInTransit: {
              BusinessDaysInTransit: '5',
            },
          },
        },
      });

    const response = await carrier.getRates(rateRequest);

    expect(response.quotes).toHaveLength(1);
    expect(response.quotes[0]?.carrier).toBe('UPS');
    expect(response.quotes[0]?.serviceCode).toBe('03');
    expect(response.quotes[0]?.totalCharge.amount).toBe(45.67);
    expect(response.quotes[0]?.transitDays).toBe(5);
  });

  it('should get multiple rate quotes (Shop mode)', async () => {
    nock('https://test.ups.com')
      .post('/api/rating/v1/Rate')
      .query({ additionalinfo: 'timeintransit' })
      .reply(200, {
        RateResponse: {
          Response: {
            ResponseStatus: {
              Code: '1',
              Description: 'Success',
            },
          },
          RatedShipment: [
            {
              Service: {
                Code: '03',
                Description: 'Ground',
              },
              TotalCharges: {
                CurrencyCode: 'USD',
                MonetaryValue: '15.50',
              },
            },
            {
              Service: {
                Code: '02',
                Description: '2nd Day Air',
              },
              TotalCharges: {
                CurrencyCode: 'USD',
                MonetaryValue: '45.75',
              },
              GuaranteedDelivery: {
                BusinessDaysInTransit: '2',
              },
            },
          ],
        },
      });

    const response = await carrier.getRates(validRateRequest);

    expect(response.quotes).toHaveLength(2);
    expect(response.quotes[0]?.serviceCode).toBe('03');
    expect(response.quotes[1]?.serviceCode).toBe('02');
    expect(response.quotes[1]?.guaranteedDelivery).toBe(true);
  });

  it('should correctly build request payload', async () => {
    let capturedBody: any;

    nock('https://test.ups.com')
      .post('/api/rating/v1/Rate', (body) => {
        capturedBody = body;
        return true;
      })
      .query({ additionalinfo: 'timeintransit' })
      .reply(200, {
        RateResponse: {
          Response: {
            ResponseStatus: { Code: '1', Description: 'Success' },
          },
          RatedShipment: {
            Service: { Code: '03' },
            TotalCharges: {
              CurrencyCode: 'USD',
              MonetaryValue: '25.00',
            },
          },
        },
      });

    await carrier.getRates(validRateRequest);

    expect(capturedBody.RateRequest.Request.RequestOption).toBe('Shop');
    expect(capturedBody.RateRequest.Shipment.Shipper.ShipperNumber).toBe(
      'A1B2C3'
    );
    expect(capturedBody.RateRequest.Shipment.ShipTo.Address.ResidentialAddressIndicator).toBe(
      ''
    );
  });

  it('should handle validation errors', async () => {
    const invalidRequest = {
      ...validRateRequest,
      packages: [],
    };

    await expect(carrier.getRates(invalidRequest as any)).rejects.toThrow(
      CarrierIntegrationError
    );
  });

  it('should handle UPS API errors', async () => {
    nock('https://test.ups.com')
      .post('/api/rating/v1/Rate')
      .query({ additionalinfo: 'timeintransit' })
      .reply(200, {
        RateResponse: {
          Response: {
            ResponseStatus: {
              Code: '0',
              Description: 'Invalid postal code',
            },
          },
        },
      });

    await expect(carrier.getRates(validRateRequest)).rejects.toThrow(
      CarrierIntegrationError
    );
  });

  it('should handle HTTP 400 errors', async () => {
    nock('https://test.ups.com')
      .post('/api/rating/v1/Rate')
      .query({ additionalinfo: 'timeintransit' })
      .reply(400, {
        response: {
          errors: [
            {
              code: '9310301',
              message: 'Invalid origin address',
            },
          ],
        },
      });

    try {
      await carrier.getRates(validRateRequest);
      fail('Should have thrown error');
    } catch (error) {
      expect(error).toBeInstanceOf(CarrierIntegrationError);
      expect((error as CarrierIntegrationError).error.code).toBe(
        ErrorCode.API_ERROR
      );
    }
  });

  it('should handle HTTP 500 errors', async () => {
    nock('https://test.ups.com')
      .post('/api/rating/v1/Rate')
      .query({ additionalinfo: 'timeintransit' })
      .times(3)
      .reply(500, 'Internal Server Error');

    try {
      await carrier.getRates(validRateRequest);
      fail('Should have thrown error');
    } catch (error) {
      expect(error).toBeInstanceOf(CarrierIntegrationError);
      expect((error as CarrierIntegrationError).error.code).toBe(
        ErrorCode.SERVICE_UNAVAILABLE
      );
    }
  });

  it('should perform health check successfully', async () => {
    const healthy = await carrier.healthCheck();
    expect(healthy).toBe(true);
  });

  it('should detect unhealthy carrier', async () => {
    nock.cleanAll();
    nock('https://test.ups.com').post('/oauth/token').reply(401, 'Unauthorized');

    const healthy = await carrier.healthCheck();
    expect(healthy).toBe(false);
  });
});