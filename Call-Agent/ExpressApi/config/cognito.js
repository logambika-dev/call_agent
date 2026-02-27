import dotenv from 'dotenv';
import path from 'path';

// Load .env file
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

console.log('### Environment variables loaded:');
console.log('AWS_COGNITO_REGION:', process.env.AWS_COGNITO_REGION);
console.log('AWS_COGNITO_USER_POOL_ID:', process.env.AWS_COGNITO_USER_POOL_ID);
console.log('AWS_COGNITO_CLIENT_ID:', process.env.AWS_COGNITO_CLIENT_ID);

export default {
  region: process.env.AWS_COGNITO_REGION,
  userPoolId: process.env.AWS_COGNITO_USER_POOL_ID,
  clientId: process.env.AWS_COGNITO_CLIENT_ID,
  clientSecret: process.env.AWS_COGNITO_CLIENT_SECRET
};