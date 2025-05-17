import * as cdk from "aws-cdk-lib";
import { Fn, Stage } from "aws-cdk-lib";
import * as codepipeline_actions from "aws-cdk-lib/aws-codepipeline-actions";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as pipelines from "aws-cdk-lib/pipelines";
import { AppEnvironment } from "../AppEnvironment";
import { PipelineIamRoles } from "../roles/PipelineIamRoles";
import { CodeBuildProject } from "./codebuild-project";
import { Construct } from "constructs";
import { AppStack } from "../application/app-stack";
import * as events from "aws-cdk-lib/aws-events";
import * as ecr from "aws-cdk-lib/aws-ecr";
import { TagStatus } from "aws-cdk-lib/aws-ecr";

export interface ApplicationStageProps extends cdk.StageProps {
    readonly serviceName: string;
    readonly envConfig: AppEnvironment;
}

export class Application extends Stage {
    constructor(scope: Construct, id: string, props: ApplicationStageProps) {
        super(scope, id, props);

        new AppStack(this, "AppStack", {
            stackName: props.serviceName,
            env: props.envConfig.cdkEnv
        });
    }
}

/**
 * Pipeline template for service deployment
 */
export class PipelineStack extends cdk.Stack {
    public constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
        super(scope, id, props);
        const env = new AppEnvironment(scope);
        
        // This is a platform-specific construct - adjust for your cloud provider
        const hostedZone = this.getHostedZone(); // Define this helper method for your environment
        const serviceName = env.serviceName;

        // Create IAM Roles
        const iamRoles = new PipelineIamRoles(this, env.name, {
            hostedZoneArn: hostedZone.hostedZoneArn,
            env: env
        });

        // Source trigger configuration
        // This is specific to your CI/CD setup - adjust as needed
        const bucketName = this.getTriggerBucketName(); // Define this helper method
        const bucket = s3.Bucket.fromBucketName(this, "TriggerBucket", bucketName);
        const inputTriggerFile = pipelines.CodePipelineSource.s3(
            bucket, `${serviceName}/trigger/master`,
            {
                trigger: codepipeline_actions.S3Trigger.EVENTS,
                actionName: "GetTriggerFile",
            },
        );

        // Create ECR Repository
        const ecrRepository = new ecr.Repository(this, "Repository", {
            repositoryName: serviceName,
            lifecycleRules: [
                {
                    rulePriority: 1,
                    description: "keep only the latest 10 images",
                    tagStatus: TagStatus.ANY,
                    maxImageCount: 10,
                },
            ],
        });

        // Create CodeBuild project
        const codeBuild = new CodeBuildProject(this, "Build", {
            input: inputTriggerFile,
            buildSpecPath: `../cicd/buildspec.yaml`, // Path relative to the synthesized directory
            hostedZoneName: hostedZone.zoneName,
            role: iamRoles.codeBuildRole,
            ecrRepository: ecrRepository
        });

        // Create pipeline
        const pipeline = new pipelines.CodePipeline(this, "Pipeline", {
            pipelineName: serviceName,
            role: iamRoles.pipelineRole,
            synth: codeBuild,
            selfMutation: false // Set to true if you want the pipeline to be able to update itself
        });

        // Add deployment stage
        pipeline.addStage(new Application(this, "Deploy", {
            serviceName: serviceName,
            envConfig: env
        }), {pre: [codeBuild]});

        // Add scheduled trigger if needed
        this.addScheduledTrigger(serviceName);
    }

    // Helper methods for environment-specific configurations

    private getHostedZone() {
        // Implement based on your cloud setup
        // For example:
        return {
            hostedZoneArn: cdk.Fn.importValue('hosted-zone-arn'),
            zoneName: cdk.Fn.importValue('hosted-zone-name')
        };
    }

    private getTriggerBucketName() {
        // Implement based on your CI/CD setup
        return Fn.importValue("ci-trigger-s3-bucket");
    }

    private addScheduledTrigger(serviceName: string) {
        // Example of scheduled pipeline trigger - adjust as needed
        new events.CfnRule(this, "CronBasedPipelineTrigger", {
            description: `Cron based pipeline trigger for ${serviceName}`,
            scheduleExpression: "cron(0 8 ? * 1 *)", // Every Monday at 8 AM
            state: "ENABLED",
            targets: [
                {
                    arn: cdk.Fn.importValue("event-based-pipeline-trigger-function-arn"),
                    id: `cron-trigger-for-${serviceName}`,
                    input: JSON.stringify({
                        PipelineName: serviceName,
                    }),
                },
            ],
        });
    }
}