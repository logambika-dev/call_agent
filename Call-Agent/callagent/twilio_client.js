require('dotenv').config();
const twilio = require('twilio');

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_PHONE_NUMBER;
const flowSid = process.env.TWILIO_FLOW_SID;

if (!accountSid || !authToken || !fromNumber) {
    throw new Error('Missing Twilio credentials in .env file');
}

const client = twilio(accountSid, authToken);

module.exports = { client, fromNumber, accountSid, flowSid };