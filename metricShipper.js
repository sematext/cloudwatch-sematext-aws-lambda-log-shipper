const Zlib = require('zlib')
const axios = require('axios')
const spmToken = process.env.SPM_TOKEN
const spmReceiverUrl = process.env.SPM_RECEIVER_URL

const lambdaVersion = (logStream) => {
  const start = logStream.indexOf('[')
  const end = logStream.indexOf(']')
  return logStream.substring(start + 1, end)
}

const lambdaName = (logGroup) => {
  return logGroup.split('/').reverse()[0]
}

const parseStringWith = (regex, input) => {
  const res = regex.exec(input)
  return String(res[1])
}

const parseFloatWith = (regex, input) => {
  const res = regex.exec(input)
  return parseFloat(res[1])
}

const parseFloatWithAndConvertToBytes = (regex, input) => {
  const res = regex.exec(input)
  return parseFloat(res[1]) * 1000000
}

// BUG: timestamp is not from invocation out of Kinesis, but instead of the metricShipper :(
const getNanoSecondTimestamp = () => {
  return (new Date()).getTime() * 1000000 // to get ns timestamp
}

/**
 * Create payload for SPM API
 */
const parseMetric = (functionName, functionVersion, message, awsRegion) => {
  if (message.startsWith('REPORT RequestId:')) {
    const parts = message.split('\t', 5)

    const requestId = parseStringWith(/REPORT RequestId: (.*)/i, parts[0])
    const duration = parseFloatWith(/Duration: (.*) ms/i, parts[1]) // in ms
    const billedDuration = parseFloatWith(/Billed Duration: (.*) ms/i, parts[2]) // in ms
    const memorySize = parseFloatWithAndConvertToBytes(/Memory Size: (.*) MB/i, parts[3]) // in bytes
    const memoryUsed = parseFloatWithAndConvertToBytes(/Max Memory Used: (.*) MB/i, parts[4]) // in bytes
    const timestamp = getNanoSecondTimestamp()

    return `function,token=${spmToken},function.name=${functionName},function.version=${functionVersion},function.request.id=${requestId},aws.region=${awsRegion} duration=${duration},duration.billed=${billedDuration}i,memory.size=${memorySize}i,memory.used=${memoryUsed}i ${timestamp}`
  }
}

const parseMetrics = (event) => {
  const metrics = []

  event.Records.forEach(record => {
    const payload = Buffer.from(record.kinesis.data, 'base64')
    const json = (Zlib.gunzipSync(payload)).toString('utf8')
    const data = JSON.parse(json)
    if (data.messageType === 'CONTROL_MESSAGE') { return }
    const functionName = lambdaName(data.logGroup)
    const functionVersion = lambdaVersion(data.logStream)
    const awsRegion = record.awsRegion

    data.logEvents.forEach(logEvent => {
      const metric = parseMetric(functionName, functionVersion, logEvent.message, awsRegion)
      if (metric) {
        metrics.push(metric)
      }
    })
  })

  return metrics
}

const sendMetrics = async (metrics) => {
  if (!metrics.length) {
    return 'No metrics to ship.'
  }

  const config = {
    headers: {
      'Content-Length': 0,
      'Content-Type': 'text/plain'
    },
    responseType: 'text'
  }
  await Promise.all(metrics.map(m => axios.post(spmReceiverUrl, m, config)))
  return 'Metrics shipped successfully!'
}

exports.handler = async (event) => {
  try {
    const res = await sendMetrics(parseMetrics(event))
    console.log(res)
  } catch (err) {
    console.log(err)
    return err
    // TODO: handle err by pushing to SNS, and consume by another Lambda to retry with DLQ
  }
  return 'metric shipper done'
}
