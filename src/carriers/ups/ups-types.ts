import { z } from 'zod';

// UPS Req Types
export const UpsAddressSchema = z.object({
  AddressLine: z.array(z.string()).optional(),
  City: z.string().optional(),
  StateProvinceCode: z.string().optional(),
  PostalCode: z.string(),
  CountryCode: z.string(),
  ResidentialAddressIndicator: z.string().optional(),
});

export type UpsAddress = z.infer<typeof UpsAddressSchema>;

export const UpsShipperSchema = z.object({
  Name: z.string().optional(),
  ShipperNumber: z.string().optional(),
  Address: UpsAddressSchema,
});

export const UpsShipToSchema = z.object({
  Name: z.string().optional(),
  Address: UpsAddressSchema,
});

export const UpsPackagingTypeSchema = z.object({
  Code: z.string(), // "02" = Customer Supplied Package
  Description: z.string().optional(),
});

export const UpsPackageWeightSchema = z.object({
  UnitOfMeasurement: z.object({
    Code: z.string(), // "LBS" or "KGS"
  }),
  Weight: z.string(),
});

export const UpsDimensionsSchema = z.object({
  UnitOfMeasurement: z.object({
    Code: z.string(), // "IN" or "CM"
  }),
  Length: z.string(),
  Width: z.string(),
  Height: z.string(),
});

export const UpsPackageSchema = z.object({
  PackagingType: UpsPackagingTypeSchema,
  PackageWeight: UpsPackageWeightSchema,
  Dimensions: UpsDimensionsSchema.optional(),
});

export type UpsPackage = z.infer<typeof UpsPackageSchema>

export const UpsServiceSchema = z.object({
  Code: z.string(), // Service level code (e.g., "03" = Ground)
  Description: z.string().optional(),
});

export const UpsShipmentSchema = z.object({
  Shipper: UpsShipperSchema,
  ShipTo: UpsShipToSchema,
  Service: UpsServiceSchema.optional(),
  Package: z.union([UpsPackageSchema, z.array(UpsPackageSchema)]),
  ShipmentRatingOptions: z
    .object({
      NegotiatedRatesIndicator: z.string().optional(),
    })
    .optional(),
});

export const UpsRequestSchema = z.object({
  RequestOption: z.string(), // "Rate" or "Shop"
  TransactionReference: z
    .object({
      CustomerContext: z.string().optional(),
    })
    .optional(),
});

export const UpsRateRequestSchema = z.object({
  Request: UpsRequestSchema,
  Shipment: UpsShipmentSchema,
});

export type UpsRateRequest = z.infer<typeof UpsRateRequestSchema>;

// UPS Response Types
export const UpsMonetaryValueSchema = z.object({
  CurrencyCode: z.string(),
  MonetaryValue: z.string(),
});

export const UpsChargeSchema = z.object({
  Code: z.string().optional(),
  CurrencyCode: z.string(),
  MonetaryValue: z.string(),
});

export const UpsRatedShipmentSchema = z.object({
  Service: z.object({
    Code: z.string(),
    Description: z.string().optional(),
  }),
  RatedShipmentAlert: z
    .array(
      z.object({
        Code: z.string(),
        Description: z.string(),
      })
    )
    .optional(),
  BillingWeight: z
    .object({
      UnitOfMeasurement: z.object({
        Code: z.string(),
      }),
      Weight: z.string(),
    })
    .optional(),
  TransportationCharges: UpsMonetaryValueSchema.optional(),
  BaseServiceCharge: UpsMonetaryValueSchema.optional(),
  ServiceOptionsCharges: UpsMonetaryValueSchema.optional(),
  TotalCharges: UpsMonetaryValueSchema,
  NegotiatedRateCharges: z
    .object({
      TotalCharge: UpsMonetaryValueSchema,
    })
    .optional(),
  GuaranteedDelivery: z
    .object({
      BusinessDaysInTransit: z.string().optional(),
      DeliveryByTime: z.string().optional(),
    })
    .optional(),
  TimeInTransit: z
    .object({
      BusinessDaysInTransit: z.string().optional(),
      ServiceSummary: z
        .object({
          EstimatedArrival: z
            .object({
              Arrival: z
                .object({
                  Date: z.string(),
                  Time: z.string().optional(),
                })
                .optional(),
            })
            .optional(),
        })
        .optional(),
    })
    .optional(),
});

export const UpsResponseSchema = z.object({
  ResponseStatus: z.object({
    Code: z.string(),
    Description: z.string(),
  }),
  Alert: z
    .array(
      z.object({
        Code: z.string(),
        Description: z.string(),
      })
    )
    .optional(),
  TransactionReference: z
    .object({
      CustomerContext: z.string().optional(),
    })
    .optional(),
});

export const UpsRateResponseSchema = z.object({
  Response: UpsResponseSchema,
  RatedShipment: z.union([
    UpsRatedShipmentSchema,
    z.array(UpsRatedShipmentSchema),
  ]),
});

export type UpsRateResponse = z.infer<typeof UpsRateResponseSchema>;

// UPS Error Types
export const UpsErrorResponseSchema = z.object({
  response: z.object({
    errors: z.array(
      z.object({
        code: z.string(),
        message: z.string(),
      })
    ),
  }),
});

export type UpsErrorResponse = z.infer<typeof UpsErrorResponseSchema>;