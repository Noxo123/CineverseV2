import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  WEB_ORIGIN: z.string().url().default("http://localhost:5173"),
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(32),
  SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  SUPER_ADMIN_EMAILS: z.string().default("")
});

export const env = schema.parse(process.env);
export const isProduction = env.NODE_ENV === "production";

export const superAdminEmails = env.SUPER_ADMIN_EMAILS.split(",").map(email => email.trim().toLowerCase()).filter(Boolean);
