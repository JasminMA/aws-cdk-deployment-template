import * as cdk from "aws-cdk-lib";
import * as ssm from "aws-cdk-lib/aws-ssm";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as logs from "aws-cdk-lib/aws-logs";
import * as constructs from "constructs";
import { AppEnvironment } from "../AppEnvironment";
import { ApplicationIamRoles } from "../roles/ApplicationIamRoles";
import { LogUtils } from "../utils/log-utils";
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';

export class AppStack extends cdk.Stack {
    constructor(scope: constructs.Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        // ========== Environment Setup ==========
        const env = new AppEnvironment(scope);
        const serviceName = env.serviceName;
        const isProd = env.isProd;

        // ========== Configuration Retrievals ==========
        // Replace with your project-specific parameters
        // Use try/catch for parameters that might not exist in every environment
        const configParams = this.getConfigParameters(serviceName, isProd);

        // ========== IAM Roles ==========
        const iamRoles = new ApplicationIamRoles(this, env);

        // ========== Network Setup ==========
        const vpc = this.importVPC();
        const securityGroups = this.setupSecurityGroups(vpc, serviceName);
        const subnets = this.getSubnets(vpc);

        // ========== Logging Setup ==========
        const logGroup = new logs.LogGroup(this, "LogGroup", {
            logGroupName: serviceName,
            retention: LogUtils.mapRetentionDays(env.logRetentionDays),
            removalPolicy: cdk.RemovalPolicy.DESTROY,
        });

        // ========== Target Group Setup ==========
        const targetGroup = this.createTargetGroup(vpc, serviceName);

        // ========== Register with Load Balancer ==========
        this.registerWithLoadBalancer(targetGroup, serviceName);

        // ========== Environment Variables ==========
        const environmentVariables = this.getEnvironmentVariables(
            serviceName, 
            env.region, 
            env.account,
            configParams,
            isProd
        );

        // ========== ECS Task Definition ==========
        const taskDefinition = this.createTaskDefinition(
            serviceName,
            env,
            iamRoles
        );

        // ========== Container Definitions ==========
        const mainContainer = this.createMainContainer(
            taskDefinition,
            serviceName,
            env,
            environmentVariables,
            logGroup
        );

        // Add secrets if needed
        // mainContainer.addSecret("SECRET_NAME", ecs.Secret.fromSsmParameter(secretParam));

        // ========== DataDog Container (For Production) ==========
        if (isProd) {
            this.addDatadogAgent(
                taskDefinition, 
                serviceName, 
                configParams,
                env.account
            );
        }

        // ========== ECS Service ==========
        const cluster = this.importEcsCluster(vpc);
        
        const fargateService = new ecs.FargateService(this, "Service", {
            serviceName: serviceName,
            taskDefinition: taskDefinition,
            cluster: cluster,
            healthCheckGracePeriod: cdk.Duration.seconds(120),
            maxHealthyPercent: 200,
            minHealthyPercent: 100,
            platformVersion: ecs.FargatePlatformVersion.VERSION1_4,
            desiredCount: env.desiredInstantCount,
            vpcSubnets: { subnets: subnets },
            securityGroups: [securityGroups.ecsSecurityGroup],
            assignPublicIp: false,
        });

        fargateService.attachToApplicationTargetGroup(targetGroup);
    }

    // ========== Helper Methods ==========
    
    private getConfigParameters(serviceName: string, isProd: boolean) {
        // Get your project's specific configuration parameters
        const configParams: Record<string, string> = {};
        const parameterMappings = [
            { key: 'accountName', path: '/config/account/name' },
            { key: 'aZCount', path: '/config/account/az-count' },
            // Add more parameters as needed
        ];

        parameterMappings.forEach(param => {
            try {
                configParams[param.key] = ssm.StringParameter.valueForStringParameter(this, param.path);
            } catch (error) {
                console.warn(`Parameter ${param.path} not found, using empty string`);
                configParams[param.key] = '';
            }
        });

        return configParams;
    }

    private importVPC() {
        return ec2.Vpc.fromVpcAttributes(this, "ImportedVPC", {
            vpcId: cdk.Fn.importValue("DefaultVPCId"),
            availabilityZones: ["eu-west-1a", "eu-west-1b", "eu-west-1c"], // Adjust as needed
        });
    }

