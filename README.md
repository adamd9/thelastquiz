# LLM Pop Quiz Bench

A web application for running magazine-style personality quizzes against multiple Large Language Models (LLMs) and analyzing their responses. Upload a quiz, select models, and discover how different AI models "think" through personality questions.

## What This Does

LLM Pop Quiz Bench is a full-stack web application that:
- Lets you upload quizzes (or create them from text using AI)
- Runs quizzes across multiple LLM providers (OpenAI, Anthropic, Google, Grok, and more)
- Collects and analyzes each model's answers and reasoning
- Generates comprehensive reports with charts and insights
- Stores all results in a SQLite database (location configurable)

## Quick Start

### Prerequisites

- Python 3.11 or higher
- pip (Python package manager)
- API keys for the LLM providers you want to use

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd <repository-directory>
   ```

2. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

3. **Configure environment variables**
   
   Copy the example environment file:
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` and add your API keys:
   ```bash
   OPENROUTER_API_KEY=your_openrouter_key_here
   OPENAI_API_KEY=your_openai_key_here
   LLM_POP_QUIZ_ENV=real
   ```

4. **Start the application**
   ```bash
   uvicorn llm_pop_quiz_bench.api.app:app --reload
   ```

5. **Open your browser**
   
   Navigate to: http://127.0.0.1:8000

## Usage

### Running Quizzes via Web Interface

1. **Dashboard**: View your quiz run history and results
2. **Upload or Create**: Upload a quiz YAML file or convert text to a quiz
3. **Select Models**: Choose which LLMs to test
4. **Review**: See estimated costs and model selections
5. **Run**: Execute the quiz and watch results come in
6. **Results**: View detailed reports with charts and analysis

### Quiz Format

Quizzes are stored as YAML files. See [docs/QUIZ_YAML_SPEC.md](./docs/QUIZ_YAML_SPEC.md) for the complete format specification.

Example quizzes are available in the `quizzes/` directory.

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `OPENROUTER_API_KEY` | API key for OpenRouter service | Required |
| `OPENAI_API_KEY` | API key for OpenAI (for quiz conversion) | Required for conversion |
| `LLM_POP_QUIZ_ENV` | Environment mode: `real` or `mock` | `real` |
| `LLM_POP_QUIZ_RUNTIME_DIR` | Directory for runtime data and database | `runtime-data/` |
| `LLM_POP_QUIZ_LOG_MAX_BYTES` | Maximum log file size in bytes | `5242880` (5MB) |
| `LLM_POP_QUIZ_LOG_MAX_AGE_HOURS` | Maximum log age in hours | `24` |
| `LLM_POP_QUIZ_LOG_MAX_FILES` | Maximum number of log files to keep | `5` |

### Model Configuration

Models are configured in `config/models.yaml`. You can:
- Add new models
- Create custom model groups
- Set default parameters (temperature, max tokens, etc.)

### Runtime Data

All application data is stored in the runtime directory (default: `runtime-data/`):
- `runtime-data/db/quizbench.sqlite3` - SQLite database with all quiz runs and results
- `runtime-data/assets/<run_id>/` - Generated reports, charts, and visualizations
- `runtime-data/logs/` - Application logs

## Development

### Running Tests

```bash
# Run all tests
pytest

# Run with coverage
pytest --cov=llm_pop_quiz_bench

# Run specific test file
pytest tests/test_specific.py
```

### Code Quality

```bash
# Check code style
ruff check .

# Format code
ruff format .
```

### Local Development Server

For development with auto-reload:
```bash
uvicorn llm_pop_quiz_bench.api.app:app --reload --host 0.0.0.0 --port 8000
```

## Deployment to Azure App Service

### Prerequisites

- Azure account with active subscription
- Azure CLI installed (`az` command)

### Quick Deployment

