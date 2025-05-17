import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";
import { AppEnvironment } from "../AppEnvironment";

export interface PipelineIamRolesProps {
    readonly hostedZoneArn: string;
    readonly env: AppEnvironment;
}

/**
 * Creates IAM roles for the CI/CD pipeline
 */
export class PipelineIamRoles extends Construct {
    public readonly pipelineRole: iam.Role;
    public readonly codeBuildRole: iam.Role;
    public readonly deploymentRole: iam.Role;

    constructor(scope: Construct, id: string, props: PipelineIamRolesProps) {
        super(scope, id);
        
        const stackName = cdk.Stack.of(this).stackName;
        const region = props.env.region;
        const account = props.env.account;
        const serviceName = props.env.serviceName;

        // Main pipeline role
        this.pipelineRole = new iam.Role(this, "PipelineRole", {
            roleName: `${serviceName}-pipeline-role`,
            description: `Pipeline role for ${serviceName}`,
            assumedBy: new iam.ServicePrincipal("codepipeline.amazonaws.com"),
        });

        // Basic pipeline permissions
        this.pipelineRole.addToPolicy(
            new iam.PolicyStatement({
                effect: iam.Effect.ALLOW,
                actions: [
                    "s3:GetObject",
                    "s3:GetObjectVersion",
                    "s3:PutObject",
                    "s3:ListBucket",
                ],
                resources: [
                    `arn:aws:s3:::${serviceName}-artifacts-${account}-${region}`,
                    `arn:aws:s3:::${serviceName}-artifacts-${account}-${region}/*`,
                    // Add additional artifact buckets as needed
                ],
            })
        );

        // CodeBuild role
        this.codeBuildRole = new iam.Role(this, "CodeBuildRole", {
            roleName: `${serviceName}-codebuild-role`,
            description: `CodeBuild role for ${serviceName}`,
            assumedBy: new iam.ServicePrincipal("codebuild.amazonaws.com"),
        });

        // Basic CodeBuild permissions
        this.codeBuildRole.addToPolicy(
            new iam.PolicyStatement({
                effect: iam.Effect.ALLOW,
                actions: [
                    "logs:CreateLogGroup",
                    "logs:CreateLogStream",
                    "logs:PutLogEvents",
                ],
                resources: [
                    `arn:aws:logs:${region}:${account}:log-group:/aws/codebuild/${serviceName}*`,
                    `arn:aws:logs:${region}:${account}:log-group:/aws/codebuild/${serviceName}*:*`,
                ],
            })
        );

        // Allow CodeBuild to access S3 artifacts
        this.codeBuildRole.addToPolicy(
            new iam.PolicyStatement({
                effect: iam.Effect.ALLOW,
                actions: [
                    "s3:GetObject",
                    "s3:GetObjectVersion",
                    "s3:PutObject",
                    "s3:ListBucket",
                ],
                resources: [
                    `arn:aws:s3:::${serviceName}-artifacts-${account}-${region}`,
                    `arn:aws:s3:::${serviceName}-artifacts-${account}-${region}/*`,
                    // Add additional artifact buckets as needed
                ],
            })
        );

        // Allow CodeBuild to access ECR
        this.codeBuildRole.addToPolicy(
            new iam.PolicyStatement({
                effect: iam.Effect.ALLOW,
                actions: [
                    "ecr:GetAuthorizationToken",
                    "ecr:BatchCheckLayerAvailability",
                    "ecr:GetDownloadUrlForLayer",
                    "ecr:BatchGetImage",
                    "ecr:InitiateLayerUpload",
                    "ecr:UploadLayerPart",
                    "ecr:CompleteLayerUpload",
                    "ecr:PutImage",
                ],
                resources: ["*"], // ECR GetAuthorizationToken requires * resource
            })
        );

        // Allow CodeBuild to read SSM parameters
        this.codeBuildRole.addToPolicy(
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

        // Allow CodeBuild to create CloudFormation stacks (for CDK deployment)
        this.codeBuildRole.addToPolicy(
            new iam.PolicyStatement({
                effect: iam.Effect.ALLOW,
                actions: [
                    "cloudformation:DescribeStacks",
                    "cloudformation:CreateStack",
                    "cloudformation:UpdateStack",
                    "cloudformation:DeleteStack",
                    "cloudformation:DescribeStackEvents",
                    "cloudformation:DescribeStackResource",
                    "cloudformation:DescribeStackResources",
                    "cloudformation:GetTemplate",
                    "cloudformation:ValidateTemplate",
                ],
                resources: [`arn:aws:cloudformation:${region}:${account}:stack/${serviceName}*/*`],
            })
        );

        // Deployment role (for CloudFormation)
        this.deploymentRole = new iam.Role(this, "DeploymentRole", {
            roleName: `${serviceName}-deployment-role`,
            description: `Deployment role for ${serviceName}`,
            assumedBy: new iam.ServicePrincipal("cloudformation.amazonaws.com"),
        });

        // Basic deployment permissions
        // In real deployment, these permissions should be more restrictive
        // and only include what the specific service needs
        this.deploymentRole.addManagedPolicy(
            iam.ManagedPolicy.fromAwsManagedPolicyName("AdministratorAccess")
        );
    }
}