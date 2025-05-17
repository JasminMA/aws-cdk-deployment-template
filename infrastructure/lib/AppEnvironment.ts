import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib';

export interface EnvironmentConfig {
    readonly isProd: boolean;
    readonly account: string;
    readonly region: string;
    readonly serviceName: string;
    readonly memory: number;
    readonly fargateCpu: number;
    readonly logRetentionDays: number;
    readonly desiredInstantCount: number;
    // Add more project-specific configurations here
}

export class AppEnvironment {
    private readonly config: EnvironmentConfig;
    public readonly name: string;
    public readonly serviceName: string;

    constructor(scope: Construct, envName?: string) {
        // Determine environment name
        this.name = this.resolveEnvironmentName(scope, envName);

        // Load configuration
        this.config = this.loadConfig(scope);

        // Set service name (with fallbacks)
        this.serviceName = this.config.serviceName
            ?? scope.node.tryGetContext('serviceName');
    }

    private resolveEnvironmentName(scope: Construct, envName?: string): string {
        // Explicit parameter takes highest precedence
        if (envName) return envName;

        // Then try context
        return scope.node.tryGetContext('env')
            ?? scope.node.tryGetContext('stage');
    }

    private loadConfig(scope: Construct): EnvironmentConfig {
        const environments = scope.node.tryGetContext('environments');

        if (!environments || typeof environments !== 'object') {
            throw new Error('No environments found in context');
        }

        const envConfig = environments[this.name];

        if (!envConfig) {
            const availableEnvs = Object.keys(environments).join(', ');
            throw new Error(
                `Environment '${this.name}' not found in context. ` +
                `Available environments: ${availableEnvs || 'none'}`
            );
        }

        return {
            isProd: envConfig.isProd ?? this.name === 'prod',
            account: envConfig.account ?? process.env.CDK_DEFAULT_ACCOUNT,
            region: envConfig.region ?? process.env.CDK_DEFAULT_REGION,
            serviceName: envConfig.serviceName,
            memory: envConfig.memory,
            fargateCpu: envConfig.fargateCpu,
            logRetentionDays: envConfig.logRetentionDays,
            desiredInstantCount: envConfig.desiredInstantCount
            // Map other properties as needed
        };
    }

    get isProd(): boolean {
        return this.config.isProd ?? false;
    }

    get account(): string {
        return this.config.account;
    }

    get region(): string {
        return this.config.region;
    }

    get cdkEnv(): cdk.Environment {
        return {
            account: this.account,
            region: this.region
        };
    }

    get memory(): number {
        return this.config.memory
    }

    get fargateCpu(): number {
        return this.config.fargateCpu
    }

    get logRetentionDays(): number {
        return this.config.logRetentionDays
    }

    get desiredInstantCount(): number {
        return this.config.desiredInstantCount
    }

    // Add more getters as needed for your service
}