1. **Create Azure resources**
   ```bash
   # Login to Azure
   az login
   
   # Create resource group
   az group create --name <resource-group> --location eastus
   
   # Create App Service plan
   az appservice plan create \
     --name <plan-name> \
     --resource-group <resource-group> \
     --sku B1 \
     --is-linux
   
   # Create Web App
   az webapp create \
     --resource-group <resource-group> \
     --plan <plan-name> \
     --name <app-name> \
     --runtime "PYTHON:3.12"
   ```

2. **Configure startup command**
   ```bash
   az webapp config set \
     --resource-group <resource-group> \
     --name <app-name> \
     --startup-file "bash startup.sh"
   ```

3. **Set environment variables**
   ```bash
   az webapp config appsettings set \
     --resource-group <resource-group> \
     --name <app-name> \
     --settings \
       OPENROUTER_API_KEY="<your-key>" \
       OPENAI_API_KEY="<your-key>" \
       LLM_POP_QUIZ_ENV="real" \
       LLM_POP_QUIZ_RUNTIME_DIR="/home/runtime-data"
   ```

4. **Deploy from GitHub**
   ```bash
   az webapp deployment source config \
     --resource-group <resource-group> \
     --name <app-name> \
     --repo-url <your-github-repo-url> \
     --branch main \
     --manual-integration
   ```

### Alternative: Azure Portal Configuration

If you prefer using the Azure Portal:

1. Navigate to your App Service in the Azure Portal
2. Go to **Configuration** → **General settings**
3. Set **Startup Command** to: `bash startup.sh`
4. Go to **Configuration** → **Application settings**
5. Add the required environment variables
6. Click **Save** and restart the app

### Verifying Deployment

After deployment:
- Visit: `https://<your-app-name>.azurewebsites.net`
- Check health: `https://<your-app-name>.azurewebsites.net/api/health`

To view logs:
```bash
az webapp log tail --resource-group <resource-group> --name <app-name>
```

## Architecture

### Application Stack

- **Backend**: FastAPI (Python) with async support
- **Frontend**: Vanilla JavaScript with Web Components
- **Database**: SQLite for local storage
- **Server**: Gunicorn with Uvicorn workers (production) or Uvicorn (development)

### API Endpoints

The application provides a REST API:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Health check |
| `/api/models` | GET | List available models |
| `/api/models/user-models` | GET | Fetch user's OpenRouter models |
| `/api/quizzes` | GET/POST | List or create quizzes |
| `/api/quizzes/{id}` | GET/DELETE | Get or delete a quiz |
| `/api/runs` | GET/POST | List or create quiz runs |
| `/api/runs/{id}` | GET | Get run details |
| `/api/runs/{id}/assets` | GET | Get run assets (reports, charts) |
| `/api/convert-quiz` | POST | Convert text to quiz YAML |

### Frontend Structure

```
web/
├── index.html          # Main HTML shell
└── static/
    ├── app.js          # Main application entry point
    ├── styles.css      # Application styles
    ├── components/     # Web components
    └── logo.png        # Application logo
```

## Troubleshooting

### Common Issues

**Issue**: "ModuleNotFoundError: No module named 'llm_pop_quiz_bench'"
- **Solution**: Make sure you're running from the project root directory and dependencies are installed

**Issue**: "Database is locked" error
- **Solution**: Only one process can write to SQLite at a time. Make sure you don't have multiple instances running

**Issue**: API keys not working
- **Solution**: Check your `.env` file is in the project root and contains valid API keys

**Issue**: Port 8000 already in use
- **Solution**: Either stop the other process using port 8000, or run on a different port:
  ```bash
  uvicorn llm_pop_quiz_bench.api.app:app --port 8001
  ```

### Getting Help

- Check application logs in `runtime-data/logs/`
- Review API responses in browser developer tools
- For Azure deployment issues, check Azure App Service logs

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run tests and linting
5. Commit your changes (`git commit -m 'Add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

## License

[Add your license information here]

## Support

For issues, questions, or contributions, please open an issue on GitHub.
