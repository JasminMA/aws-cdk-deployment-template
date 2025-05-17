#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { PipelineStack } from '../lib/pipeline/pipeline-stack';
import { AppEnvironment } from "../lib/AppEnvironment";

// Initialize environment configuration
const app = new cdk.App();
const env = new AppEnvironment(app); // Reads from cdk.json context

// Create pipeline stack with environment-aware values
new PipelineStack(app, `${env.serviceName}-pipeline`, {
    env: env.cdkEnv, // Uses account/region from AppEnvironment
    tags: {
        Service: env.serviceName,
        Environment: env.name
    },
});