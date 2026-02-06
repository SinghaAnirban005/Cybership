import { Carrier, CarrierFactory } from '../domain/carrier.interface';
import { Config } from '../config/config';
import { HttpClient } from '../infrastructure/http-client';
import { UpsCarrier } from './ups/ups-carrier';

/**
 * Factory for creating carrier instances
 */
export class DefaultCarrierFactory implements CarrierFactory {
  private readonly carriers: Map<string, () => Carrier>;

  constructor(
    private readonly config: Config,
    private readonly httpClient: HttpClient
  ) {
    this.carriers = new Map();
    this.registerCarriers();
  }

  /**
   * New carriers should be added here
   */
  private registerCarriers(): void {
    this.carriers.set('ups', () => new UpsCarrier(this.config, this.httpClient));

    // Future carriers would be registered here:
    // this.carriers.set('fedex', () => new FedexCarrier(this.config, this.httpClient));
    // this.carriers.set('usps', () => new UspsCarrier(this.config, this.httpClient));
    // this.carriers.set('dhl', () => new DhlCarrier(this.config, this.httpClient));
  }

  /**
   * Create a carrier instance by name
   */
  createCarrier(carrierName: string): Carrier {
    const normalizedName = carrierName.toLowerCase();
    const factory = this.carriers.get(normalizedName);

    if (!factory) {
      throw new Error(
        `Unsupported carrier: ${carrierName}. Supported carriers: ${this.getSupportedCarriers().join(', ')}`
      );
    }

    return factory();
  }

  /**
   * Get list of all supported carrier names
   */
  getSupportedCarriers(): string[] {
    return Array.from(this.carriers.keys());
  }
}