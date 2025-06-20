#!/bin/bash

# Reset environment variables if they are already set
unset DB_HOST DB_NAME DB_NAME_LOCAL DB_USER DB_PASSWORD LOCAL_USER

# Load environment variables from .env file
if [ -f ".env" ]; then
    echo "Loading environment variables from .env file..."
    export $(cat .env | grep -v '^#' | xargs)
else
    echo "ERROR: .env file not found. Please create a .env file with the following variables:"
    echo "DB_HOST=your_host"
    echo "DB_NAME=your_database_name"
    echo "DB_NAME_LOCAL=your_local_database_name"
    echo "DB_USER=your_username"
    echo "DB_PASSWORD=your_password"
    echo "LOCAL_USER=your_local_postgres_user"
    exit 1
fi

# Validate required environment variables
if [ -z "$DB_HOST" ] || [ -z "$DB_NAME" ] || [ -z "$DB_NAME_LOCAL" ] || [ -z "$DB_USER" ] || [ -z "$DB_PASSWORD" ] || [ -z "$LOCAL_USER" ]; then
    echo "ERROR: Missing required environment variables. Please check your .env file contains:"
    echo "DB_HOST, DB_NAME, DB_NAME_LOCAL, DB_USER, DB_PASSWORD, LOCAL_USER"
    exit 1
fi

# Create backup directory if it doesn't exist
mkdir -p ~/db_backups
cd ~/db_backups
echo "===== Starting database backup and restore process ====="

# Step 1: Export database schema and data, ignoring the problematic sequences
echo "Exporting database with schema and data..."
PGSSLMODE=require PGPASSWORD=$DB_PASSWORD pg_dump -C --no-owner --no-acl --no-comments -U $DB_USER -h $DB_HOST -d $DB_NAME \
  --exclude-table-data="*_seq" -f complete_dump.sql -v

# Check if the dump file was created
if [ ! -f "complete_dump.sql" ]; then
  echo "ERROR: Database dump failed. Trying alternative approach..."

  # Alternative: Try to export just tables and their data
  echo "Exporting tables only (no sequences)..."
  PGSSLMODE=require PGPASSWORD=$DB_PASSWORD pg_dump -C --no-owner --no-acl --no-comments -U $DB_USER -h $DB_HOST -d $DB_NAME \
    --schema=public --exclude-schema="pg_*" -f table_dump.sql -v

  if [ -f "table_dump.sql" ]; then
    echo "Tables exported successfully. Using table_dump.sql instead."
    mv table_dump.sql complete_dump.sql
  else
    echo "ERROR: All export attempts failed. Please check your credentials and permissions."
    exit 1
  fi
fi

# Step 2: Fix locale issues in dump file

echo "Fixing locale settings in dump file..."
sed -i '' 's/en_US.UTF8/en_US.UTF-8/g' complete_dump.sql 2>/dev/null || true

# Step 3: Drop and recreate local database
echo "Dropping and recreating local database..."
psql -U $LOCAL_USER -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$DB_NAME_LOCAL';"
psql -U $LOCAL_USER -c "DROP DATABASE IF EXISTS $DB_NAME_LOCAL;"
psql -U $LOCAL_USER -c "CREATE DATABASE $DB_NAME_LOCAL;"


# Step 4: Restore the database
echo "Restoring database to local server..."
psql -U $LOCAL_USER -d $DB_NAME_LOCAL -f complete_dump.sql

# Step 5: Manually reset sequences to match current data
echo "Manually resetting sequences..."
psql -U $LOCAL_USER -d $DB_NAME_LOCAL <<EOF
DO \$\$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT
      table_name,
      column_name,
      pg_get_serial_sequence(table_name, column_name) as seq_name
    FROM
      information_schema.columns
    WHERE
      table_schema = 'public'
      AND column_default LIKE 'nextval%'
  ) LOOP
    IF r.seq_name IS NOT NULL THEN
      EXECUTE format(
        'SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM %I.%I), 1))',
        r.seq_name, r.column_name, 'public', r.table_name
      );
    END IF;
  END LOOP;
END \$\$;
EOF

echo "===== Database backup and restore completed ====="
echo "Your production database has been copied to your local PostgreSQL server."
echo "Use the following connection string in your .env file:"
echo "DATABASE_URL=postgresql://$LOCAL_USER@localhost:5432/$DB_NAME_LOCAL"