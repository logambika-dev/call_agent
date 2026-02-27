import logging
from fastapi import FastAPI, status, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import (
    RequestValidationError,
    ValidationException,
    HTTPException,
)
from fastapi.staticfiles import StaticFiles
import os

# from backend.config.lifespan import lifespan
from route.index import router as api_routes
from utils.pydanticToFormError import pydantic_to_form_error

# Initialize logging
logger = logging.getLogger(__name__)

app= FastAPI(
    title="AI SDR",
    description="AI SDR",
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    contact={"name": "Developer - Infynd", "url": "https://www.infynd.com/"},
    # lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount assets directory
# Going up 3 levels from backend/app.py to reach AISDR-BE root where assets folder is located
# asets_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "assets")
# if os.path.exists(assets_path):
#     app.mount("/assets", StaticFiles(directory=assets_path), name="assets")
# else:
#     # logger.warning(f"Assets directory not found at {assets_path}")
#     pass


@app.get("/")
async def health_check():
    return {"status": "AI running", "service": "Python AI Service"}

@app.middleware("http")

async def add_checker(request: Request, call_next):
    logger.info(f"Incoming Request: {request.method} {request.url.path}")
    data = await request.body()
    if data:
        logger.debug(f"Request Body: {data}")
    response = await call_next(request)
    logger.info(f"Response Status: {response.status_code} for {request.method} {request.url.path}")
    return response


@app.exception_handler(Exception)
async def catch_all_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"success": False, "message": "Internal Server Error"},
    )


@app.exception_handler(HTTPException)
async def catch_all_http_exceptions(request: Request, exc: HTTPException):

    return JSONResponse(
        exc.detail,
        status_code=exc.status_code,
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: ValidationException):
    lang = request.query_params.get("lang")
    return JSONResponse(
        {"success": False, "errors": pydantic_to_form_error(exc.errors(), lang)},
        status_code=400,
    )


app.include_router(prefix="/api", router=api_routes)