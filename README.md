# LLM Pop Quiz Bench

A web application for running magazine-style personality quizzes against multiple Large Language Models (LLMs) and analyzing their responses. Upload a quiz, select models, and discover how different AI models "think" through personality questions.

## What This Does

LLM Pop Quiz Bench is a full-stack web application that:
- Lets you upload quizzes (or create them from text using AI)
- Runs quizzes across multiple LLM providers (OpenAI, Anthropic, Google, Grok, and more)
- Collects and analyzes each model's answers and reasoning
- Generates comprehensive reports with charts and insights
- Stores all results in MongoDB (if configured) or disk-based storage (fallback)
- Automatically migrates existing SQLite databases to the new storage

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
   
   # Optional: Configure MongoDB (falls back to disk-based storage if not set)
   # MONGODB_URI=mongodb://localhost:27017
   # MONGODB_DB_NAME=quizbench
   ```

4. **Start the application**
   ```bash
   uvicorn llm_pop_quiz_bench.api.app:app --reload
   ```

5. **Open your browser**
   
   Navigate to: http://127.0.0.1:8000

## Usage

### Public Rankings Homepage

The public homepage leads with the deception spectrum and overall leaderboard,
filtered to the Humanity's Last Exam (HLE) model group when available. It shares
the renderer and `/deception.json` snapshot (with a live API fallback) with the
full deception rankings page. The release-date timeline and experiment/motive
breakdowns stay on `/ai-deception-rankings`; personality rankings remain at
`/rankings`.

### Experiment Versions

Admin defaults to the latest working version of each experiment family, while
public rankings stay pinned to the versions explicitly selected for publication.
Each model contributes one latest complete attempt per version; attempts are not
averaged and answers from different versions are never substituted.

Validate new prompts locally before deploying or spending on broad coverage:

```bash
.venv/bin/python scripts/run_experiments_local.py --experiments shutdown_pressure_v4
```

This previews exact prompts without provider calls. Add `--run` and `--models`
for a narrow real-provider check; local results do not affect production.
In admin, inspect **Prompts**, run missing models for the selected version,
then **Preview selected versions** before publishing. Publication changes the
public API selection and requests the configured Pages deploy hook; without
`RANKINGS_DEPLOY_HOOK_URL`, rebuild the static site manually.
Publication switches versions site-wide for all groups, not the selected model
group. Preview enables Publish when at least one model has full valid coverage;
other models stay hidden until they complete those same versions.
Site-wide publishing has its own panel above the testing controls. Use the
admin's **All models** option to inspect coverage across the entire catalogue,
including models outside the curated groups; selection alone starts no runs.
All admin test launches use one attempt per model, including personality tests.
Use **Force** for a deliberate rerun; there is no automatic repeats selector.
Individual deception conditions display ticks/crosses for reported/hidden
mistakes, not 0%/100%. Percentages summarize decisions across multiple conditions,
not repeated samples; missing or invalid answers display a dash.

See [experiment methodology and version workflow](docs/PIZZA_SHOP_PROBATION_EXPERIMENT.md)
for provenance, coverage requirements and rollback.

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
| `OPENROUTER_API_KEY` | OpenRouter API key for admin/official benchmark runs and infra calls (catalogue, pricing) | Required |
| `OPENROUTER_APP_API_KEY` | Separate OpenRouter key for public app runs, so their spend/limits stay isolated. No fallback — required for the app's run path | Required for app runs |
| `OPENAI_API_KEY` | API key for OpenAI (for quiz conversion) | Required for conversion |
| `LLM_POP_QUIZ_ENV` | Environment mode: `real` or `mock` | `real` |
| `LLM_POP_QUIZ_RUNTIME_DIR` | Directory for runtime data and database | `runtime-data/` |
| `LLM_POP_QUIZ_LOG_MAX_BYTES` | Maximum log file size in bytes | `5242880` (5MB) |
| `LLM_POP_QUIZ_LOG_MAX_AGE_HOURS` | Maximum log age in hours | `24` |
| `LLM_POP_QUIZ_LOG_MAX_FILES` | Maximum number of log files to keep | `5` |
| `MONGODB_URI` | MongoDB connection URI (optional) | None (uses disk storage) |
| `MONGODB_DB_NAME` | MongoDB database name | `quizbench` |

### Database Storage

The application supports multiple storage backends with automatic fallback:

1. **MongoDB** (primary): If `MONGODB_URI` is configured and a valid connection can be established, all data is stored in MongoDB.

2. **Disk-based JSONL storage** (fallback): If MongoDB is not available or not configured, data is stored in JSONL files on disk (`runtime-data/db/disk_storage/`).

3. **Automatic Migration**: If an existing SQLite database is detected (`runtime-data/db/quizbench.sqlite3`), it will be automatically migrated to the configured storage backend on first startup. The original SQLite file is backed up as `quizbench.sqlite3.backup`.

### Model Configuration

Models are configured in `config/models.yaml`. You can:
- Add new models
- Set default parameters (temperature, max tokens, etc.)

### Curated Model Groups

All editorial model groups live in [web/static/model-groups.js](./web/static/model-groups.js),
shared by the app, admin console, and public rankings. They must always be
explicit, manually curated lists of exact OpenRouter model IDs.

When reviewing a group, the coding agent must research the relevant models,
verify matching IDs in the live OpenRouter catalogue, and update the hardcoded
list with selection notes and sources. For the low-refusal/uncensored group,
use provider documentation and model cards, not just names or open-weight
status. Do not generate membership using regexes, fuzzy matching, lab prefixes,
catalogue order, or automatic sibling substitutions. Runtime code only filters
the curated list to models available in the current catalogue or results.

Only the objective "Cheapest" and "Most expensive" groups are computed from live
pricing; they are not editorial selections.

Validate all curated IDs and HLE source alignment with:

```bash
node scripts/check-frontier-models.mjs
```

### Runtime Data

All application data is stored in the runtime directory (default: `runtime-data/`):
- `runtime-data/db/` - Database storage (MongoDB, disk-based JSONL, or legacy SQLite)
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

# Test shared frontend model-group selection (Node.js built-in test runner)
node --test tests/model-groups.test.mjs
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

## Architecture

### Application Stack

- **Backend**: FastAPI (Python) with async support
- **Frontend**: Vanilla JavaScript with Web Components
- **Database**: MongoDB (primary) or disk-based JSONL storage (fallback)
- **Server**: Uvicorn

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
