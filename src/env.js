import { z } from 'zod';

const envSchema = z.object({
  MONGODB_URI: z.string().url("Must be a valid MongoDB URI"),
  JWT_SECRET: z.string().min(8, "JWT_SECRET must be at least 8 characters long"),
  JWT_REFRESH_SECRET: z.string().min(8, "JWT_REFRESH_SECRET must be at least 8 characters long"),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  ALLOWED_ORIGINS: z.string().min(1, "ALLOWED_ORIGINS is required"),
  SMTP_HOST: z.string().min(1, "SMTP_HOST is required"),
  SMTP_PORT: z.string().regex(/^\d+$/, "SMTP_PORT must be a valid number"),
  SMTP_USER: z.string().min(1, "SMTP_USER is required"),
  SMTP_PASS: z.string().min(1, "SMTP_PASS is required"),
});

const isBuild = process.env.npm_lifecycle_event === 'build' || process.env.SKIP_ENV_VALIDATION === 'true';

const envParsed = envSchema.safeParse(process.env);

if (!envParsed.success && !isBuild) {
  console.error("❌ Invalid backend environment variables:\n", JSON.stringify(envParsed.error.format(), null, 2));
  throw new Error("Invalid environment variables");
}

if (!envParsed.success && isBuild) {
  console.warn("⚠️ Warning: Invalid environment variables detected during build. Bypassing validation because this is a build step.");
}

export const env = envParsed.success ? envParsed.data : process.env;
