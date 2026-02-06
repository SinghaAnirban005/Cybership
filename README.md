# Getting Started

## Setup

1. **Install dependencies**

   ```bash
   pnpm install (pnpm v10.28.2)
   ```

2. **Copy environment variables**

   ```bash
   cp .env.example .env
   ```

3. **Run tests**

   ```bash
   pnpm test
   ```

---

# Design Decisions

## Architecture

### 1. Domain Driven Design

We separate **domain models** from **carrier specific implementations**.

**Rationale**

* **Carrier independence**: Business logic does not depend on UPS, FedEx, or any carrier specific API structure
* **Extensibility**: Adding a new carrier does not require changes to existing domain code

---

### 2. Layered Architecture

We organize the codebase into distinct layers with clear dependency rules.

![Layered architecture diagram](https://github.com/user-attachments/assets/6cd48224-724a-4943-a2e2-164885d4b704)

**Rationale**

* Each layer has a single, well defined responsibility
* Inner layers (domain) do **not** depend on outer layers (infrastructure)
* Each layer can be tested independently using mocks

---

### 3. Factory Pattern for Carrier Creation

We use a factory to instantiate carriers instead of constructing them directly.

**Rationale**

* Centralized registration of all supported carriers
* Factory manages carrier dependencies (configuration, HTTP client, etc.)

---

### 4. Type Safety with TypeScript + Zod

* **TypeScript** ensures compile‑time safety
* **Zod** provides runtime validation for external inputs and API responses

This combination prevents invalid data from propagating through the system.

---

### 5. OAuth Token Management

We implement intelligent token caching with automatic refresh handling.

```ts
export class UpsAuthManager {
  private cachedToken: CachedToken | null = null;
  private readonly tokenBuffer = 300000; // 5 minutes

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

---

### 6. HTTP Client with Retry Logic

We implement automatic retries with **exponential backoff** for transient failures.

```ts
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

---

### 7. Structured Error Handling

We created a custom `CarrierIntegrationError` class with **typed error codes**.

**Rationale**

* Callers can handle failures by checking error codes
* Avoids brittle string based error parsing

---

### 8. Mapper Pattern for Request / Response Translation

We use mapper functions for transforming between domain and carrier types.

```ts
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

---

### 9. Integration Testing with Stubbed Responses

We use **nock** to stub HTTP responses based on official API documentation.

**Rationale**

* Tests run without real UPS credentials
* No network calls
* Test suite executes in milliseconds

---

### 10. Immutability and Functional Patterns

We favor immutable data structures and minimize shared mutable state.

```ts
export class UpsCarrier {
  readonly name = 'ups';
  private readonly authManager: UpsAuthManager;

  constructor(
    private readonly config: Config,
    private readonly httpClient: HttpClient
  ) {}
}
```

---

## What Would Be Added Next

Given more time, I would:

* Integrate **FedEx** to demonstrate true multi carrier support
* Add **Redis** for rate caching
* Build a **CLI tool** for local usage and debugging
* Expand test coverage:

  * Edge cases
  * Concurrent requests
  * Stress and load tests
