# Azure App Service Startup Command

If Azure is not automatically detecting how to start the application, you can configure a custom startup command directly in the Azure Portal.

## Quick Start - Portal Configuration

1. Go to the **Azure Portal** (https://portal.azure.com)
2. Navigate to your App Service
3. In the left menu, go to **Configuration** → **General settings**
4. In the **Startup Command** field, enter:

```bash
gunicorn llm_pop_quiz_bench.api.app:app --workers 4 --worker-class uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000 --timeout 120 --access-logfile - --error-logfile -
```

5. Click **Save** at the top
6. Restart your App Service

## What This Command Does

This startup command:
- Uses **Gunicorn** as the production WSGI server
- Loads the FastAPI app from `llm_pop_quiz_bench.api.app:app`
- Uses **Uvicorn workers** (required for ASGI/FastAPI applications)
- Runs 4 worker processes for handling concurrent requests
- Binds to port 8000 (Azure's default port)
- Sets a 120-second timeout for long-running requests
- Logs access and errors to stdout (visible in Azure logs)

## Alternative: Using the startup.sh Script

If you prefer to use the `startup.sh` script included in the repository, enter this in the **Startup Command** field instead:

```bash
bash startup.sh
```

Note: The `startup.sh` script contains the same command as above, so both approaches are equivalent.

## Verifying the Configuration

After saving and restarting:

1. Go to **Log stream** in the Azure Portal to watch the startup process
2. You should see Gunicorn starting with output like:
   ```
   [INFO] Starting gunicorn 25.0.0
   [INFO] Listening at: http://0.0.0.0:8000
   [INFO] Using worker: uvicorn.workers.UvicornWorker
   [INFO] Booting worker with pid: XXXX
   ```
3. Access your app at `https://<your-app-name>.azurewebsites.net`
4. Check the health endpoint: `https://<your-app-name>.azurewebsites.net/api/health`

## Common Issues

### Issue: "ModuleNotFoundError: No module named 'llm_pop_quiz_bench'"

**Solution**: Make sure all files are deployed to Azure. The application expects the `llm_pop_quiz_bench` directory to be present at the root of the deployment.

### Issue: "No module named 'uvicorn'"

**Solution**: Ensure `requirements.txt` is in the root directory and contains both `gunicorn` and `uvicorn`. Azure should automatically install dependencies from `requirements.txt` during deployment.

### Issue: App starts but shows "404 Not Found" errors

**Solution**: 
1. Verify the FastAPI app is properly set up in `llm_pop_quiz_bench/api/app.py`
2. Check that the `web` directory with static files is deployed
3. Review application logs for any startup errors

## Using Azure CLI Instead

If you prefer using Azure CLI instead of the portal:

```bash
az webapp config set \
  --resource-group <resource-group-name> \
  --name <app-name> \
  --startup-file "gunicorn llm_pop_quiz_bench.api.app:app --workers 4 --worker-class uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000 --timeout 120 --access-logfile - --error-logfile -"
```

Or to use the startup.sh script:

```bash
az webapp config set \
  --resource-group <resource-group-name> \
  --name <app-name> \
  --startup-file "startup.sh"
```

## Additional Resources

- See [AZURE_DEPLOYMENT.md](./AZURE_DEPLOYMENT.md) for complete deployment instructions
- See [README.md](./README.md) for local development setup
- [Azure App Service Configuration Reference](https://docs.microsoft.com/azure/app-service/configure-common)
