"""
Root-level entry point for Azure Web App Service.
This file makes it easier for Azure to locate the FastAPI application.
"""
from llm_pop_quiz_bench.api.app import app

__all__ = ["app"]
