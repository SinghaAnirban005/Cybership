import axios, {
  AxiosInstance,
  AxiosRequestConfig,
  AxiosResponse,
  AxiosError,
} from 'axios';
import { Config } from '../config/config';
import { ErrorCode, CarrierIntegrationError } from '../domain/models';

export class HttpClient {
  private readonly client: AxiosInstance;
  private readonly maxRetries: number;

  constructor(config: Config) {
    this.maxRetries = config.http.maxRetries;

    this.client = axios.create({
      timeout: config.http.timeoutMs,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.client.interceptors.response.use(
      (response) => response,
      (error) => this.handleAxiosError(error)
    );
  }

  /**
   * GET request with retry logic
   */
  async get<T>(
    url: string,
    config?: AxiosRequestConfig
  ): Promise<AxiosResponse<T>> {
    return this.executeWithRetry(() => this.client.get<T>(url, config));
  }

  /**
   * POST request with retry logic
   */
  async post<T>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig
  ): Promise<AxiosResponse<T>> {
    return this.executeWithRetry(() =>
      this.client.post<T>(url, data, config)
    );
  }

  /**
   * request with backoff retry
   */
  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    attempt = 0
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof CarrierIntegrationError) {
        if (error.error.retryable && attempt < this.maxRetries) {
          const delay = this.calculateBackoffDelay(attempt);
          await this.sleep(delay);
          return this.executeWithRetry(operation, attempt + 1);
        }
      }
      throw error;
    }
  }

  private calculateBackoffDelay(attempt: number): number {
    const baseDelay = 1000;
    const maxDelay = 10000;
    const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
    return delay + Math.random() * 1000;
  }


  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Transform Axios errors into CarrierIntegrationErrors
   */
  private handleAxiosError(error: AxiosError): never {
    // Network/timeout errors
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      throw new CarrierIntegrationError(
        {
          code: ErrorCode.TIMEOUT,
          message: 'Request timed out',
          retryable: true,
          timestamp: new Date().toISOString(),
        },
        error
      );
    }

    if (!error.response) {
      throw new CarrierIntegrationError(
        {
          code: ErrorCode.NETWORK_ERROR,
          message: 'Network error occurred',
          details: { originalError: error.message },
          retryable: true,
          timestamp: new Date().toISOString(),
        },
        error
      );
    }

    const status = error.response.status;
    const responseData = error.response.data;

    // Rate limiting
    if (status === 429) {
      throw new CarrierIntegrationError(
        {
          code: ErrorCode.RATE_LIMIT_EXCEEDED,
          message: 'API rate limit exceeded',
          retryable: true,
          timestamp: new Date().toISOString(),
        },
        error
      );
    }

    // Authentication errors
    if (status === 401) {
      throw new CarrierIntegrationError(
        {
          code: ErrorCode.AUTH_FAILED,
          message: 'Authentication failed',
          retryable: false,
          timestamp: new Date().toISOString(),
        },
        error
      );
    }

    if (status === 403) {
      throw new CarrierIntegrationError(
        {
          code: ErrorCode.AUTH_INVALID_CREDENTIALS,
          message: 'Invalid credentials or insufficient permissions',
          retryable: false,
          timestamp: new Date().toISOString(),
        },
        error
      );
    }

    // Server errors (5xx) are retryable
    if (status >= 500) {
      throw new CarrierIntegrationError(
        {
          code: ErrorCode.SERVICE_UNAVAILABLE,
          message: 'Carrier service temporarily unavailable',
          details: { status, data: responseData },
          retryable: true,
          timestamp: new Date().toISOString(),
        },
        error
      );
    }

    // Client errors (4xx) are not retryable
    if (status >= 400 && status < 500) {
      throw new CarrierIntegrationError(
        {
          code: ErrorCode.API_ERROR,
          message: 'Invalid request to carrier API',
          details: { status, data: responseData },
          retryable: false,
          timestamp: new Date().toISOString(),
        },
        error
      );
    }

    // Unknown error
    throw new CarrierIntegrationError(
      {
        code: ErrorCode.UNKNOWN_ERROR,
        message: 'An unexpected error occurred',
        details: { status, data: responseData },
        retryable: false,
        timestamp: new Date().toISOString(),
      },
      error
    );
  }
}