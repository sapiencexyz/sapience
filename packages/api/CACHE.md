# API Cache development notes
## Setup
Add the following to the .env file:

```
STORAGE_PATH=./storage
SAVE_STORAGE=true
``` 

## Usage
Just use it, when it runs it will create the storage folder and file if it doesn't exist.

## Refresh
To do a hard refresh, use the following endpoint:
http://localhost:3001/cache/refresh?hardInitialize=true

To do a soft refresh, use the following endpoint:
http://localhost:3001/cache/refresh?hardInitialize=false




