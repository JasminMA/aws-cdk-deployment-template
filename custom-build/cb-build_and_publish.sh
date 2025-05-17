#!/bin/bash

set -eo pipefail

# Function to display usage
usage() {
    echo "Usage: $0 <publish_dir> <version> <account_id>"
    echo "  publish_dir: Directory containing files to publish"
    echo "  version: Version tag for the image"
    echo "  account_id: AWS account ID"
    exit 1
}

# Logging functions
log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')][INFO] $1"
}

error() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')][ERROR] $1" >&2
}

# Validate input parameters
if [ "$#" -ne 3 ]; then
    error "Missing required parameters"
    usage
fi

publishDir=$1
version=$2
accountId=$3
region=${AWS_REGION:-eu-west-1}
service=${APP_NAME:-your-service-name}

# Validate required input
if [ ! -d "$publishDir" ]; then
    error "Publish directory does not exist: $publishDir"
    exit 1
fi

if [ -z "$region" ]; then
    error "AWS_REGION environment variable is not set"
    exit 1
fi

log "Starting build and publish process"
log "Parameters:"
log "  Publish directory: $publishDir"
log "  Version: $version"
log "  Account ID: $accountId"
log "  Region: $region"
log "  Service: $service"

# Stop existing containers
log "Stopping existing containers"
existing_containers=$(docker ps -aq --filter="name=$service") || true
if [ -n "$existing_containers" ]; then
    docker stop $existing_containers
fi

# Prepare build context
log "Cleaning up old context directories"
rm -rf ./scripts ./certs
mkdir -p ./scripts ./certs

log "Copying custom scripts"
if [ "$(ls -A ./custom-build/scripts/*.sh 2>/dev/null)" ]; then
    cp -f ./custom-build/scripts/*.sh ./scripts/
fi

# Validate Dockerfile existence
if [ ! -f "./custom-build/cb.dockerfile.aws" ]; then
    error "Dockerfile not found: ./custom-build/cb.dockerfile.aws"
    exit 1
fi

# Build Docker image
log "Building Docker image"
docker build --pull --no-cache --rm \
    --build-arg publishdir="$publishDir" \
    --build-arg version="$version" \
    --build-arg AWS_ACCOUNT_ID="$accountId" \
    --build-arg AWS_REGION="$region" \
    -t "$service" \
    -f "./custom-build/cb.dockerfile.aws" .

# Clean up build context
log "Cleaning up build context"
rm -rf ./scripts ./certs

# Tag and push images
repository="$accountId.dkr.ecr.$region.amazonaws.com/$service"
log "Tagging and pushing to ECR: $repository"

log "Pushing latest tag"
docker tag "$service:latest" "$repository:latest"
docker push "$repository:latest"

log "Pushing version tag: $version"
docker tag "$service:latest" "$repository:$version"
docker push "$repository:$version"

# Clean up old images
log "Cleaning up old images"
docker images | grep "$service" | grep -v "latest" | grep -v "$version" | awk '{print $3}' | xargs -r docker rmi || true

log "Build and publish completed successfully"