import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";
import { AppEnvironment } from "../AppEnvironment";

export interface ApplicationIamRolesProps {
    // Add any specific props needed
}

/**
 * Creates IAM roles for the application infrastructure
 */
export class ApplicationIamRoles extends Construct {
    public readonly ecsServiceRole: iam.Role;
    public readonly fargateExecutionRole: iam.Role;

    constructor(scope: Construct, env: AppEnvironment, props?: ApplicationIamRolesProps) {
        super(scope, "ApplicationIamRoles");

        const stackName = cdk.Stack.of(this).stackName;
        const region = env.region;
        const account = env.account;
        const serviceName = env.serviceName;
        const isProd = env.isProd;

        // Fargate execution role - allows the ECS service to pull images, write logs, etc.
        this.fargateExecutionRole = new iam.Role(this, "FargateExecutionRole", {
            roleName: `${serviceName}-fargate-execution-role`,
            description: `Execution role for ${serviceName} Fargate tasks`,
            assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
            managedPolicies: [
                iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AmazonECSTaskExecutionRolePolicy"),
            ],
        });

        // Additional permissions for the execution role
        this.fargateExecutionRole.addToPolicy(
            new iam.PolicyStatement({
                effect: iam.Effect.ALLOW,
                actions: [
                    "ecr:GetAuthorizationToken",
                    "ecr:BatchCheckLayerAvailability",
                    "ecr:GetDownloadUrlForLayer",
                    "ecr:BatchGetImage",
                ],
                resources: ["*"], // ECR permissions require * resource
            })
        );

        // Allow retrieving parameters from SSM
        this.fargateExecutionRole.addToPolicy(
            new iam.PolicyStatement({
                effect: iam.Effect.ALLOW,
                actions: [
                    "ssm:GetParameters",
                    "ssm:GetParameter",
                ],
                resources: [
                    `arn:aws:ssm:${region}:${account}:parameter/config/${serviceName}/*`,
                    `arn:aws:ssm:${region}:${account}:parameter/config/common/*`,
                ],
            })
        );

        // Task role - for application permissions
        this.ecsServiceRole = new iam.Role(this, "EcsServiceRole", {
            roleName: `${serviceName}-task-role`,
            description: `Task role for ${serviceName}`,
            assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
        });

        // Allow logging to CloudWatch
        this.ecsServiceRole.addToPolicy(
            new iam.PolicyStatement({
                effect: iam.Effect.ALLOW,
                actions: [
                    "logs:CreateLogStream",
                    "logs:PutLogEvents",
                    "logs:DescribeLogStreams",
                ],
                resources: [`arn:aws:logs:${region}:${account}:log-group:${serviceName}:*`],
            })
        );

        // Add specific permissions for your application
        // Example: S3 access
        /* 
        this.ecsServiceRole.addToPolicy(
            new iam.PolicyStatement({
                effect: iam.Effect.ALLOW,
                actions: [
                    "s3:GetObject",
                    "s3:ListBucket",
                ],
                resources: [
                    `arn:aws:s3:::${serviceName}-data-${account}`,
                    `arn:aws:s3:::${serviceName}-data-${account}/*`,
                ],
            })
        );
        */

        // Additional permissions for production
        if (isProd) {
            // Example: Add extra permissions only for production
            this.ecsServiceRole.addToPolicy(
                new iam.PolicyStatement({
                    effect: iam.Effect.ALLOW,
                    actions: [
                        "cloudwatch:PutMetricData",
                    ],
                    resources: ["*"], // CloudWatch metrics require * resource
                })
            );
        }
    }
}