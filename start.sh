#!/bin/bash

# Load environment variables
# export $(cat .env | xargs)

# # Generate the config file
# envsubst < sitespeed-config.template.json > sitespeed-config.json

# # Define a cleanup function
# cleanup() {
#     echo "Cleaning up..."
#     rm -f sitespeed-config.json
#     exit
# }

# # Trap common termination signals
# trap cleanup SIGINT SIGTERM EXIT

# Start the server
docker network create sitespeed-net 
docker build -f Dockerfile.sitespeed -t my-sitespeedio .
docker compose up --build -d