    private setupSecurityGroups(vpc: ec2.IVpc, serviceName: string) {
        // Security group for ECS tasks
        const ecsSecurityGroup = new ec2.SecurityGroup(this, "EcsSecurityGroup", {
            vpc: vpc,
            description: `${serviceName}-task`,
            allowAllOutbound: true,
        });

        // Import existing security group if needed
        let lbSecurityGroup;
        try {
            const securityGroupId = cdk.Fn.importValue("load-balancer-security-group-id");
            lbSecurityGroup = ec2.SecurityGroup.fromSecurityGroupId(
                this, 
                "ImportedLBSecurityGroup", 
                securityGroupId
            );
        } catch (error) {
            // Create a new one if it doesn't exist
            lbSecurityGroup = new ec2.SecurityGroup(this, "LBSecurityGroup", {
                vpc: vpc,
                description: `${serviceName}-lb`,
                allowAllOutbound: true,
            });
        }

        // Allow traffic from load balancer to ECS tasks
        ecsSecurityGroup.connections.allowFrom(
            lbSecurityGroup,
            ec2.Port.tcp(443),
            "Allow HTTPS traffic from load balancer"
        );

        return {
            ecsSecurityGroup,
            lbSecurityGroup
        };
    }

    private getSubnets(vpc: ec2.IVpc) {
        // Get subnets based on your infrastructure
        try {
            return [
                ec2.Subnet.fromSubnetId(this, "PrivateSubnet1", cdk.Fn.importValue("PrivateSubnet1ID")),
                ec2.Subnet.fromSubnetId(this, "PrivateSubnet2", cdk.Fn.importValue("PrivateSubnet2ID")),
            ];
        } catch (error) {
            // Fallback to selecting subnets by type
            return vpc.selectSubnets({
                subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS
            }).subnets;
        }
    }

    private createTargetGroup(vpc: ec2.IVpc, serviceName: string) {
        return new elbv2.ApplicationTargetGroup(this, "ServiceTargetGroup", {
            targetGroupName: `${serviceName}-tg`,
            vpc,
            port: 443, // Adjust as needed
            protocol: elbv2.ApplicationProtocol.HTTPS,
            targetType: elbv2.TargetType.IP,
            healthCheck: {
                enabled: true,
                path: "/actuator/health", // Adjust for your service
                healthyThresholdCount: 2,
                unhealthyThresholdCount: 5,
                interval: cdk.Duration.seconds(90),
                timeout: cdk.Duration.seconds(30),
                healthyHttpCodes: "200"
            },
            deregistrationDelay: cdk.Duration.seconds(15),
        });
    }

    private registerWithLoadBalancer(targetGroup: elbv2.ApplicationTargetGroup, serviceName: string) {
        try {
            // Import load balancer listener
            const listenerArn = cdk.Fn.importValue("load-balancer-listener-arn");
            const listener = elbv2.ApplicationListener.fromApplicationListenerAttributes(
                this, 
                "ImportedListener",
                {
                    listenerArn: listenerArn,
                    securityGroup: ec2.SecurityGroup.fromSecurityGroupId(
                        this, 
                        "ListenerSecurityGroup", 
                        cdk.Fn.importValue("load-balancer-security-group-id")
                    )
                }
            );

            // Create listener rule
            new elbv2.ApplicationListenerRule(this, "LoadBalancerListenerRule", {
                listener: listener,
                priority: 100, // Adjust priority as needed
                conditions: [
                    elbv2.ListenerCondition.pathPatterns([`/${serviceName}/*`])
                ],
                action: elbv2.ListenerAction.forward([targetGroup])
            });
        } catch (error) {
            console.warn("Failed to register with load balancer, this might be expected in some environments");
        }
    }

    private getEnvironmentVariables(
        serviceName: string, 
        region: string, 
        accountId: string,
        configParams: Record<string, string>,
        isProd: boolean
    ) {
        // Base environment variables
        return {
            AWS_REGION: region,
            AWS_ACCOUNT_ID: accountId,
            SERVICE_NAME: serviceName,
            SERVICE_PORT: "443", // Adjust as needed
            
            // Logging
            LOGGING_LEVEL_ROOT: "INFO", // Could be fetched from SSM parameter
            
            // DataDog (if applicable)
            DD_SERVICE_NAME: serviceName,
            DD_JMXFETCH_ENABLED: `${isProd}`,
            DD_TRACE_ANALYTICS_ENABLED: `${isProd}`,
            DD_LOGS_INJECTION: `${isProd}`,
            
            // Java options (for Java applications)
            JAVA_OPTS: "-XX:+UseContainerSupport " +
                "-XX:MaxRAMPercentage=75.0 " +
                "-XX:ActiveProcessorCount=2 " +
                "-XX:+UseSerialGC " +
                "-XX:+ExitOnOutOfMemoryError " +
                "-XX:+HeapDumpOnOutOfMemoryError " +
                "-XX:HeapDumpPath=/app/heapdump.hprof",
        };
    }

