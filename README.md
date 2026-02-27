# AI Call Agent Service

A standalone AI-powered call agent service that provides REST API endpoints for making automated calls, retrieving transcripts, and analyzing call outcomes. This service is designed to run independently and be integrated with other applications via REST API.

## Architecture

This service operates as a standalone microservice that:
- Runs on its own server/port
- Exposes REST API endpoints for call operations
- Can be integrated with any application via HTTP requests
- Handles AI-powered voice interactions using ElevenLabs

## Features

- **Make Automated Calls**: Initiate AI-powered voice calls to prospects
- **Transcript Retrieval**: Get call transcripts by call ID
- **Call Analysis**: Analyze call outcomes and extract insights
- **Background Processing**: Monitor calls and report results asynchronously

## Prerequisites

- Python 3.8+
- pip (Python package manager)
- ElevenLabs API credentials
- Twilio account (if using Twilio integration)

## Installation

1. **Clone the repository**
```bash
git clone <repository-url>
cd call_agent
```

2. **Set up Python virtual environment**
```bash
python -m venv venv

# Windows
venv\Scripts\activate

# Linux/Mac
source venv/bin/activate
```

3. **Install dependencies**
```bash
cd Call-Agent/FastAPI
pip install -r requirements.txt
```

4. **Configure environment variables**

Create a `.env` file in the `Call-Agent/FastAPI` directory:

```env
# ElevenLabs Configuration
ELEVENLABS_API_KEY=your_elevenlabs_api_key
ELEVENLABS_AGENT_ID=your_agent_id

# Twilio Configuration (if needed)
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_PHONE_NUMBER=your_twilio_phone_number

# Server Configuration
HOST=0.0.0.0
PORT=8000

# Webhook Configuration (optional)
WEBHOOK_URL=https://your-main-app.com/api/webhook/call-result
```

## Running the Service

### Development Mode

```bash
cd Call-Agent/FastAPI
uvicorn app:app --reload --host 0.0.0.0 --port 8000
```

### Production Mode

```bash
cd Call-Agent/FastAPI
uvicorn app:app --host 0.0.0.0 --port 8000 --workers 4
```

The service will be available at `http://localhost:8000`

## API Documentation

Once the service is running, access the interactive API documentation:
- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

## API Endpoints

### 1. Health Check
```http
GET /
```

**Response:**
```json
{
  "status": "AI running",
  "service": "Python AI Service"
}
```

### 2. Make a Call
```http
POST /api/agent/call
```

**Request Body:**
```json
{
  "phone": "+1234567890",
  "name": "John Doe",
  "company": "Acme Corp",
  "context": {
    "campaign_id": "123",
    "lead_id": "456"
  }
}
```

**Response:**
```json
{
  "success": true,
  "call_id": "call_abc123",
  "message": "Call initiated successfully"
}
```

### 3. Get Call Transcript
```http
GET /api/agent/transcript/{call_id}
```

**Response:**
```json
{
  "success": true,
  "call_id": "call_abc123",
  "transcript": "Full conversation transcript...",
  "duration": 120
}
```

### 4. Analyze Call
```http
POST /api/agent/analyze
```

**Request Body:**
```json
{
  "transcript": "Full conversation transcript to analyze..."
}
```

**Response:**
```json
{
  "success": true,
  "outcome": "interested",
  "sentiment": "positive",
  "key_points": ["Interested in product", "Requested demo"],
  "next_action": "Schedule follow-up demo"
}
```

## Integration Guide

### Integrating with Your Application

#### 1. Node.js/Express Example

