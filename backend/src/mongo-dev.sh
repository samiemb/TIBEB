#!/usr/bin/env bash
set -euo pipefail

docker run -d \
  --name tibeb-mongo \
  -p 27017:27017 \
  -v tibeb_mongo_data:/data/db \
  mongo:7

echo "MongoDB started on mongodb://localhost:27017"
