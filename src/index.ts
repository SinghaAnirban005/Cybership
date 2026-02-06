import { RateRequest, RateResponse } from './domain/models';
import { Config, getConfig } from './config/config';
import { HttpClient } from './infrastructure/http-client';
import { DefaultCarrierFactory } from './carriers/carrier-factory';

/**
 * Main service class providing high level API for carrier operations
 */
export class CarrierIntegrationService {
  private readonly carrierFactory: DefaultCarrierFactory;

  constructor(
    private readonly config: Config,
    private readonly httpClient: HttpClient
  ) {
    this.carrierFactory = new DefaultCarrierFactory(config, httpClient);
  }

  /**
   * Get rate quotes from a specific carrier
   */
  async getRates(
    carrierName: string,
    request: RateRequest
  ): Promise<RateResponse> {
    const carrier = this.carrierFactory.createCarrier(carrierName);
    return carrier.getRates(request);
  }

  /**
   * Shop rates across multiple carriers
   */
  async shopRates(
    carrierNames: string[],
    request: RateRequest
  ): Promise<Map<string, RateResponse | Error>> {
    const results = new Map<string, RateResponse | Error>();

    await Promise.all(
      carrierNames.map(async (carrierName) => {
        try {
          const response = await this.getRates(carrierName, request);
          results.set(carrierName, response);
        } catch (error) {
          results.set(carrierName, error as Error);
        }
      })
    );

    return results;
  }

  /**
   * Check health of a specific carrier
   */
  async checkCarrierHealth(carrierName: string): Promise<boolean> {
    const carrier = this.carrierFactory.createCarrier(carrierName);
    return carrier.healthCheck();
  }

  /**
   * Get list of supported carriers
   */
  getSupportedCarriers(): string[] {
    return this.carrierFactory.getSupportedCarriers();
  }
}

/**
 * Create a service instance with default configuration
 */
export function createService(config?: Config): CarrierIntegrationService {
  const serviceConfig = config || getConfig();
  const httpClient = new HttpClient(serviceConfig);
  return new CarrierIntegrationService(serviceConfig, httpClient);
}

export * from './domain/models';
export * from './domain/carrier.interface';
export type { Config } from './config/config';