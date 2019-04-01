const AWS = require('aws-sdk')
AWS.config.region = process.env.region
const cloudWatchLogs = new AWS.CloudWatchLogs()
const prefix = process.env.prefix
const kinesisArn = process.env.kinesisArn
const roleArn = process.env.roleArn
const filterName = process.env.filterName
const retentionDays = process.env.retentionDays
const shipperFunctionName = process.env.shipperFunctionName
const filterPattern = ''

const setRetentionPolicy = async (logGroupName) =>
  cloudWatchLogs.putRetentionPolicy({
    logGroupName: logGroupName,
    retentionInDays: retentionDays
  }).promise()

const listLogGroups = async (acc, nextToken) => {
  const req = {
    limit: 50,
    logGroupNamePrefix: prefix,
    nextToken: nextToken
  }
  const res = await cloudWatchLogs.describeLogGroups(req).promise()

  const newAcc = acc.concat(res.logGroups.map(logGroup => logGroup.logGroupName))
  if (res.nextToken) {
    return listLogGroups(newAcc, res.nextToken)
  } else {
    return newAcc
  }
}

const upsertSubscriptionFilter = async (options) => {
  console.log('UPSERTING...')
  const { subscriptionFilters } = await cloudWatchLogs.describeSubscriptionFilters({ logGroupName: options.logGroupName }).promise()
  const { filterName, filterPattern } = subscriptionFilters[0]

  if (filterName !== options.filterName || filterPattern !== options.filterPattern) {
    await cloudWatchLogs.deleteSubscriptionFilter({
      filterName: filterName,
      logGroupName: options.logGroupName
    }).promise()
    await cloudWatchLogs.putSubscriptionFilter(options).promise()
  }
}

const subscribe = async (logGroupName) => {
  const options = {
    destinationArn: kinesisArn,
    logGroupName: logGroupName,
    filterName: filterName,
    filterPattern: filterPattern,
    roleArn: roleArn,
    distribution: 'ByLogStream'
  }

  try {
    await cloudWatchLogs.putSubscriptionFilter(options).promise()
  } catch (err) {
    console.log(`FAILED TO SUBSCRIBE [${logGroupName}]`)
    console.error(JSON.stringify(err))
    await upsertSubscriptionFilter(options)
  }
}

const subscribeAll = async (logGroups) => {
  await Promise.all(
    logGroups.map(async logGroupName => {
      if (logGroupName.endsWith(shipperFunctionName)) {
        console.log(`SKIPPING [${logGroupName}] BECAUSE IT WILL CREATE CYCLIC EVENTS FROM IT'S OWN LOGS`)
        return
      }

      console.log(`SUBSCRIBING [${logGroupName}]`)
      await subscribe(logGroupName)

      console.log(`UPDATING RETENTION POLICY TO [${retentionDays} DAYS] FOR [${logGroupName}]`)
      await setRetentionPolicy(logGroupName)
    })
  )
}

const processAll = async () => {
  const logGroups = await listLogGroups([])
  await subscribeAll(logGroups)
}

exports.handler = async () => {
  console.log('subscriber start')
  await processAll()
  console.log('subscriber done')
  return {
    statusCode: 200,
    body: JSON.stringify({ message: `Subscription successful!` })
  }
}
