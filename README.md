# AWS CDK Deployment Template

This template provides a standardized approach for deploying applications using AWS CDK with CodePipeline. It includes the necessary files and configurations to set up a complete CI/CD pipeline and infrastructure for containerized applications.

## Overview

This template implements infrastructure as code using AWS CDK, enabling you to:

1. Define multi-environment deployments (dev, stage, prod)
2. Set up a CI/CD pipeline with automated tests and security scans
3. Deploy containerized applications to AWS ECS Fargate
4. Implement proper security, monitoring, and operational practices

## Directory Structure

```
aws-cdk-deployment-template/
├── infrastructure/           # AWS CDK infrastructure code
│   ├── bin/                  # CDK entry point
│   │   └── infrastructure.ts
│   ├── lib/                  # Infrastructure components
│   │   ├── AppEnvironment.ts # Environment configuration manager
│   │   ├── application/      # Application infrastructure
│   │   │   └── app-stack.ts  # Main application stack (ECS, ALB, etc.)
│   │   ├── pipeline/         # CI/CD pipeline
│   │   │   ├── codebuild-project.ts # CodeBuild configuration
│   │   │   └── pipeline-stack.ts    # CodePipeline infrastructure
│   │   ├── roles/            # IAM roles and permissions
│   │   │   ├── ApplicationIamRoles.ts # Roles for the application
│   │   │   └── PipelineIamRoles.ts    # Roles for the CI/CD pipeline
│   │   └── utils/            # Utility functions
│   │       └── log-utils.ts  # Logging utilities
│   ├── cdk.json              # CDK configuration
│   ├── package.json          # Node.js dependencies
│   └── tsconfig.json         # TypeScript configuration
├── cicd/                     # CI/CD configuration files
│   ├── buildspec.yaml                  # Main build specification
│   ├── buildspec-licenses-check.yaml   # License compliance check
│   └── buildspec-vulnerability-check.yaml # Security vulnerability scan
└── custom-build/             # Container build files
    ├── cb-build_and_publish.sh # Docker build and publish script
    ├── cb.dockerfile.aws     # Dockerfile for the application
    └── scripts/              # Container scripts
        └── startup.sh        # Container startup script
```

## Key Features

### Multi-Environment Support

The template supports multiple deployment environments (dev, stage, prod) with environment-specific configurations defined in `cdk.json`.

Example environment configuration:
```json
"environments": {
  "dev": {
    "account": "111111111111",
    "region": "eu-west-1",
    "isProd": false,
    "memory": 512,
    "fargateCpu": 256,
    "logRetentionDays": 7,
    "desiredInstantCount": 1
  },
  "prod": {
    "account": "333333333333",
    "region": "eu-west-1",
    "isProd": true,
    "memory": 1024,
    "fargateCpu": 512,
    "logRetentionDays": 30,
    "desiredInstantCount": 2
  }
}
```

### CI/CD Pipeline

The template includes a complete CI/CD pipeline that:

1. Builds and tests the application
2. Performs license compliance checks
3. Scans for security vulnerabilities
4. Builds and publishes Docker images to ECR
5. Deploys the application to AWS ECS Fargate
6. Supports scheduled builds and deployments

### Containerized Application Deployment

The template provides:

1. Optimized Docker image build process
2. Automated ECR repository management
3. ECS Fargate service with proper health checks and scaling
4. Load balancer integration
5. Security group configuration

### Security and Compliance

The template implements security best practices:

1. IAM roles with least privilege permissions
2. Security groups with restricted access
3. License compliance checking
4. Vulnerability scanning
5. Secrets management via SSM Parameter Store

### Monitoring and Observability

The template includes:

1. CloudWatch logging with configurable retention policies
2. Optional DataDog integration for production environments
3. Health check configuration
4. Load balancer monitoring

## Getting Started

### Prerequisites

1. AWS account with appropriate permissions
2. AWS CLI installed and configured
3. Node.js and npm installed
4. AWS CDK installed (`npm install -g aws-cdk`)
5. Docker installed (for local testing)

### Setup Instructions

1. **Copy the template directory**

   ```bash
   cp -r aws-cdk-deployment-template my-service
   cd my-service
   ```

2. **Update service name and configuration**

   Edit `infrastructure/cdk.json` and update:
   - `serviceName` to your service name
   - Environment configurations (accounts, regions, etc.)
   - Resource allocations (memory, CPU, etc.)

3. **Install dependencies**

   ```bash
   cd infrastructure
   npm install
   ```

4. **Build the CDK code**

   ```bash
   npm run build
   ```

5. **Deploy the pipeline stack**

   ```bash
   cdk deploy <service-name>-pipeline --profile <your-aws-profile>
   ```

### CI/CD Pipeline Configuration

