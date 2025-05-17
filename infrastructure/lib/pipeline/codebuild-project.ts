import * as cdk from "aws-cdk-lib";
import * as codebuild from "aws-cdk-lib/aws-codebuild";
import * as iam from "aws-cdk-lib/aws-iam";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as pipelines from "aws-cdk-lib/pipelines";
import { Construct } from "constructs";

export interface CodeBuildProjectProps {
    readonly input: pipelines.IFileSetProducer;
    readonly buildSpecPath: string;
    readonly hostedZoneName: string;
    readonly role: iam.IRole;
    readonly ecrRepository: ecr.IRepository;
}

/**
 * Creates a CodeBuild project for the CI/CD pipeline
 */
export class CodeBuildProject extends pipelines.ShellStep {
    constructor(scope: Construct, id: string, props: CodeBuildProjectProps) {
        // Create a buildspec override for environment-specific variables
        const buildSpec = {
            version: "0.2",
            phases: {
                build: {
                    commands: [
                        `echo "Build started at $(date)"`,
                        // This will use the buildspec specified in the file, not this override
                        `BUILDSPEC_FILE=${props.buildSpecPath} aws codebuild start-build-override`,
                    ],
                },
            },
        };

        const project = new codebuild.PipelineProject(scope, `${id}Project`, {
            projectName: cdk.Stack.of(scope).stackName,
            description: `Build project for ${cdk.Stack.of(scope).stackName}`,
            environment: {
                buildImage: codebuild.LinuxBuildImage.AMAZON_LINUX_2_4,
                privileged: true, // Required for Docker commands
                computeType: codebuild.ComputeType.SMALL,
            },
            environmentVariables: {
                AWS_ACCOUNT_ID: {
                    type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
                    value: cdk.Aws.ACCOUNT_ID,
                },
                AWS_DEFAULT_REGION: {
                    type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
                    value: cdk.Aws.REGION,
                },
                SERVICE_NAME: {
                    type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
                    value: cdk.Stack.of(scope).stackName,
                },
                HOSTED_ZONE_NAME: {
                    type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
                    value: props.hostedZoneName,
                },
                ECR_REPOSITORY_URI: {
                    type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
                    value: props.ecrRepository.repositoryUri,
                },
            },
            buildSpec: codebuild.BuildSpec.fromObject(buildSpec),
            role: props.role,
            timeout: cdk.Duration.minutes(30),
            queuedTimeout: cdk.Duration.minutes(30),
            concurrentBuildLimit: 1,
        });

        // Configure the ShellStep to use the CodeBuild project
        super(id, {
            input: props.input,
            commands: [
                `echo "Running build for ${cdk.Stack.of(scope).stackName}"`,
                // The actual commands are defined in the buildspec file
            ],
            env: {
                // Pass environment variables to the build
                AWS_ACCOUNT_ID: cdk.Aws.ACCOUNT_ID,
                AWS_DEFAULT_REGION: cdk.Aws.REGION,
                SERVICE_NAME: cdk.Stack.of(scope).stackName,
            },
        });
    }
}