```javascript
const axios = require('axios');

const AI_SERVICE_URL = 'http://localhost:8000';

// Make a call
async function makeCall(phoneNumber, name, company, context) {
  try {
    const response = await axios.post(`${AI_SERVICE_URL}/api/agent/call`, {
      phone: phoneNumber,
      name: name,
      company: company,
      context: context
    });
    return response.data;
  } catch (error) {
    console.error('Error making call:', error);
    throw error;
  }
}

// Get transcript
async function getTranscript(callId) {
  try {
    const response = await axios.get(`${AI_SERVICE_URL}/api/agent/transcript/${callId}`);
    return response.data;
  } catch (error) {
    console.error('Error getting transcript:', error);
    throw error;
  }
}

// Analyze call
async function analyzeCall(transcript) {
  try {
    const response = await axios.post(`${AI_SERVICE_URL}/api/agent/analyze`, {
      transcript: transcript
    });
    return response.data;
  } catch (error) {
    console.error('Error analyzing call:', error);
    throw error;
  }
}
```

#### 2. Python Example

```python
import requests

AI_SERVICE_URL = 'http://localhost:8000'

def make_call(phone, name, company, context=None):
    response = requests.post(
        f'{AI_SERVICE_URL}/api/agent/call',
        json={
            'phone': phone,
            'name': name,
            'company': company,
            'context': context or {}
        }
    )
    return response.json()

def get_transcript(call_id):
    response = requests.get(f'{AI_SERVICE_URL}/api/agent/transcript/{call_id}')
    return response.json()

def analyze_call(transcript):
    response = requests.post(
        f'{AI_SERVICE_URL}/api/agent/analyze',
        json={'transcript': transcript}
    )
    return response.json()
```

#### 3. cURL Example

```bash
# Make a call
curl -X POST http://localhost:8000/api/agent/call \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "+1234567890",
    "name": "John Doe",
    "company": "Acme Corp",
    "context": {"campaign_id": "123"}
  }'

# Get transcript
curl http://localhost:8000/api/agent/transcript/call_abc123

# Analyze call
curl -X POST http://localhost:8000/api/agent/analyze \
  -H "Content-Type: application/json" \
  -d '{"transcript": "Your call transcript here..."}'
```

## Webhook Integration

The service can send call results to your application via webhook. Configure the `WEBHOOK_URL` in your `.env` file.

**Webhook Payload:**
```json
{
  "call_id": "call_abc123",
  "status": "completed",
  "transcript": "Full transcript...",
  "analysis": {
    "outcome": "interested",
    "sentiment": "positive"
  },
  "context": {
    "campaign_id": "123",
    "lead_id": "456"
  }
}
```

## Deployment

### Docker Deployment

Create a `Dockerfile` in `Call-Agent/FastAPI`:

```dockerfile
FROM python:3.9-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
```

Build and run:
```bash
docker build -t ai-call-agent .
docker run -p 8000:8000 --env-file .env ai-call-agent
```

### Cloud Deployment

The service can be deployed to:
- AWS EC2 / ECS / Lambda
- Google Cloud Run / Compute Engine
- Azure App Service / Container Instances
- Heroku
- DigitalOcean

## Error Handling

All endpoints return standard HTTP status codes:
- `200`: Success
- `400`: Bad Request (invalid input)
- `500`: Internal Server Error

Error response format:
```json
{
  "success": false,
  "message": "Error description",
  "detail": "Detailed error information"
}
```

## Security Considerations

1. **API Authentication**: Add API key authentication for production
2. **HTTPS**: Always use HTTPS in production
3. **Rate Limiting**: Implement rate limiting to prevent abuse
4. **Environment Variables**: Never commit `.env` files
5. **CORS**: Configure CORS appropriately for your domain

## Monitoring & Logging

The service includes built-in logging for:
- Incoming requests
- Request/response bodies
- Error tracking

Logs are written to console and can be redirected to files or logging services.

## Troubleshooting

### Service won't start
- Check if port 8000 is already in use
- Verify all environment variables are set
- Ensure dependencies are installed

### Calls not connecting
- Verify ElevenLabs API credentials
- Check Twilio configuration (if applicable)
- Ensure phone numbers are in correct format

### Webhook not receiving data
- Verify webhook URL is accessible
- Check firewall/network settings
- Review webhook endpoint logs

## Support

For issues and questions:
- Check the API documentation at `/docs`
- Review logs for error messages
- Contact: developer@infynd.com

## License

[Your License Here]
