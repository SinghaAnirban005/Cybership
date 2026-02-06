import { Carrier } from '../../domain/carrier.interface';
import {
  RateRequest,
  RateResponse,
  RateRequestSchema,
  ErrorCode,
  CarrierIntegrationError,
} from '../../domain/models';
import { Config } from '../../config/config';
import { HttpClient } from '../../infrastructure/http-client';
import { UpsAuthManager } from './ups-auth';
import {
  mapRateRequestToUps,
  mapUpsResponseToRates,
  parseUpsError,
} from './ups-mapper';
import { UpsRateResponseSchema } from './ups-types';

/**
 * Handles rate shopping through the UPS Rating API
 */
export class UpsCarrier implements Carrier {
  readonly name = 'ups';
  private readonly authManager: UpsAuthManager;
  private readonly ratingEndpoint: string;

  constructor(
    private readonly config: Config,
    private readonly httpClient: HttpClient
  ) {
    this.authManager = new UpsAuthManager(config, httpClient);
    this.ratingEndpoint = `${config.ups.baseUrl}/api/rating/v1/Rate`;
  }

  /**
   * Get shipping rate quotes from UPS
   */
  async getRates(request: RateRequest): Promise<RateResponse> {
    try {
      RateRequestSchema.parse(request);
    } catch (error) {
      throw CarrierIntegrationError.fromZodError(error as any);
    }

    try {
      const accessToken = await this.authManager.getAccessToken();

      const upsRequest = mapRateRequestToUps(
        request,
        this.config.ups.accountNumber
      );

      const response = await this.httpClient.post(
        this.ratingEndpoint,
        { RateRequest: upsRequest },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          params: {
            additionalinfo: 'timeintransit',
          },
        }
      );

      let parsedResponse;
      try {
        parsedResponse = UpsRateResponseSchema.parse((response.data as any).RateResponse);
      } catch (parseError) {
        throw new CarrierIntegrationError({
          code: ErrorCode.API_ERROR,
          message: 'Invalid response format from UPS',
          details: { response: response.data },
          retryable: false,
          timestamp: new Date().toISOString(),
        });
      }

      if (parsedResponse.Response.ResponseStatus.Code !== '1') {
        throw new CarrierIntegrationError({
          code: ErrorCode.CARRIER_ERROR,
          message:
            parsedResponse.Response.ResponseStatus.Description ||
            'UPS returned an error',
          retryable: false,
          timestamp: new Date().toISOString(),
        });
      }

      return mapUpsResponseToRates(parsedResponse);
    } catch (error) {
      if (error instanceof CarrierIntegrationError) {
        throw error;
      }

      if (
        typeof error === 'object' &&
        error !== null &&
        'response' in error
      ) {
        throw parseUpsError((error as any).response?.data);
      }

      throw new CarrierIntegrationError(
        {
          code: ErrorCode.UNKNOWN_ERROR,
          message: 'Unexpected error during rate request',
          retryable: false,
          timestamp: new Date().toISOString(),
        },
        error as Error
      );
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.authManager.getAccessToken();
      return true;
    } catch {
      return false;
    }
  }
}