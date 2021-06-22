# A crash course on Serverless with AWS: Centralized logging with Kinesis and Lambda

Code sample for [the tutorial about creating a centralized logging system for AWS Lambda](https://sematext.com/blog/centralized-aws-lambda-logs-kinesis-serverless/) with [Sematext Logs](https://sematext.com/logsene).

## Quick Start
You can quickly deploy this to your AWS account by running `serverless deploy`. Make sure you have the [Serverless Framework CLI](https://www.serverless.com/) installed.

Or, you can generate a CloudFormation template by running `serverless package` and deploy it with CloudFormation.

But first, you need to edit some things.

### 0. Clone This Repo & Install the Serverless Framework

Clone the repo:
```bash
git clone https://github.com/sematext/cloudwatch-sematext-aws-lambda-log-shipper.git
```

Open the `cloudwatch-sematext-aws-lambda-log-shipper` directory.
```bash
cd cloudwatch-sematext-aws-lambda-log-shipper
```

First install the Serverless Framework. Version 2.4.0 is required as stated [here](https://github.com/functionalone/serverless-iam-roles-per-function/issues/52). We would like to keep IAM roles on a per-function basis. Hence why we require version 2.4.0.
```bash
npm i serverless@2.4.0 -g
```

Then carry on installing all dependencies.

```bash
npm i
```

### 1. Configure Secrets

**First, rename `sample.secrets.json` into `secrets.json`.**

In the `secrets.json`, add values for: 

```json
{
  "LOGS_TOKEN": "your-token",
  "LOGS_RECEIVER_URL": "https://logsene-receiver.sematext.com",
  "AWS_REGION": "us-east-1",
  "BATCH_SIZE": 1000,
  "LOG_GROUP_RETENTION_IN_DAYS": 1,
  "KINESIS_RETENTION_IN_HOURS": 24,
  "KINESIS_SHARD_COUNT": 1,
  "PREFIX": "/aws/lambda"
}
```
> Note: The `LOGS_RECEIVER_URL` for Sematext's EU region is: `https://logsene-receiver.eu.sematext.com`. The `PREFIX` can be any Log Group in CloudWatch you want, like `/ecs` or `/whatever/you/want`.

### 2. Deploy

```bash
serverless deploy
```

Once it's deployed you'll see something like this:

```bash
[output]
Serverless: Packaging service...
Serverless: Excluding development dependencies...
Serverless: Uploading CloudFormation file to S3...
Serverless: Uploading artifacts...
Serverless: Uploading service .zip file to S3 (2.15 MB)...
Serverless: Validating template...
Serverless: Updating Stack...
Serverless: Checking Stack update progress...
............
Serverless: Stack update finished...
Service Information
service: lambda-cwlogs-to-logsene
stage: dev
  region: us-east-1
stack: lambda-cwlogs-to-logsene-dev
api keys:
  None
endpoints: # API to manually trigger subscriber function
  GET - https://some-domain.execute-api.us-east-1.amazonaws.com/dev/subscribe
functions:
  shipper: lambda-cwlogs-to-logsene-dev-shipper
  subscriber: lambda-cwlogs-to-logsene-dev-subscriber
layers:
  None
Serverless: Removing old service artifacts from S3…
```

If you'd rather use CloudFormation:

```bash
serverless package
```
Info about this command [here](https://www.serverless.com/framework/docs/providers/aws/cli-reference/package/).

You will get the CloudFormation template generated in the `.serverless` folder.

### 3. Run the subscriber function

Initally, you should trigger the subscriber functions to subscribe to any existing log groups.

The API Gateway URL can be seen when deploying the Severless framework, or in the AWS console for the subscriber Lambda function while looking at the API Gateway trigger for the Lambda.

In this example, the URL: `https://some-domain.execute-api.us-east-1.amazonaws.com/dev/subscribe` will need to be triggered once to make sure the subscriber has been triggered at least once. The subscriber will be triggered again for any CloudWatch log group that gets created.
