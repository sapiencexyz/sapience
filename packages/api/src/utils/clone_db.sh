#!/bin/bash


# Define tables that should be filtered by timestamp
TIMESTAMP_FILTER_TABLES=()
# Reset environment variables if they are already set
unset DB_HOST DB_NAME DB_NAME_LOCAL DB_USER DB_PASSWORD LOCAL_USER BACKUP_DIR

# Parse command line arguments
SKIP_IF_EXISTS=false
TIMESTAMP_FROM=""
TIMESTAMP_TO=""
INCLUDE_CANDLES=false
INCLUDE_PRICES=false
BACKUP_DIR="./db_backups"

while [[ $# -gt 0 ]]; do
    case $1 in
        --skip-if-exists)
            SKIP_IF_EXISTS=true
            shift
            ;;
        --timestamp-from)
            TIMESTAMP_FROM="$2"
            shift 2
            ;;
        --timestamp-to)
            TIMESTAMP_TO="$2"
            shift 2
            ;;
        --include-candles)
            INCLUDE_CANDLES=true
            shift
            ;;
        --include-prices)
            INCLUDE_PRICES=true
            shift
            ;;
        --help|-h)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --skip-if-exists        Stop execution if dump file already exists (exit code 1)"
            echo "  --timestamp-from TIME   Filter timestamp and createdAt columns from this time (Unix timestamp)"
            echo "  --timestamp-to TIME     Filter timestamp and createdAt columns to this time (Unix timestamp)"
            echo "  --include-candles       Include cache_candle table in timestamp filtering"
            echo "  --include-prices        Include resource_price table in timestamp filtering"
            echo "  --help, -h              Show this help message"
            echo ""
            echo "Examples:"
            echo "  $0                                    # Download fresh schema dump"
            echo "  $0 --skip-if-exists                   # Stop if dump exists, otherwise download"
            echo "  $0 --timestamp-from 1640995200 --timestamp-to 1641081600  # Filter by timestamp range"
            echo "  $0 --include-candles --include-prices # Include both tables in filtering"
            echo "  $0 --timestamp-from 1749352892 --timestamp-to 1751858492 --include-prices --include-candles # Filter by timestamp range and include both tables"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

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
    echo "BACKUP_DIR=your_backup_directory"
    exit 1
fi

# Validate required environment variables
if [ -z "$DB_HOST" ] || [ -z "$DB_NAME" ] || [ -z "$DB_NAME_LOCAL" ] || [ -z "$DB_USER" ] || [ -z "$DB_PASSWORD" ] || [ -z "$LOCAL_USER" ] || [ -z "$BACKUP_DIR" ]; then
    echo "ERROR: Missing required environment variables. Please check your .env file contains:"
    echo "DB_HOST, DB_NAME, DB_NAME_LOCAL, DB_USER, DB_PASSWORD, LOCAL_USER, BACKUP_DIR"
    exit 1
fi

echo "BACKUP_DIR: $BACKUP_DIR"

# Build the timestamp filter tables array based on flags
if [ "$INCLUDE_CANDLES" = true ]; then
    echo "Including cache_candle table in timestamp filtering"
    TIMESTAMP_FILTER_TABLES+=("cache_candle")
else
    echo "Excluding cache_candle table from timestamp filtering"
fi

if [ "$INCLUDE_PRICES" = true ]; then
    echo "Including resource_price table in timestamp filtering"
    TIMESTAMP_FILTER_TABLES+=("resource_price")
else
    echo "Excluding resource_price table from timestamp filtering"
fi

echo "Timestamp filter tables: ${TIMESTAMP_FILTER_TABLES[*]}"

# Create backup directory if it doesn't exist
mkdir -p $BACKUP_DIR
cd $BACKUP_DIR
echo "===== Starting database cloning process ====="

# Check if dump file already exists
if [ -f "complete_dump.sql" ]; then
    if [ "$SKIP_IF_EXISTS" = true ]; then
        echo "Dump file complete_dump.sql already exists and --skip-if-exists flag is set."
        echo "Stopping execution as requested."
        exit 1
    else
        echo "Dump file complete_dump.sql already exists. Overwriting with fresh dump..."
    fi
