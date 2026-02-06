import { HttpClient } from '../../infrastructure/http-client';
import { Config } from '../../config/config';
import { ErrorCode, CarrierIntegrationError } from '../../domain/models';
import { z } from 'zod';

/**
 * OAuth token response schema
 */
const TokenResponseSchema = z.object({
  access_token: z.string(),
  token_type: z.string(),
  expires_in: z.number(),
  issued_at: z.number().optional(),
});

type TokenResponse = z.infer<typeof TokenResponseSchema>;

interface CachedToken {
  accessToken: string;
  expiresAt: Date;
}

/**
 * Manages UPS OAuth 2.0 authentication with token caching and automatic refresh
 */
export class UpsAuthManager {
  private cachedToken: CachedToken | null = null;
  private readonly tokenBuffer = 300000; // Refresh 5 minutes before expiry

  constructor(
    private readonly config: Config,
    private readonly httpClient: HttpClient
  ) {}

  async getAccessToken(): Promise<string> {
    if (this.cachedToken && this.isTokenValid(this.cachedToken)) {
      return this.cachedToken.accessToken;
    }

    return this.acquireToken();
  }

  private isTokenValid(token: CachedToken): boolean {
    const now = new Date();
    const expiresWithBuffer = new Date(
      token.expiresAt.getTime() - this.tokenBuffer
    );
    return now < expiresWithBuffer;
  }

  private async acquireToken(): Promise<string> {
    try {
      const credentials = Buffer.from(
        `${this.config.ups.clientId}:${this.config.ups.clientSecret}`
      ).toString('base64');

      const response = await this.httpClient.post<TokenResponse>(
        this.config.ups.oauthUrl,
        'grant_type=client_credentials',
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: `Basic ${credentials}`,
          },
        }
      );

      const tokenData = TokenResponseSchema.parse(response.data);

      this.cachedToken = {
        accessToken: tokenData.access_token,
        expiresAt: new Date(Date.now() + tokenData.expires_in * 1000),
      };

      return this.cachedToken.accessToken;
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new CarrierIntegrationError({
          code: ErrorCode.API_ERROR,
          message: 'Invalid token response from UPS',
          details: { errors: error },
          retryable: false,
          timestamp: new Date().toISOString(),
        });
      }

      if (error instanceof CarrierIntegrationError) {
        throw error;
      }

      throw new CarrierIntegrationError(
        {
          code: ErrorCode.AUTH_FAILED,
          message: 'Failed to acquire OAuth token',
          retryable: false,
          timestamp: new Date().toISOString(),
        },
        error as Error
      );
    }
  }

  clearToken(): void {
    this.cachedToken = null;
  }

  hasValidToken(): boolean {
    return this.cachedToken !== null && this.isTokenValid(this.cachedToken);
  }
}