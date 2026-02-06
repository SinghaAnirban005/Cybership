import { z } from 'zod';

// Address Models
export const AddressSchema = z.object({
  street1: z.string().min(1, 'Street address is required'),
  street2: z.string().optional(),
  city: z.string().min(1, 'City is required'),
  state: z.string().min(2).max(2).optional(),
  postalCode: z.string().min(1, 'Postal code is required'),
  countryCode: z.string().length(2, 'Country code must be 2 characters'),
  isResidential: z.boolean().default(false),
});

export type Address = z.infer<typeof AddressSchema>;

// Package Models
export const DimensionsSchema = z.object({
  length: z.number().positive('Length must be positive'),
  width: z.number().positive('Width must be positive'),
  height: z.number().positive('Height must be positive'),
  unit: z.enum(['IN', 'CM']).default('IN'),
});

export type Dimensions = z.infer<typeof DimensionsSchema>;

export const WeightSchema = z.object({
  value: z.number().positive('Weight must be positive'),
  unit: z.enum(['LBS', 'KGS']).default('LBS'),
});

export type Weight = z.infer<typeof WeightSchema>;

export const PackageSchema = z.object({
  weight: WeightSchema,
  dimensions: DimensionsSchema.optional(),
  packagingType: z.string().optional(),
  declaredValue: z
    .object({
      amount: z.number().positive(),
      currency: z.string().length(3).default('USD'),
    })
    .optional(),
});

export type Package = z.infer<typeof PackageSchema>;

// Rate - Req Models
export const RateRequestSchema = z.object({
  origin: AddressSchema,
  destination: AddressSchema,
  packages: z.array(PackageSchema).min(1, 'At least one package is required'),
  serviceLevel: z.string().optional(),
  shipmentDate: z.string().optional(),
  requestedServices: z
    .object({
      saturdayDelivery: z.boolean().optional(),
      signatureRequired: z.boolean().optional(),
      insurance: z.boolean().optional(),
    })
    .optional(),
});

export type RateRequest = z.infer<typeof RateRequestSchema>;

// Rate - Res Models
export const MoneySchema = z.object({
  amount: z.number(),
  currency: z.string().length(3).default('USD'),
});

export type Money = z.infer<typeof MoneySchema>;

export const ChargeBreakdownSchema = z.object({
  baseCharge: MoneySchema,
  fuelSurcharge: MoneySchema.optional(),
  accessorialCharges: z.array(MoneySchema).optional(),
  taxes: z.array(MoneySchema).optional(),
});

export type ChargeBreakdown = z.infer<typeof ChargeBreakdownSchema>;

export const RateQuoteSchema = z.object({
  carrier: z.string(),
  serviceCode: z.string(),
  serviceName: z.string(),
  totalCharge: MoneySchema,
  chargeBreakdown: ChargeBreakdownSchema.optional(),
  transitDays: z.number().int().optional(),
  guaranteedDelivery: z.boolean().default(false),
  deliveryDate: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type RateQuote = z.infer<typeof RateQuoteSchema>;

export const RateResponseSchema = z.object({
  quotes: z.array(RateQuoteSchema),
  requestId: z.string().optional(),
  timestamp: z.string(),
});

export type RateResponse = z.infer<typeof RateResponseSchema>;

// Error Models
export enum ErrorCode {
  // Authentication errors
  AUTH_FAILED = 'AUTH_FAILED',
  AUTH_TOKEN_EXPIRED = 'AUTH_TOKEN_EXPIRED',
  AUTH_INVALID_CREDENTIALS = 'AUTH_INVALID_CREDENTIALS',

  // Validation errors
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  INVALID_ADDRESS = 'INVALID_ADDRESS',
  INVALID_PACKAGE = 'INVALID_PACKAGE',

  // API errors
  API_ERROR = 'API_ERROR',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',

  // Network errors
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT = 'TIMEOUT',

  // Carrier-specific errors
  CARRIER_ERROR = 'CARRIER_ERROR',
  NO_RATES_AVAILABLE = 'NO_RATES_AVAILABLE',

  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

export const CarrierErrorSchema = z.object({
  code: z.nativeEnum(ErrorCode),
  message: z.string(),
  details: z.record(z.string(), z.unknown()).optional(),
  retryable: z.boolean().default(false),
  carrierCode: z.string().optional(),
  timestamp: z.string(),
});

export type CarrierError = z.infer<typeof CarrierErrorSchema>;

export class CarrierIntegrationError extends Error {
  constructor(
    public readonly error: CarrierError,
    cause?: Error
  ) {
    super(error.message);
    this.name = 'CarrierIntegrationError';
    if (cause) {
      this.cause = cause;
    }
  }

  static fromZodError(zodError: z.ZodError): CarrierIntegrationError {
    return new CarrierIntegrationError({
      code: ErrorCode.VALIDATION_ERROR,
      message: 'Input validation failed',
      details: { errors: zodError },
      retryable: false,
      timestamp: new Date().toISOString(),
    });
  }
}