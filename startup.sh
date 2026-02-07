#!/bin/bash
# Azure Web App Service startup script

# Set default port if not provided
export PORT="${PORT:-8000}"

# Start the application with gunicorn
gunicorn llm_pop_quiz_bench.api.app:app \
    --worker-class uvicorn.workers.UvicornWorker \
    --bind "0.0.0.0:${PORT}" \
    --error-logfile -