The buildspec files in the `cicd` directory define the build process:

- `buildspec.yaml`: Main build and deployment process
- `buildspec-licenses-check.yaml`: License compliance check
- `buildspec-vulnerability-check.yaml`: Security vulnerability scan

### Container Configuration

The container configuration is defined in:

- `custom-build/cb.dockerfile.aws`: Dockerfile for the application
- `custom-build/cb-build_and_publish.sh`: Build and publish script
- `custom-build/scripts/startup.sh`: Container startup script

## Customization Guide

### Adding Resources to the Application Stack

To add AWS resources to your application, modify the `app-stack.ts` file. For example, to add an S3 bucket:

```typescript
// In app-stack.ts
import * as s3 from 'aws-cdk-lib/aws-s3';

// Inside the AppStack class constructor
const bucket = new s3.Bucket(this, 'DataBucket', {
  bucketName: `${serviceName}-data-${env.account}`,
  removalPolicy: cdk.RemovalPolicy.RETAIN,
  encryption: s3.BucketEncryption.S3_MANAGED,
  versioned: true,
});

// Grant access to the ECS task
bucket.grantReadWrite(iamRoles.ecsServiceRole);
```

### Adding Environment Variables

To add environment variables to your container:

1. **Update the getEnvironmentVariables method in app-stack.ts**:

```typescript
private getEnvironmentVariables(...) {
  return {
    // Existing environment variables
    
    // Add your custom environment variables
    MY_CUSTOM_VAR: "your-value",
    DATABASE_URL: ssm.StringParameter.valueForStringParameter(this, `/config/${serviceName}/db-url`),
  };
}
```

### Modifying the Container Setup

To customize the container:

1. **Update the Dockerfile** (`custom-build/cb.dockerfile.aws`):
   - Add dependencies
   - Configure environment
   - Adjust permissions

2. **Update the startup script** (`custom-build/scripts/startup.sh`):
   - Add initialization logic
   - Configure application startup
   - Add health check procedures

### Adding a Database

To add a database to your application:

1. **Create a new file** `infrastructure/lib/application/database-stack.ts`
2. **Define your database resources** (RDS, DynamoDB, etc.)
3. **Import and use in app-stack.ts**

Example for Amazon RDS:

```typescript
// In a new file: database-stack.ts
import * as rds from 'aws-cdk-lib/aws-rds';

export class DatabaseStack extends cdk.Stack {
  public readonly database: rds.DatabaseInstance;
  
  constructor(scope: constructs.Construct, id: string, props: DatabaseStackProps) {
    super(scope, id, props);
    
    this.database = new rds.DatabaseInstance(this, 'Database', {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_13,
      }),
      // Other configurations
    });
  }
}
```

## Best Practices

### Security

1. **IAM Permissions**: Follow the principle of least privilege
2. **Secret Management**: Use SSM Parameter Store or Secrets Manager
3. **Network Security**: Use security groups to restrict access
4. **Container Security**: Use minimal base images and scan for vulnerabilities

### Cost Optimization

1. **Right-sizing**: Choose appropriate instance sizes for your workload
2. **Auto-scaling**: Configure auto-scaling to match demand
3. **Reserved Instances**: Use reserved instances for predictable workloads
4. **Resource Cleanup**: Set appropriate retention policies for logs and backups

### Reliability

1. **Health Checks**: Configure appropriate health checks for services
2. **Auto-scaling**: Ensure services can scale to handle load
3. **Multi-AZ**: Deploy across multiple availability zones
4. **Graceful Shutdown**: Configure services for graceful termination

### Performance

1. **Resource Allocation**: Allocate appropriate CPU and memory
2. **Connection Pooling**: Use connection pooling for databases
3. **Caching**: Implement caching where appropriate
4. **Monitoring**: Set up alerts for performance issues

## Troubleshooting

### Common Issues

1. **CDK Deployment Fails**:
   - Check IAM permissions
   - Verify account and region configuration
   - Check CloudFormation stack events

2. **Container Build Fails**:
   - Check Docker installation
   - Verify ECR repository exists
   - Check AWS credentials

3. **Application Health Check Fails**:
   - Verify application is listening on the correct port
   - Check application logs
   - Verify health check path exists

### Getting Help

1. **AWS Documentation**:
   - [AWS CDK Documentation](https://docs.aws.amazon.com/cdk/latest/guide/home.html)
   - [AWS ECS Documentation](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/Welcome.html)
   - [AWS CodePipeline Documentation](https://docs.aws.amazon.com/codepipeline/latest/userguide/welcome.html)

2. **Community Resources**:
   - [AWS CDK GitHub Repository](https://github.com/aws/aws-cdk)
   - [AWS Forums](https://forums.aws.amazon.com/)

## License

This template is available under the MIT License.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.