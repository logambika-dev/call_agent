# AISDR Monorepo

AI-powered Sales Development Representative system with call agent capabilities.

## Structure

```
aisdr-monorepo/
├── apps/
│   └── call-agent/          # Main call agent application
│       ├── main.py          # FastAPI entry point
│       ├── routes/          # API endpoints
│       ├── services/        # External integrations
│       ├── agents/          # AI agent logic
│       ├── schemas/         # Pydantic models
│       └── config/          # Configuration
├── shared/
│   └── utils/               # Shared utilities
└── README.md
```

## Setup

1. Install dependencies:
```bash
pip install -r requirements.txt
```

2. Configure environment:
```bash
cp .env.example .env
# Edit .env with your credentials
```

3. Run the application:
```bash
cd apps/call-agent
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

## API Endpoints

- `POST /api/company` - Store company details (data_1)
- `GET /api/company/{id}` - Get company details
- `POST /api/call/complete` - Complete call with client data (data_2)
- `POST /api/email/reply` - Handle email replies and trigger calls

## Services

- **ElevenLabs**: AI voice calls
- **Cal.com**: Meeting scheduling
- **SMTP**: Email notifications
- **Transcript**: Call analysis

## Documentation

See individual service files for detailed documentation.
