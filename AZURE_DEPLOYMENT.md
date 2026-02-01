# Azure Web App Service Deployment Guide

This guide explains how to deploy the LLM Pop Quiz Bench application to Azure Web App Service.

## Prerequisites

- Azure account with an active subscription
- Azure CLI installed (`az` command)
- Python 3.11+ runtime

## Deployment Steps

### 1. Create an Azure Web App

```bash
# Login to Azure
az login

# Create a resource group (if you don't have one)
az group create --name <resource-group-name> --location <location>

# Create an App Service plan (Linux)
az appservice plan create \
  --name <app-service-plan-name> \
  --resource-group <resource-group-name> \
  --sku B1 \
  --is-linux

# Create the Web App with Python 3.11
az webapp create \
  --resource-group <resource-group-name> \
  --plan <app-service-plan-name> \
  --name <app-name> \
  --runtime "PYTHON:3.11"
```

### 2. Configure Application Settings

Set the required environment variables and startup command:

```bash
# Configure the startup command (IMPORTANT: This tells Azure how to start your app)
az webapp config set \
  --resource-group <resource-group-name> \
  --name <app-name> \
  --startup-file "startup.sh"

# Set application settings (environment variables)
az webapp config appsettings set \
  --resource-group <resource-group-name> \
  --name <app-name> \
  --settings \
    OPENROUTER_API_KEY="<your-openrouter-api-key>" \
    OPENAI_API_KEY="<your-openai-api-key>" \
    LLM_POP_QUIZ_ENV="real" \
    LLM_POP_QUIZ_RUNTIME_DIR="/home/runtime-data" \
    LLM_POP_QUIZ_LOG_MAX_BYTES="5242880" \
    LLM_POP_QUIZ_LOG_MAX_AGE_HOURS="24" \
    LLM_POP_QUIZ_LOG_MAX_FILES="5"
```

### 3. Deploy the Application

There are several ways to deploy:

#### Option A: Deploy from Local Git

```bash
# Configure local git deployment
az webapp deployment source config-local-git \
  --resource-group <resource-group-name> \
  --name <app-name>

# Get the deployment URL
az webapp deployment list-publishing-credentials \
  --resource-group <resource-group-name> \
  --name <app-name> \
  --query scmUri \
  --output tsv

# Add Azure remote and push
git remote add azure <deployment-url>
git push azure main:master
```

#### Option B: Deploy from GitHub

```bash
# Configure GitHub deployment
az webapp deployment source config \
  --resource-group <resource-group-name> \
  --name <app-name> \
  --repo-url <your-github-repo-url> \
  --branch main \
  --manual-integration
```

#### Option C: Deploy using ZIP

```bash
# Create a zip file of your repository
zip -r app.zip . -x "*.git*" -x "*__pycache__*" -x "*.env" -x "runtime-data/*"

# Deploy the zip file
az webapp deployment source config-zip \
  --resource-group <resource-group-name> \
  --name <app-name> \
  --src app.zip
```

### 4. Configure Persistent Storage (Optional but Recommended)

For storing runtime data persistently across deployments:

```bash
# Enable persistent storage
az webapp config appsettings set \
  --resource-group <resource-group-name> \
  --name <app-name> \
  --settings WEBSITES_ENABLE_APP_SERVICE_STORAGE=true
```

### 5. Configure Logging

```bash
# Enable application logging
az webapp log config \
  --resource-group <resource-group-name> \
  --name <app-name> \
  --application-logging filesystem \
  --level information

# Stream logs
az webapp log tail \
  --resource-group <resource-group-name> \
  --name <app-name>
```

### 6. Verify Deployment

After deployment, access your application at:
```
https://<app-name>.azurewebsites.net
```

Check the health endpoint:
```
https://<app-name>.azurewebsites.net/api/health
```

## Application Structure

The application has been configured for Azure Web App Service with the following files:

- **`startup.sh`**: Startup script that launches the application using Gunicorn with Uvicorn workers. This script must be configured as the startup command in Azure (see deployment steps above).
- **`app.py`**: Root-level entry point that imports the FastAPI application, making it easier for Azure and other platforms to locate the app.
- **`requirements.txt`**: Python dependencies including `gunicorn` for production deployment.

## Environment Variables

Key environment variables for the application:

- `PORT`: Set automatically by Azure (default: 8000)
- `OPENROUTER_API_KEY`: API key for OpenRouter service
- `OPENAI_API_KEY`: API key for OpenAI service
- `LLM_POP_QUIZ_ENV`: Environment mode (`real` or `mock`)
- `LLM_POP_QUIZ_RUNTIME_DIR`: Directory for runtime data
- `WEBSITES_ENABLE_APP_SERVICE_STORAGE`: Azure setting for persistent storage

## Scaling

To scale your application:

```bash
# Scale up (vertical scaling - increase resources)
az appservice plan update \
  --resource-group <resource-group-name> \
  --name <app-service-plan-name> \
  --sku P1V2

# Scale out (horizontal scaling - increase instances)
az appservice plan update \
  --resource-group <resource-group-name> \
  --name <app-service-plan-name> \
  --number-of-workers 3
```

## Monitoring

Monitor your application using Azure Application Insights:

```bash
# Enable Application Insights
az monitor app-insights component create \
  --app <app-insights-name> \
  --location <location> \
  --resource-group <resource-group-name>

# Connect to your Web App
az webapp config appsettings set \
  --resource-group <resource-group-name> \
  --name <app-name> \
  --settings APPLICATIONINSIGHTS_CONNECTION_STRING="<connection-string>"
```

## Troubleshooting

### View Application Logs

```bash
# Tail logs in real-time
az webapp log tail \
  --resource-group <resource-group-name> \
  --name <app-name>

# Download logs
az webapp log download \
  --resource-group <resource-group-name> \
  --name <app-name> \
  --log-file logs.zip
```

### Common Issues

1. **App not starting**: Check the startup logs using `az webapp log tail`
2. **Dependencies not installed**: Ensure `requirements.txt` is in the root directory
3. **Port binding issues**: Azure automatically sets the PORT environment variable
4. **Runtime data not persisting**: Enable persistent storage with `WEBSITES_ENABLE_APP_SERVICE_STORAGE=true`

## Cost Optimization

- Use the **Free (F1)** or **Basic (B1)** tier for development/testing
- Use **Standard (S1)** or higher for production workloads
- Enable auto-scaling based on CPU/memory metrics
- Consider using Azure Container Instances for sporadic workloads

## Security Best Practices

1. Store API keys in Azure Key Vault instead of app settings
2. Enable HTTPS only
3. Configure authentication/authorization if needed
4. Use managed identities for Azure resource access
5. Enable diagnostic logging for security monitoring

## Additional Resources

- [Azure App Service Documentation](https://docs.microsoft.com/azure/app-service/)
- [Python on Azure App Service](https://docs.microsoft.com/azure/app-service/quickstart-python)
- [Azure CLI Reference](https://docs.microsoft.com/cli/azure/)
