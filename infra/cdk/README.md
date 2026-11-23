# AWS CDK foundation

This CDK app defines the AWS resources already used by the application: an encrypted private S3 bucket, four on-demand DynamoDB tables, and encrypted SQS ingestion and dead-letter queues. It also adds a CloudWatch alarm when the dead-letter queue contains messages. The stack is account-independent so it can be synthesized and tested before an AWS account is available.

## Local checks

```sh
pnpm cdk:test
pnpm cdk:typecheck
pnpm cdk:synth
```

By default, synthesis uses stage `dev` and `http://localhost:5173` as the bucket CORS origin. An alternate stage and origin can be supplied as CDK context:

```sh
pnpm exec cdk synth -c stage=staging -c appOrigin=https://app.example.com
```

## Account-dependent steps

No AWS account is required for the local checks. Deployment requires an AWS account, a reviewed cost/security design, a configured profile or GitHub Actions OIDC role, and CDK bootstrap in the target account and region. Production must use an HTTPS `appOrigin`.

The stack outputs the bucket, table names, primary queue URL, DLQ URL, and alarm name. Configure the application with those outputs using `S3_BUCKET`, `*_TABLE_NAME`, and `DOC_INGEST_QUEUE_URL`. Omit `AWS_ENDPOINT_URL` in AWS so the SDK uses regional AWS endpoints; local Emulator runs continue to set the endpoint explicitly.

`pnpm aws:init` is the local Emulator initializer, not a production deployment step. CDK owns resource creation in AWS. Do not copy the local `.env` to a deployed environment; supply the CDK outputs and the runtime role's AWS region/credentials through the selected deployment platform.

The DLQ alarm changes state in CloudWatch but has no SNS/email notification action configured. The stack also does not yet create compute, VPC/security groups, Cognito, application IAM roles, backups, or a full monitoring setup. Confirm CloudWatch alarm charges and configure a notification destination before deployment. The queue moves messages to its DLQ after three receives; replay procedures are not configured. Do not deploy until these remaining components, IAM permissions, costs, and operational requirements have been reviewed.
