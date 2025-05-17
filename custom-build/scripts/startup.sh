#!/bin/bash
set -e

# Log startup information
echo "Starting application container"
echo "Service: $SERVICE_NAME"
echo "Environment: $ENVIRONMENT"
echo "Java version: $(java -version 2>&1 | head -1)"

# Set default values for environment variables if not provided
JAVA_OPTS=${JAVA_OPTS:-"-XX:+UseContainerSupport -XX:MaxRAMPercentage=75.0"}
SERVER_PORT=${SERVER_PORT:-443}

# Print environment variables for debugging (exclude sensitive ones)
echo "Environment variables:"
env | grep -v PASSWORD | grep -v KEY | sort

# Run the application
echo "Starting Java application with options: $JAVA_OPTS"
exec java $JAVA_OPTS -jar /app/application.jar