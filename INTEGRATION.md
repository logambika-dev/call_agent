# Integration Examples

This document provides practical examples for integrating the AI Call Agent Service into your application.

## Table of Contents
- [Node.js/Express Integration](#nodejs-express-integration)
- [Python/Django Integration](#python-django-integration)
- [React Frontend Integration](#react-frontend-integration)
- [Webhook Handler Examples](#webhook-handler-examples)

---

## Node.js/Express Integration

### Installation
```bash
npm install axios
```

### Service Client Module

Create `services/aiCallAgent.js`:

```javascript
const axios = require('axios');

class AICallAgentClient {
  constructor(baseURL = 'http://localhost:8000') {
    this.client = axios.create({
      baseURL: baseURL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }

  async makeCall(phoneNumber, name, company, context = {}) {
    try {
      const response = await this.client.post('/api/agent/call', {
        phone: phoneNumber,
        name: name,
        company: company,
        context: context
      });
      return response.data;
    } catch (error) {
      throw new Error(`Failed to make call: ${error.message}`);
    }
  }

  async getTranscript(callId) {
    try {
      const response = await this.client.get(`/api/agent/transcript/${callId}`);
      return response.data;
    } catch (error) {
      throw new Error(`Failed to get transcript: ${error.message}`);
    }
  }

  async analyzeCall(transcript) {
    try {
      const response = await this.client.post('/api/agent/analyze', {
        transcript: transcript
      });
      return response.data;
    } catch (error) {
      throw new Error(`Failed to analyze call: ${error.message}`);
    }
  }

  async healthCheck() {
    try {
      const response = await this.client.get('/');
      return response.data;
    } catch (error) {
      throw new Error(`Health check failed: ${error.message}`);
    }
  }
}

module.exports = AICallAgentClient;
```

### Express Route Example

```javascript
const express = require('express');
const AICallAgentClient = require('./services/aiCallAgent');

const router = express.Router();
const aiAgent = new AICallAgentClient(process.env.AI_SERVICE_URL);

// Initiate a call
router.post('/leads/:leadId/call', async (req, res) => {
  try {
    const { leadId } = req.params;
    const { phone, name, company } = req.body;

    const result = await aiAgent.makeCall(phone, name, company, {
      lead_id: leadId,
      campaign_id: req.body.campaignId
    });

    // Save call_id to database
    await db.calls.create({
      leadId: leadId,
      callId: result.call_id,
      status: 'initiated'
    });

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get call transcript
router.get('/calls/:callId/transcript', async (req, res) => {
  try {
    const { callId } = req.params;
    const transcript = await aiAgent.getTranscript(callId);
    res.json(transcript);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
```

---

## Python/Django Integration

### Service Client Module

Create `services/ai_call_agent.py`:

```python
import requests
from typing import Dict, Optional
import logging

logger = logging.getLogger(__name__)

class AICallAgentClient:
    def __init__(self, base_url: str = 'http://localhost:8000'):
        self.base_url = base_url
        self.timeout = 30
    
    def make_call(self, phone: str, name: str, company: str, 
                  context: Optional[Dict] = None) -> Dict:
        """Initiate an AI-powered call"""
        try:
            response = requests.post(
                f'{self.base_url}/api/agent/call',
                json={
                    'phone': phone,
                    'name': name,
                    'company': company,
                    'context': context or {}
                },
                timeout=self.timeout
            )
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            logger.error(f'Failed to make call: {e}')
            raise
    
    def get_transcript(self, call_id: str) -> Dict:
        """Get call transcript by call ID"""
        try:
            response = requests.get(
                f'{self.base_url}/api/agent/transcript/{call_id}',
                timeout=self.timeout
            )
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            logger.error(f'Failed to get transcript: {e}')
            raise
    
    def analyze_call(self, transcript: str) -> Dict:
        """Analyze call transcript"""
        try:
            response = requests.post(
                f'{self.base_url}/api/agent/analyze',
                json={'transcript': transcript},
                timeout=self.timeout
            )
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            logger.error(f'Failed to analyze call: {e}')
            raise
    
    def health_check(self) -> Dict:
        """Check if service is running"""
        try:
            response = requests.get(f'{self.base_url}/', timeout=5)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            logger.error(f'Health check failed: {e}')
            raise
```

### Django View Example

```python
from django.http import JsonResponse
from django.views import View
from .services.ai_call_agent import AICallAgentClient
from .models import Lead, Call
import os

ai_agent = AICallAgentClient(os.getenv('AI_SERVICE_URL', 'http://localhost:8000'))

class InitiateCallView(View):
    def post(self, request, lead_id):
        try:
            lead = Lead.objects.get(id=lead_id)
            
            result = ai_agent.make_call(
                phone=lead.phone,
                name=lead.name,
                company=lead.company,
                context={
                    'lead_id': str(lead_id),
                    'campaign_id': request.POST.get('campaign_id')
                }
            )
            
            # Save call record
            Call.objects.create(
                lead=lead,
                call_id=result['call_id'],
                status='initiated'
            )
            
            return JsonResponse(result)
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=500)

class CallTranscriptView(View):
    def get(self, request, call_id):
        try:
            transcript = ai_agent.get_transcript(call_id)
            return JsonResponse(transcript)
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=500)
```

---

## React Frontend Integration

### API Service

Create `src/services/aiCallAgent.js`:

```javascript
import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_AI_SERVICE_URL || 'http://localhost:8000';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json'
  }
});

export const aiCallAgentService = {
  makeCall: async (phone, name, company, context = {}) => {
    const response = await apiClient.post('/api/agent/call', {
      phone,
      name,
      company,
      context
    });
    return response.data;
  },

  getTranscript: async (callId) => {
    const response = await apiClient.get(`/api/agent/transcript/${callId}`);
    return response.data;
  },

  analyzeCall: async (transcript) => {
    const response = await apiClient.post('/api/agent/analyze', {
      transcript
    });
    return response.data;
  },

  healthCheck: async () => {
    const response = await apiClient.get('/');
    return response.data;
  }
};
```

### React Component Example

```javascript
import React, { useState } from 'react';
import { aiCallAgentService } from '../services/aiCallAgent';

function CallInitiator({ lead }) {
  const [loading, setLoading] = useState(false);
  const [callResult, setCallResult] = useState(null);
  const [error, setError] = useState(null);

  const handleMakeCall = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const result = await aiCallAgentService.makeCall(
        lead.phone,
        lead.name,
        lead.company,
        { lead_id: lead.id, campaign_id: lead.campaignId }
      );
      
      setCallResult(result);
      
      // Poll for transcript after call completes
      setTimeout(() => fetchTranscript(result.call_id), 5000);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchTranscript = async (callId) => {
    try {
      const transcript = await aiCallAgentService.getTranscript(callId);
      console.log('Transcript:', transcript);
    } catch (err) {
      console.error('Failed to fetch transcript:', err);
    }
  };

  return (
    <div>
      <button onClick={handleMakeCall} disabled={loading}>
        {loading ? 'Calling...' : 'Make Call'}
      </button>
      
      {callResult && (
        <div className="success">
          Call initiated! ID: {callResult.call_id}
        </div>
      )}
      
      {error && (
        <div className="error">
          Error: {error}
        </div>
      )}
    </div>
  );
}

export default CallInitiator;
```

---

## Webhook Handler Examples

### Node.js/Express Webhook Handler

```javascript
const express = require('express');
const router = express.Router();

// Webhook endpoint to receive call results
router.post('/webhook/call-result', async (req, res) => {
  try {
    const { call_id, status, transcript, analysis, context } = req.body;

    console.log(`Received webhook for call ${call_id}`);

    // Update database
    await db.calls.update(
      { callId: call_id },
      {
        status: status,
        transcript: transcript,
        outcome: analysis?.outcome,
        sentiment: analysis?.sentiment
      }
    );

    // Update lead status based on outcome
    if (context?.lead_id) {
      await db.leads.update(
        { id: context.lead_id },
        {
          lastCallStatus: status,
          lastCallOutcome: analysis?.outcome
        }
      );
    }

    // Send notification
    if (analysis?.outcome === 'interested') {
      await notificationService.send({
        type: 'lead_interested',
        leadId: context.lead_id,
        callId: call_id
      });
    }

    res.json({ success: true, message: 'Webhook processed' });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
```

### Python/Django Webhook Handler

```python
from django.views.decorators.csrf import csrf_exempt
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
import json
import logging

logger = logging.getLogger(__name__)

@csrf_exempt
@require_http_methods(["POST"])
def call_result_webhook(request):
    try:
        data = json.loads(request.body)
        
        call_id = data.get('call_id')
        status = data.get('status')
        transcript = data.get('transcript')
        analysis = data.get('analysis', {})
        context = data.get('context', {})
        
        logger.info(f'Received webhook for call {call_id}')
        
        # Update call record
        call = Call.objects.get(call_id=call_id)
        call.status = status
        call.transcript = transcript
        call.outcome = analysis.get('outcome')
        call.sentiment = analysis.get('sentiment')
        call.save()
        
        # Update lead
        if context.get('lead_id'):
            lead = Lead.objects.get(id=context['lead_id'])
            lead.last_call_status = status
            lead.last_call_outcome = analysis.get('outcome')
            lead.save()
            
            # Send notification for interested leads
            if analysis.get('outcome') == 'interested':
                send_notification(lead, call)
        
        return JsonResponse({'success': True, 'message': 'Webhook processed'})
    except Exception as e:
        logger.error(f'Webhook error: {e}')
        return JsonResponse({'error': str(e)}, status=500)
```

---

## Environment Configuration

### .env for your main application

```env
# AI Call Agent Service
AI_SERVICE_URL=http://localhost:8000
AI_SERVICE_TIMEOUT=30000

# Webhook Configuration
WEBHOOK_SECRET=your_webhook_secret_key
```

---

## Error Handling Best Practices

```javascript
// Retry logic example
async function makeCallWithRetry(phone, name, company, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await aiAgent.makeCall(phone, name, company);
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
}

// Circuit breaker pattern
class CircuitBreaker {
  constructor(threshold = 5, timeout = 60000) {
    this.failureCount = 0;
    this.threshold = threshold;
    this.timeout = timeout;
    this.state = 'CLOSED';
    this.nextAttempt = Date.now();
  }

  async execute(fn) {
    if (this.state === 'OPEN' && Date.now() < this.nextAttempt) {
      throw new Error('Circuit breaker is OPEN');
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  onSuccess() {
    this.failureCount = 0;
    this.state = 'CLOSED';
  }

  onFailure() {
    this.failureCount++;
    if (this.failureCount >= this.threshold) {
      this.state = 'OPEN';
      this.nextAttempt = Date.now() + this.timeout;
    }
  }
}
```

---

## Testing

### Unit Test Example (Jest)

```javascript
const AICallAgentClient = require('./services/aiCallAgent');
const axios = require('axios');

jest.mock('axios');

describe('AICallAgentClient', () => {
  let client;

  beforeEach(() => {
    client = new AICallAgentClient('http://localhost:8000');
  });

  test('makeCall should return call_id on success', async () => {
    const mockResponse = {
      data: { success: true, call_id: 'call_123' }
    };
    axios.create.mockReturnValue({
      post: jest.fn().mockResolvedValue(mockResponse)
    });

    const result = await client.makeCall('+1234567890', 'John', 'Acme');
    expect(result.call_id).toBe('call_123');
  });
});
```

---

For more information, refer to the main [README.md](../README.md)
