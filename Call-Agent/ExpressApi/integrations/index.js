// Redis connection configuration for BullMQ
// BullMQ uses ioredis internally, which is installed as a dependency
import Redis from 'ioredis';

const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD || undefined,
  db: parseInt(process.env.REDIS_DB || '0'),
  maxRetriesPerRequest: null,
  enableReadyCheck: false
};

// ### Create and export Redis client for BullMQ
const redis = new Redis(redisConfig);

redis.on('connect', () => {
  console.log('### Redis connected successfully');
});

redis.on('error', (error) => {
  console.error('### Redis connection error:', error.message);
});

export default redis;
