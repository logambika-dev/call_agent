import dotenv from "dotenv";
dotenv.config();

export default {
  env: process.env.NODE_ENV || "development",
  port: process.env.PORT || 4004,
  apiVersion: process.env.API_VERSION || "v1",

  // Legacy config
  PORT: process.env.PORT || 4004,
  FRONTEND_URL: process.env.FRONTEND_URL,
  API_HOST: process.env.API_HOST,

  // Database
  database: {
    url: process.env.DATABASE_URL,
  },
  DB_HOST: process.env.DB_HOST,
  DB_PORT: process.env.DB_PORT,
  DB_NAME: process.env.DB_NAME,
  DB_USER: process.env.DB_USER,
  DB_PASSWORD: process.env.DB_PASSWORD,

  // JWT
  jwt: {
    secret: process.env.JWT_SECRET,
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || "15m",
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "7d",
  },
  SALT_ROUNDS: process.env.SALT_ROUNDS,
  ACCESS_TOKEN_SECRET: process.env.ACCESS_TOKEN_SECRET,
  ACCESS_TOKEN_EXPIRY: process.env.ACCESS_TOKEN_EXPIRY,
  REFRESH_TOKEN_SECRET: process.env.REFRESH_TOKEN_SECRET,
  REFRESH_TOKEN_EXPIRY: process.env.REFRESH_TOKEN_EXPIRY,

  region: process.env.AWS_COGNITO_REGION,
  userPoolId: process.env.AWS_COGNITO_USER_POOL_ID,
  clientId: process.env.AWS_COGNITO_CLIENT_ID,
  clientSecret: process.env.AWS_COGNITO_CLIENT_SECRET,
  // CORS
  cors: {
    origin: process.env.CORS_ORIGIN?.split(",") || ["http://localhost:4004"],
  },

  OTP_EXPIRY: process.env.OTP_EXPIRY,
  RUNTIME: process.env.RUNTIME,
  HMAC_USER_SECRET: process.env.HMAC_USER_KEY,
  HMAC_AI_SECRET: process.env.HMAC_AI_KEY,

  // AI Service (Python)
  aiService: {
    url: process.env.AI_SERVICE_URL || (process.env.NODE_ENV === 'production' ? "https://aisdrdevai.infynd.com" : "http://localhost:5001"),
    timeout: parseInt(process.env.AI_SERVICE_TIMEOUT) || 120000, // 120 seconds
  },

  // Call Agent Service (Python FastAPI)
  callAgent: {
    url: process.env.CALL_AGENT_URL || "http://localhost:8001",
    timeout: parseInt(process.env.CALL_AGENT_TIMEOUT) || 120000, // 120 seconds
  },

  // Email Service (SMTP)
  emailService: {
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT) || 587,
    user: process.env.SMTP_USER,
    password: process.env.SMTP_PASSWORD,
    from: process.env.SMTP_FROM,
  },

  // Google APIs
  googleApi: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    redirectUri: process.env.GOOGLE_REDIRECT_URI,
    refreshToken: process.env.GOOGLE_REFRESH_TOKEN,
  },

  // Botdog API
  botdogApiKey: process.env.BOTDOG_API_KEY,
  botdogBaseUrl: process.env.BOTDOG_BASE_URL || "https://api.botdog.co/v1",

  // Sending Limits
  emailDailyLimit: parseInt(process.env.EMAIL_DAILY_LIMIT) || 40,
};
