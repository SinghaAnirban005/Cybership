# Getting Started

- Install dependencies
```
pnpm install
```

- Copy env variable
```
cp .env.example .env
```

- Run Tests
```
pnpm test
```

# Design Decisions

## Architecture

1. Domain Driven Design

We separate the domain models from carrier specific implementations.

Rationale:
- Carrier Independence: Business logic doesn't depend on UPS, FedEx, or any specific carrier's API structure
- Adding new carriers doesn't require changing existing code


2. Layered Architecture

We organize code into distinct layers with clear dependencies.

Rationale:
- Each layer has a single, well-defined responsibility
- Inner layers (domain) don't depend on outer layers (infrastructure)
- Can test each layer independently with mocks


3. Factory Pattern for carrier creation

We use a factory to instantiate carriers instead of direct construction.

Rationale:
- Single place to register all supported carriers
- Factory manages carrier dependencies (config, HTTP client)


4. Type Safety with TypeScript + Zod

We use TypeScript for compile time safety and Zod for runtime validation.


5. OAuth Token Management

We implement intelligent token caching with automatic refresh.

```
export class UpsAuthManager {
  private cachedToken: CachedToken | null = null;
  private readonly tokenBuffer = 300000;
  
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
}
```


6. HTTP Client with Retry Logic

We implement automatic retry with exponential backoff for transient failures.

```
export class HttpClient {
  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    attempt = 0
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error.error.retryable && attempt < this.maxRetries) {
        const delay = this.calculateBackoffDelay(attempt);
        await this.sleep(delay);
        return this.executeWithRetry(operation, attempt + 1);
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
}
```


7. Structured Error Handling

We created a custom CarrierIntegrationError class with typed error codes.

Rationale:
- Callers can check error codes instead of parsing strings

8. Mapper Pattern for Request/Response Translation

We use mapper functions for transforming between domain and carrier types.

```
export function mapRateRequestToUps(
  request: RateRequest,
  accountNumber: string
): UpsRateRequest {
  return {
    Request: {
      RequestOption: request.serviceLevel ? 'Rate' : 'Shop',
    },
    Shipment: {
      Shipper: {
        ShipperNumber: accountNumber,
        Address: mapAddressToUps(request.origin),
      },
      ShipTo: {
        Address: mapAddressToUps(request.destination),
      },
      Package: request.packages.map(mapPackageToUps),
    },
  };
}

export function mapUpsResponseToRates(
  upsResponse: UpsRateResponse
): RateResponse {
  const ratedShipments = Array.isArray(upsResponse.RatedShipment)
    ? upsResponse.RatedShipment
    : [upsResponse.RatedShipment];
    
  return {
    quotes: ratedShipments.map(shipment => ({
      carrier: 'UPS',
      serviceCode: shipment.Service.Code,
      totalCharge: {
        amount: parseFloat(shipment.TotalCharges.MonetaryValue),
        currency: shipment.TotalCharges.CurrencyCode,
      },
    })),
    timestamp: new Date().toISOString(),
  };
}
```


10. Integration Testing with Stubbed Responses

We use nock to stub HTTP responses based on real API documentation.

Rationale:
- Tests work without UPS credentials
- No network calls and tests run in milliseconds


11. Immutability and Functional Patterns

We favor immutable data structures and pure functions where possible.

```
export class UpsCarrier {
  readonly name = 'ups';
  private readonly authManager: UpsAuthManager;
  
  constructor(
    private readonly config: Config,
    private readonly httpClient: HttpClient
  ) {}
}
```

## What would be added next
Given more time I would add
- Integrate FedEx to demonstrate multi carrier support
- Integrate Redis for rate caching
- Build a CLI tool
- Cover more tests: Edge cases, concurrent requests, stress tests