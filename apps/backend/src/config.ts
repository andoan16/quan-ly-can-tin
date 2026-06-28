import 'dotenv/config';

export const config = {
  port: Number(process.env.PORT || 4000),
  databaseUrl: process.env.DATABASE_URL || '',
  jwtSecret: process.env.JWT_SECRET!,
  nodeEnv: process.env.NODE_ENV || 'development',
  allowedOrigins: (process.env.CORS_ORIGINS || 'http://localhost:5173').split(','),
};

if (!config.databaseUrl) {
  throw new Error('DATABASE_URL is required');
}
if (!config.jwtSecret) {
  throw new Error('JWT_SECRET is required');
}
