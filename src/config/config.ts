import { z } from 'zod';
import * as dotenv from 'dotenv';

dotenv.config();

const ConfigSchema = z.object({
  ups: z.object({
    clientId: z.string().min(1, 'UPS_CLIENT_ID is required'),
    clientSecret: z.string().min(1, 'UPS_CLIENT_SECRET is required'),
    accountNumber: z.string().min(1, 'UPS_ACCOUNT_NUMBER is required'),
    baseUrl: z.string().url().default('https://onlinetools.ups.com'),
    oauthUrl: z
      .string()
      .url()
      .default('https://onlinetools.ups.com/security/v1/oauth/token'),
  }),
  http: z.object({
    timeoutMs: z.number().int().positive().default(30000),
    maxRetries: z.number().int().nonnegative().default(3),
  }),
  app: z.object({
    environment: z
      .enum(['development', 'staging', 'production'])
      .default('development'),
    logLevel: z
      .enum(['debug', 'info', 'warn', 'error'])
      .default('info'),
  }),
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(): Config {
  const rawConfig = {
    ups: {
      clientId: process.env.UPS_CLIENT_ID || '',
      clientSecret: process.env.UPS_CLIENT_SECRET || '',
      accountNumber: process.env.UPS_ACCOUNT_NUMBER || '',
      baseUrl: process.env.UPS_BASE_URL,
      oauthUrl: process.env.UPS_OAUTH_URL,
    },
    http: {
      timeoutMs: process.env.HTTP_TIMEOUT_MS
        ? parseInt(process.env.HTTP_TIMEOUT_MS, 10)
        : undefined,
      maxRetries: process.env.HTTP_MAX_RETRIES
        ? parseInt(process.env.HTTP_MAX_RETRIES, 10)
        : undefined,
    },
    app: {
      environment: process.env.NODE_ENV,
      logLevel: process.env.LOG_LEVEL,
    },
  };

  try {
    return ConfigSchema.parse(rawConfig);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const missingFields = error.issues
        .map((err) => `${err.path.join('.')}: ${err.message}`)
        .join('\n');
      throw new Error(
        `Configuration validation failed:\n${missingFields}\n\nPlease check your .env file against .env.example`
      );
    }
    throw error;
  }
}

/**
 * Singleton configuration instance
 */
let configInstance: Config | null = null;

export function getConfig(): Config {
  if (!configInstance) {
    configInstance = loadConfig();
  }
  return configInstance;
}

export function resetConfig(): void {
  configInstance = null;
}