else
    echo "No existing dump file found. Creating new dump..."
fi

# Export database schema only (no data), including indices and constraints
echo "Exporting database schema, indices, and constraints (no data)..."
PGSSLMODE=require PGPASSWORD=$DB_PASSWORD pg_dump -C --no-owner --no-acl --no-comments --schema-only -U $DB_USER -h $DB_HOST -d $DB_NAME \
  -f complete_dump.sql  --exclude-table-data="*_seq" -v

# Extract constraints to add back later
echo "Extracting constraints for later addition..."
PGSSLMODE=require PGPASSWORD=$DB_PASSWORD pg_dump -C --no-owner --no-acl --no-comments --schema-only -U $DB_USER -h $DB_HOST -d $DB_NAME \
  --exclude-table-data="*_seq" | awk '/^(ALTER TABLE|CREATE UNIQUE INDEX|CREATE INDEX)/ { 
      line = $0; 
      while (!match(line, /;$/)) { 
        getline next_line; 
        line = line "\n" next_line; 
      } 
      print line; 
    }' > constraints.sql

# Check if the dump file was created
if [ ! -f "complete_dump.sql" ]; then
  echo "ERROR: Database schema dump failed. Please check your credentials and permissions."
  exit 1
fi

# Fix locale issues in dump file
echo "Fixing locale settings in dump file..."
sed -i '' "s/en_US.UTF8/en_US.UTF-8/g" "complete_dump.sql" 2>/dev/null || true

# Remove constraints from the dump file to avoid constraint violations during data insertion
echo "Removing constraints from dump file..."
awk '
/^(ALTER TABLE|CREATE UNIQUE INDEX|CREATE INDEX)/ {
    # Skip this line and continue reading until we find a semicolon
    while (!match($0, /;$/)) {
        getline;
    }
    next;  # Skip the line with semicolon too
}
{ print }  # Print all other lines
' complete_dump.sql > complete_dump_temp.sql && mv complete_dump_temp.sql complete_dump.sql

# Remove the backslash from the last line with visible characters before adding data
echo "Preparing dump file for data addition..."

# remove backslash line
sed -i '$ d' complete_dump.sql


# Fetch data for tables with timestamp columns and other tables
echo "Fetching filtered data for tables..."



