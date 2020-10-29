# A crash course on Serverless with AWS: Centralized logging with Kinesis and Lambda

Code sample for [the tutorial about creating a centralized logging system for AWS Lambda](https://sematext.com/blog/centralized-aws-lambda-logs-kinesis-serverless/) with [Sematext Logs](https://sematext.com/logsene).

## Quick Start
You can quickly deploy this to your AWS account by running `serverless deploy`. Make sure you have the [Serverless Framework CLI](https://www.serverless.com/) installed.

Or, you can generate a CloudFormation template by running `serverless package` and deploy it with CloudFormation.

But first, you need to edit some things.

### 0. Install the Serverless Framework

Version 2.4.0 is required as stated [here](https://github.com/functionalone/serverless-iam-roles-per-function/issues/52). We would like to keep IAM roles on a per-function basis. Hence why we require version 2.4.0.
```bash
npm i serverless@2.4.0 -g
```

Then carry on installing all dependencies.

```bash
npm i
```

### 1. Configure Secrets

- rename sample.secrets.json into secrets.json

In the `secrets.json`, add values for: 

- "LOGS_TOKEN": "your-token"
- "LOGS_RECEIVER_URL": "https://logsene-receiver.sematext.com/_bulk"
- "REGION": "us-east-1"
- "PREFIX": "/aws/lambda" or "/ecs" or "/whatever/you/want"

### 2. Deploy

```bash
serverless deploy
```

If you'd rather use CloudFormation:

```bash
serverless package
```
Info about this command [here](https://www.serverless.com/framework/docs/providers/aws/cli-reference/package/).

You will get the CloudFormation template generated in the `.serverless` folder.