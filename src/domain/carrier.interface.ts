import { RateRequest, RateResponse } from './models';

/**
 * Carrier interface defining the contract for all shipping carrier integrations.
 */
export interface Carrier {
  /**
   * Unique identifier for carrier
   */
  readonly name: string;

  /**
   * Get shipping rate quotes for a shipment
   * @param request - Normalized rate request with origin, destination, and package details
   * @returns Normalized rate quotes from the carrier
   * @throws CarrierIntegrationError for any errors during the rate request
   */
  getRates(request: RateRequest): Promise<RateResponse>;

  /**
   * Health check to verify carrier connectivity and credentials
   * @returns true if the carrier is reachable and credentials are valid
   */
  healthCheck(): Promise<boolean>;
}

/**
 * Factory interface for creating carrier instances.
 */
export interface CarrierFactory {
  /**
   * Create a carrier instance by name
   * @param carrierName - Name of the carrier to create
   * @returns Carrier instance
   * @throws Error if carrier is not supported
   */
  createCarrier(carrierName: string): Carrier;

  /**
   * Get all supported carrier names
   * @returns Array of supported carrier names
   */
  getSupportedCarriers(): string[];
}