    private createTaskDefinition(
        serviceName: string,
        env: AppEnvironment,
        iamRoles: ApplicationIamRoles
    ) {
        return new ecs.FargateTaskDefinition(this, "TaskDefinition", {
            family: serviceName,
            cpu: 256, // Adjust as needed
            memoryLimitMiB: env.memory,
            executionRole: iamRoles.fargateExecutionRole,
            taskRole: iamRoles.ecsServiceRole,
        });
    }

    private createMainContainer(
        taskDefinition: ecs.FargateTaskDefinition,
        serviceName: string,
        env: AppEnvironment,
        environmentVariables: Record<string, string>,
        logGroup: logs.LogGroup
    ) {
        return new ecs.ContainerDefinition(this, "ServiceContainer", {
            containerName: serviceName,
            essential: true,
            linuxParameters: new ecs.LinuxParameters(this, "LinuxParameters", {
                initProcessEnabled: true,
            }),
            healthCheck: {
                interval: cdk.Duration.seconds(90),
                retries: 3,
                timeout: cdk.Duration.seconds(30),
                startPeriod: cdk.Duration.seconds(120),
                command: ["CMD-SHELL", "curl -k -f https://localhost:443/actuator/health || exit 1"], // Adjust for your service
            },
            image: ecs.ContainerImage.fromRegistry(
                `${env.account}.dkr.ecr.${env.region}.amazonaws.com/${serviceName}:latest`
            ),
            cpu: 192, // Adjust as needed
            memoryLimitMiB: env.memory,
            portMappings: [{containerPort: 443, protocol: ecs.Protocol.TCP}], // Adjust port as needed
            taskDefinition: taskDefinition,
            logging: ecs.LogDriver.awsLogs({
                logGroup: logGroup,
                streamPrefix: serviceName,
            }),
            environment: environmentVariables,
        });
    }

    private addDatadogAgent(
        taskDefinition: ecs.FargateTaskDefinition,
        serviceName: string,
        configParams: Record<string, string>,
        accountId: string
    ) {
        // Create log group for DataDog agent
        const statsdLogGroup = new logs.LogGroup(this, "StatsdLogGroup", {
            logGroupName: `${serviceName}-statsd`,
            retention: logs.RetentionDays.ONE_WEEK,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
        });

        // Get DataDog parameters
        let dataDogApiKey = '';
        let dataDogSite = '';
        try {
            dataDogApiKey = ssm.StringParameter.valueForStringParameter(this, "/config/datadog-integration/api-key");
            dataDogSite = ssm.StringParameter.valueForStringParameter(this, "/config/datadog-integration/site");
        } catch (error) {
            console.warn("DataDog parameters not found, using empty values");
        }

        // DataDog agent container
        new ecs.ContainerDefinition(this, "DataDogContainer", {
            containerName: "datadog-agent",
            essential: true,
            healthCheck: {
                interval: cdk.Duration.seconds(120),
                retries: 2,
                timeout: cdk.Duration.seconds(5),
                startPeriod: cdk.Duration.seconds(120),
                command: ["CMD-SHELL", "/probe.sh"],
            },
            image: ecs.ContainerImage.fromRegistry("public.ecr.aws/datadog/agent:latest"),
            cpu: 64,
            memoryLimitMiB: 256,
            portMappings: [
                {containerPort: 8125, protocol: ecs.Protocol.UDP},
                {containerPort: 8126, protocol: ecs.Protocol.TCP},
            ],
            taskDefinition: taskDefinition,
            logging: ecs.LogDriver.awsLogs({
                logGroup: statsdLogGroup,
                streamPrefix: `${serviceName}-statsd`,
            }),
            environment: {
                ECS_FARGATE: "true",
                DD_TAGS: `account_id:${accountId} account_name:${configParams.accountName} service:${serviceName}`,
                DD_DOGSTATSD_TAGS: `account_id:${accountId} account_name:${configParams.accountName} service:${serviceName}`,
                DD_APM_ENABLED: "true",
                DD_API_KEY: dataDogApiKey,
                DD_SITE: dataDogSite,
                DD_APM_IGNORE_RESOURCES: "GET /actuator/health",
                DD_COLLECT_GCE_TAGS: "false",
                DD_LOGS_INJECTION: "true",
                DD_TRACE_SAMPLE_RATE: "1",
                DD_PROFILING_ENABLED: "true",
            },
        });
    }

    private importEcsCluster(vpc: ec2.IVpc) {
        try {
            return ecs.Cluster.fromClusterAttributes(this, "ImportedCluster", {
                clusterName: cdk.Fn.importValue("fargate-cluster-name"),
                vpc: vpc,
            });
        } catch (error) {
            // Create a new cluster if it doesn't exist
            console.warn("Failed to import ECS cluster, creating a new one");
            return new ecs.Cluster(this, "EcsCluster", {
                vpc: vpc,
                clusterName: `${this.stackName}-cluster`,
                containerInsights: true,
            });
        }
    }
}