# Get list of tables with timestamp columns and their data types
echo "Identifying tables with timestamp columns and their types..."
TIMESTAMP_TABLES_INFO=$(PGSSLMODE=require PGPASSWORD=$DB_PASSWORD psql -U $DB_USER -h $DB_HOST -d $DB_NAME -t -c "
SELECT table_name, data_type 
FROM information_schema.columns 
WHERE column_name = 'timestamp' 
    AND table_schema = 'public'
ORDER BY table_name;" | awk -F'|' 'NF {gsub(/^[ \t]+|[ \t]+$/, "", $1); gsub(/^[ \t]+|[ \t]+$/, "", $2); print $1 "|" $2}')

ALL_TABLES=$(PGSSLMODE=require PGPASSWORD=$DB_PASSWORD psql -U $DB_USER -h $DB_HOST -d $DB_NAME -t -c "
SELECT DISTINCT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
    AND table_type = 'BASE TABLE'
    AND table_name NOT LIKE 'pg_%'
    AND table_name NOT LIKE 'information_schema%'
ORDER BY table_name;")

echo -e "ALL_TABLES: \n $ALL_TABLES" 
echo -e "TIMESTAMP_TABLES_INFO: \n $TIMESTAMP_TABLES_INFO" 

# Process tables with timestamp columns
while IFS='|' read -r table data_type; do
    if [ -n "$table" ] && [ -n "$data_type" ]; then
        table=$(echo $table | xargs)  # Remove whitespace
        data_type=$(echo $data_type | xargs)  # Remove whitespace
        
        # Check if this table is in our filter list
        should_filter=false
        for filter_table in "${TIMESTAMP_FILTER_TABLES[@]}"; do
            if [ "$table" = "$filter_table" ]; then
                should_filter=true
                break
            fi
        done
        
        echo "Processing table: $table (timestamp type: $data_type, should filter: $should_filter)"
        
        # Build appropriate WHERE clause based on data type and filter list
        TIMESTAMP_WHERE=""
        if [ "$should_filter" = true ] && ([ -n "$TIMESTAMP_FROM" ] || [ -n "$TIMESTAMP_TO" ]); then
            if [ "$data_type" = "timestamp" ] || [ "$data_type" = "timestamp without time zone" ]; then
                # For timestamp columns, convert Unix timestamp to timestamp
                if [ -n "$TIMESTAMP_FROM" ] && [ -n "$TIMESTAMP_TO" ]; then
                    TIMESTAMP_WHERE="WHERE timestamp >= to_timestamp($TIMESTAMP_FROM) AND timestamp <= to_timestamp($TIMESTAMP_TO)"
                elif [ -n "$TIMESTAMP_FROM" ]; then
                    TIMESTAMP_WHERE="WHERE timestamp >= to_timestamp($TIMESTAMP_FROM)"
                elif [ -n "$TIMESTAMP_TO" ]; then
                    TIMESTAMP_WHERE="WHERE timestamp <= to_timestamp($TIMESTAMP_TO)"
                fi
            else
                # For integer/bigint columns, compare directly
                if [ -n "$TIMESTAMP_FROM" ] && [ -n "$TIMESTAMP_TO" ]; then
                    TIMESTAMP_WHERE="WHERE timestamp >= $TIMESTAMP_FROM AND timestamp <= $TIMESTAMP_TO"
                elif [ -n "$TIMESTAMP_FROM" ]; then
                    TIMESTAMP_WHERE="WHERE timestamp >= $TIMESTAMP_FROM"
                elif [ -n "$TIMESTAMP_TO" ]; then
                    TIMESTAMP_WHERE="WHERE timestamp <= $TIMESTAMP_TO"
                fi
            fi
        fi
        
        # Create COPY statement for timestamp-filtered data
        echo "\\copy public.\"$table\" FROM stdin;" >> complete_dump.sql
        
        # Export data with timestamp filtering
        if [ -n "$TIMESTAMP_WHERE" ]; then
            PGSSLMODE=require PGPASSWORD=$DB_PASSWORD psql -U $DB_USER -h $DB_HOST -d $DB_NAME -c "
                COPY (SELECT * FROM public.\"$table\" $TIMESTAMP_WHERE) TO STDOUT;
            " --csv >> complete_dump.sql
        else
            # No timestamp filter, get all data
            PGSSLMODE=require PGPASSWORD=$DB_PASSWORD psql -U $DB_USER -h $DB_HOST -d $DB_NAME -c "
                COPY public.\"$table\" TO STDOUT;
            " --csv >> complete_dump.sql
        fi
        
        echo "\\." >> complete_dump.sql
    fi
done <<< "$TIMESTAMP_TABLES_INFO"

# Process other tables (without timestamp column)
echo '-- Data for tables without timestamp columns' >> complete_dump.sql

for table in $ALL_TABLES; do
    table=$(echo $table | xargs)  # Remove whitespace
    if [ -n "$table" ]; then
        # Check if this table has a timestamp column
        has_timestamp=$(echo "$TIMESTAMP_TABLES_INFO" | grep -w "$table" || echo "")
        
        if [ -z "$has_timestamp" ]; then
            echo "Fetching data for table: $table"
            
            # Create COPY statement for data
            echo "\\copy public.\"$table\" FROM stdin;" >> complete_dump.sql
            
            # Export all data
            PGSSLMODE=require PGPASSWORD=$DB_PASSWORD psql -U $DB_USER -h $DB_HOST -d $DB_NAME -c "
                COPY public.\"$table\" TO STDOUT;
            " --csv >> complete_dump.sql
            
            echo "\\." >> complete_dump.sql
        fi
    fi
done

# Add constraints back after data insertion
echo "Adding constraints back to dump file..."
cat constraints.sql >> complete_dump.sql

# Add final backslash to indicate dump is complete
# echo "\\" >> complete_dump.sql

# Clean up constraints file
rm -f constraints.sql

echo "===== Database schema and filtered data cloning completed ====="
echo "Schema and data dump file created: $BACKUP_DIR/complete_dump.sql"
echo "Run restore_db.sh to restore the database locally."
cd -