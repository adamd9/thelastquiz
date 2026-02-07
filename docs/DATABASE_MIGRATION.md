# Database Migration Guide

This guide explains the database storage options and migration process for LLM Pop Quiz Bench.

## Storage Backends

The application supports three storage backends with automatic fallback:

### 1. MongoDB (Recommended for Production)

MongoDB provides scalable, production-ready storage with excellent performance.

**Setup:**
```bash
# Add to your .env file
MONGODB_URI=mongodb://localhost:27017
MONGODB_DB_NAME=quizbench  # Optional, defaults to 'quizbench'
```

**Requirements:**
- pymongo package (automatically installed with requirements.txt)
- Running MongoDB instance

**Connection Logging:**
The application logs all database connection attempts and selections to `runtime-data/logs/database.log` and console output. You'll see messages like:
- `MONGODB_URI configured, attempting connection...`
- `MongoDB connection test successful`
- `Using MongoDB backend (database: quizbench)`

### 2. Disk-based JSONL Storage (Default Fallback)

If MongoDB is not available, the application automatically falls back to disk-based storage using JSONL files.

**Features:**
- No external dependencies
- Simple file-based storage
- Good for development and small deployments
- Data stored in: `runtime-data/db/disk_storage/`

**Connection Logging:**
You'll see console messages like:
- `No MONGODB_URI configured, using disk storage`
- Or: `MongoDB connection failed, falling back to disk storage`
- `Using disk-based storage at: runtime-data/db/disk_storage`

**Files created:**
- `quizzes.jsonl` - Quiz definitions
- `runs.jsonl` - Quiz run metadata
- `results.jsonl` - Quiz results
- `assets.jsonl` - Asset references

### 3. Legacy SQLite Support

SQLite databases from previous versions are automatically migrated to the new storage backend on first startup.

## Automatic Migration

The application automatically detects and migrates existing SQLite databases.

### Migration Process

1. **Detection**: On startup, the application checks for an existing SQLite database at `runtime-data/db/quizbench.sqlite3`

2. **Target Selection**: 
   - If `MONGODB_URI` is configured and valid, migrates to MongoDB
   - Otherwise, migrates to disk-based JSONL storage

3. **Data Transfer**: All data is transferred:
   - Quizzes (definitions and metadata)
   - Runs (quiz execution records)
   - Results (model responses)
   - Assets (report references)

4. **Backup**: The original SQLite file is renamed to `quizbench.sqlite3.backup`

5. **Migration Marker**: A `.migrated` file is created to prevent re-migration

### Migration Logging

During migration, detailed progress is logged to both console and `runtime-data/logs/database.log`:
- `Starting migration from SQLite database: <path>`
- `Migrating X quizzes...`
- `Migrating X runs...`
- `Migrated X results`
- `Migrated X assets`
- `Migration completed successfully. SQLite backup saved to: <path>`

**To verify migration occurred**, check:
1. Console output during application startup
2. The `runtime-data/logs/database.log` file
3. Presence of `runtime-data/db/.migrated` marker file
4. Presence of `runtime-data/db/quizbench.sqlite3.backup` backup file

### Manual Migration

If you need to manually trigger a migration:

```python
from pathlib import Path
from llm_pop_quiz_bench.core.db_factory import connect

# The migration happens automatically on first connect
db_path = Path('runtime-data/db/quizbench.sqlite3')
db = connect(db_path)
db.close()

print("Migration complete!")
```

## Switching Storage Backends

### From Disk to MongoDB

1. Set up MongoDB and configure `MONGODB_URI` in `.env`
2. Stop the application
3. Remove the migration marker: `rm runtime-data/db/.migrated`
4. Restore the SQLite backup: `mv runtime-data/db/quizbench.sqlite3.backup runtime-data/db/quizbench.sqlite3`
5. Start the application - it will migrate to MongoDB

### From MongoDB to Disk

1. Remove `MONGODB_URI` from `.env`
2. Stop the application
3. Remove the migration marker: `rm runtime-data/db/.migrated`
4. Restore the SQLite backup: `mv runtime-data/db/quizbench.sqlite3.backup runtime-data/db/quizbench.sqlite3`
5. Start the application - it will migrate to disk storage

## Troubleshooting

### Checking Database Connection Status

To verify which database backend is being used:

1. **Check console output** when the application starts - look for `[DB]` prefixed messages
2. **Check the log file** at `runtime-data/logs/database.log`
3. **Look for these indicators:**
   - MongoDB: `Using MongoDB backend (database: quizbench)`
   - Disk storage: `Using disk-based storage at: <path>`
   - Fallback: `MongoDB connection failed, falling back to disk storage`

### Migration Not Happening

- Check that `runtime-data/db/quizbench.sqlite3` exists
- Verify no `.migrated` marker exists
- Check `runtime-data/logs/database.log` for migration messages
- Look for console output with `[DB]` prefix

### MongoDB Connection Issues

If MongoDB connection fails, the application automatically falls back to disk storage. Check:
- MongoDB is running: `mongosh --eval "db.version()"`
- Connection string is correct in `.env`
- Network connectivity to MongoDB server
- Look for error details in `runtime-data/logs/database.log`
- Check console output for connection failure messages like:
  - `MongoDB connection test failed: <error details>`
  - `MongoDB connection failed, falling back to disk storage`

### Data Loss Concerns

- Original SQLite database is always backed up before migration
- To restore: `mv runtime-data/db/quizbench.sqlite3.backup runtime-data/db/quizbench.sqlite3`
- Remove `.migrated` marker and restart

## Performance Considerations

- **MongoDB**: Best for production, handles concurrent access well
- **Disk Storage**: Good for development, single-user scenarios
- **SQLite**: Legacy only, not used for new installations

## MongoDB Setup Examples

### Local Development

```bash
# Using Docker
docker run -d -p 27017:27017 --name mongodb mongo:latest

# Add to .env
MONGODB_URI=mongodb://localhost:27017
```

### MongoDB Atlas (Cloud)

```bash
# Add to .env (replace with your connection string)
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/?retryWrites=true&w=majority
MONGODB_DB_NAME=quizbench
```

### Docker Compose

```yaml
version: '3.8'
services:
  mongodb:
    image: mongo:latest
    ports:
      - "27017:27017"
    volumes:
      - mongodb_data:/data/db

volumes:
  mongodb_data:
```

## Backup Strategies

### MongoDB Backup

```bash
# Backup
mongodump --uri="mongodb://localhost:27017" --db=quizbench --out=/backup

# Restore
mongorestore --uri="mongodb://localhost:27017" --db=quizbench /backup/quizbench
```

### Disk Storage Backup

```bash
# Backup
tar -czf backup.tar.gz runtime-data/db/disk_storage/

# Restore
tar -xzf backup.tar.gz
```
