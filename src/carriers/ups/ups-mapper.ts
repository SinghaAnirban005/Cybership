import {
  RateRequest,
  RateResponse,
  Address,
  Package,
  RateQuote,
  ErrorCode,
  CarrierIntegrationError,
} from '../../domain/models';
import {
  UpsRateRequest,
  UpsRateResponse,
  UpsAddress,
  UpsPackage
} from './ups-types';

/**
 * UPS Service Code mappings
 */
const UPS_SERVICE_CODES: Record<string, string> = {
  GROUND: '03',
  NEXT_DAY_AIR: '01',
  SECOND_DAY_AIR: '02',
  THREE_DAY_SELECT: '12',
  NEXT_DAY_AIR_SAVER: '13',
  NEXT_DAY_AIR_EARLY: '14',
  WORLDWIDE_EXPRESS: '07',
  WORLDWIDE_EXPEDITED: '08',
  STANDARD: '11',
  WORLDWIDE_EXPRESS_PLUS: '54',
  WORLDWIDE_SAVER: '65',
};

/**
 * Reverse mapping of UPS service codes to names
 */
const UPS_SERVICE_NAMES: Record<string, string> = {
  '01': 'Next Day Air',
  '02': 'Second Day Air',
  '03': 'Ground',
  '07': 'Worldwide Express',
  '08': 'Worldwide Expedited',
  '11': 'Standard',
  '12': 'Three-Day Select',
  '13': 'Next Day Air Saver',
  '14': 'Next Day Air Early',
  '54': 'Worldwide Express Plus',
  '65': 'Worldwide Saver',
};

/**
 * Maps our domain Address to UPS API format
 */
export function mapAddressToUps(address: Address): UpsAddress {
  const addressLines: string[] = [address.street1];
  if (address.street2) {
    addressLines.push(address.street2);
  }

  return {
    AddressLine: addressLines.length > 0 ? addressLines : undefined,
    City: address.city,
    StateProvinceCode: address.state,
    PostalCode: address.postalCode,
    CountryCode: address.countryCode,
    ResidentialAddressIndicator: address.isResidential ? '' : undefined,
  };
}

/**
 * Maps our domain Package to UPS API format
 */
export function mapPackageToUps(pkg: Package): UpsPackage {
  const upsPackage: UpsPackage = {
    PackagingType: {
      Code: pkg.packagingType || '02', // Default to customer supplied
      Description: 'Customer Supplied Package',
    },
    PackageWeight: {
      UnitOfMeasurement: {
        Code: pkg.weight.unit,
      },
      Weight: pkg.weight.value.toString(),
    },
  };

  if (pkg.dimensions) {
    upsPackage.Dimensions = {
      UnitOfMeasurement: {
        Code: pkg.dimensions.unit,
      },
      Length: pkg.dimensions.length.toString(),
      Width: pkg.dimensions.width.toString(),
      Height: pkg.dimensions.height.toString(),
    };
  }

  return upsPackage;
}

/**
 * Maps our domain RateRequest to UPS API format
 */
export function mapRateRequestToUps(
  request: RateRequest,
  accountNumber: string
): UpsRateRequest {
  // "Rate" for specific service, "Shop" for all services
  const requestOption = request.serviceLevel ? 'Rate' : 'Shop';

  const upsRequest: UpsRateRequest = {
    Request: {
      RequestOption: requestOption,
      TransactionReference: {
        CustomerContext: 'Rating Request',
      },
    },
    Shipment: {
      Shipper: {
        ShipperNumber: accountNumber,
        Address: mapAddressToUps(request.origin),
      },
      ShipTo: {
        Address: mapAddressToUps(request.destination),
      },
      Package:
        request.packages.length === 1
          ? mapPackageToUps(request.packages[0]!)
          : request.packages.map(mapPackageToUps),
      ShipmentRatingOptions: {
        NegotiatedRatesIndicator: '',
      },
    },
  };

  if (request.serviceLevel) {
    const serviceCode =
      UPS_SERVICE_CODES[request.serviceLevel] || request.serviceLevel;
    upsRequest.Shipment.Service = {
      Code: serviceCode,
    };
  }

  return upsRequest;
}

/**
 * Maps UPS API response to our domain RateResponse
 */
export function mapUpsResponseToRates(
  upsResponse: UpsRateResponse
): RateResponse {
  const ratedShipments = Array.isArray(upsResponse.RatedShipment)
    ? upsResponse.RatedShipment
    : [upsResponse.RatedShipment];

  const quotes: RateQuote[] = ratedShipments.map((shipment) => {
    const charges =
      shipment.NegotiatedRateCharges?.TotalCharge || shipment.TotalCharges;

    const serviceCode = shipment.Service.Code;
    const serviceName =
      shipment.Service.Description ||
      UPS_SERVICE_NAMES[serviceCode] ||
      `UPS Service ${serviceCode}`;

    let transitDays: number | undefined;
    if (shipment.TimeInTransit?.BusinessDaysInTransit) {
      transitDays = parseInt(shipment.TimeInTransit.BusinessDaysInTransit, 10);
    } else if (shipment.GuaranteedDelivery?.BusinessDaysInTransit) {
      transitDays = parseInt(
        shipment.GuaranteedDelivery.BusinessDaysInTransit,
        10
      );
    }

    let deliveryDate: string | undefined;
    if (
      shipment.TimeInTransit?.ServiceSummary?.EstimatedArrival?.Arrival?.Date
    ) {
      deliveryDate =
        shipment.TimeInTransit.ServiceSummary.EstimatedArrival.Arrival.Date;
    }

    return {
      carrier: 'UPS',
      serviceCode,
      serviceName,
      totalCharge: {
        amount: parseFloat(charges.MonetaryValue),
        currency: charges.CurrencyCode,
      },
      chargeBreakdown: shipment.BaseServiceCharge
        ? {
            baseCharge: {
              amount: parseFloat(shipment.BaseServiceCharge.MonetaryValue),
              currency: shipment.BaseServiceCharge.CurrencyCode,
            },
          }
        : undefined,
      transitDays,
      guaranteedDelivery: !!shipment.GuaranteedDelivery,
      deliveryDate,
      metadata: {
        billingWeight: shipment.BillingWeight,
        alerts: shipment.RatedShipmentAlert,
      },
    };
  });

  return {
    quotes,
    requestId: upsResponse.Response.TransactionReference?.CustomerContext,
    timestamp: new Date().toISOString(),
  };
}

export function parseUpsError(errorData: unknown): CarrierIntegrationError {
  try {
    // parse as UPS error format
    if (
      typeof errorData === 'object' &&
      errorData !== null &&
      'response' in errorData
    ) {
      const response = (errorData as any).response;
      if (response && 'errors' in response && Array.isArray(response.errors)) {
        const firstError = response.errors[0];
        return new CarrierIntegrationError({
          code: ErrorCode.CARRIER_ERROR,
          message: firstError.message || 'UPS API error',
          carrierCode: firstError.code,
          retryable: false,
          timestamp: new Date().toISOString(),
        });
      }
    }
  } catch {
  }

  return new CarrierIntegrationError({
    code: ErrorCode.CARRIER_ERROR,
    message: 'Unknown UPS API error',
    details: { errorData },
    retryable: false,
    timestamp: new Date().toISOString(),
  });
}