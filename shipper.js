const Zlib = require('zlib')
const Logsene = require('logsene-js')
const logger = new Logsene(process.env.LOGS_TOKEN)
const errorPatterns = [
  'error'
]
const configurationErrorPatterns = [
  'module initialization error',
  'unable to import module'
]
const timeoutErrorPatterns = [
  'task timed out',
  'process exited before completing'
]
/**
 * Sample of a structured log
 * ***************************************************************************
 * Timestamp                RequestId                            Message
 * 2019-03-08T15:58:45.736Z 53499d7f-60f1-476a-adc8-1e6c6125a67c Hello World!
 * ***************************************************************************
 */
const structuredLogPattern = '[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[1-2][0-9]|3[0-1])T(2[0-3]|[01][0-9]):[0-5][0-9]:[0-5][0-9].[0-9][0-9][0-9]Z([ \t])[a-zA-Z0-9]{8}-[a-zA-Z0-9]{4}-[a-zA-Z0-9]{4}-[a-zA-Z0-9]{4}-[a-zA-Z0-9]{12}([ \t])(.*)'
const regexError = new RegExp(errorPatterns.join('|'), 'gi')
const regexConfigurationError = new RegExp(configurationErrorPatterns.join('|'), 'gi')
const regexTimeoutError = new RegExp(timeoutErrorPatterns.join('|'), 'gi')
const regexStructuredLog = new RegExp(structuredLogPattern)
const lambdaVersion = (logStream) => logStream.substring(logStream.indexOf('[') + 1, logStream.indexOf(']'))
const lambdaName = (logGroup) => logGroup.split('/').reverse()[0]
const clearLogBuffer = async () => new Promise(resolve => logger.send(() => resolve()))

const checkLogError = (log) => {
  if (log.message.match(regexError)) {
    log.severity = 'error'
    log.error = {
      type: 'runtime'
    }
  } else if (log.message.match(regexConfigurationError)) {
    log.severity = 'error'
    log.error = {
      type: 'configuration'
    }
  } else if (log.message.match(regexTimeoutError)) {
    log.severity = 'error'
    log.error = {
      type: 'timeout'
    }
  }
  return log
}
const splitStructuredLog = (message) => {
  const parts = message.split('\t', 3)
  return {
    timestamp: parts[0],
    requestId: parts[1],
    message: parts[2]
  }
}

/**
 * Create payload for Logsene API
 */
const parseLog = (functionName, functionVersion, logEventMessage, awsRegion) => {
  if (
    logEventMessage.startsWith('START RequestId') ||
    logEventMessage.startsWith('END RequestId') ||
    logEventMessage.startsWith('REPORT RequestId')
  ) {
    return
  }

  try {
    // Message is JSON

    const { requestId, timestamp, ...parsedMessage } = JSON.parse(logEventMessage)
    return checkLogError({
      'function.name': functionName,
      'function.version': functionVersion,
      '@timestamp': timestamp,
      'function.request.id': requestId,
      ...parsedMessage,
      region: awsRegion,
      type: 'lambda',
      severity: 'debug'
    })
  } catch (error) {
    // If the JSON.parse() error is thrown the message is NOT a JSON string

    // if log is structured adhering to the structuredLogPattern regex
    if (logEventMessage.match(regexStructuredLog)) {
      const { timestamp, requestId, message } = splitStructuredLog(logEventMessage)
      return checkLogError({
        'function.name': functionName,
        'function.version': functionVersion,
        '@timestamp': timestamp,
        'function.request.id': requestId,
        message: message,
        region: awsRegion,
        type: 'lambda',
        severity: 'debug'
      })
    } else { // if log is NOT structured
      return checkLogError({
        'function.name': functionName,
        'function.version': functionVersion,
        message: logEventMessage,
        region: awsRegion,
        type: 'lambda',
        severity: 'debug'
      })
    }
  }
}

const parseRecords = (event) => {
  const rec = {
    logs: [],
    recordCounter: 0,
    logEventCounter: 0
  }

  event.Records.forEach(record => {
    const payload = Buffer.from(record.kinesis.data, 'base64')
    const json = (Zlib.gunzipSync(payload)).toString('utf8')
    const data = JSON.parse(json)
    if (data.messageType === 'CONTROL_MESSAGE') { return }
    rec.recordCounter += 1

    const functionName = lambdaName(data.logGroup)
    const functionVersion = lambdaVersion(data.logStream)
    const awsRegion = record.awsRegion

    data.logEvents.forEach(logEvent => {
      const log = parseLog(functionName, functionVersion, logEvent.message, awsRegion)

      if (log) { rec.logs.push(log) }
      rec.logEventCounter += 1
    })
  })

  return rec
}

const shipLogs = async (logs) => {
  if (!logs.length) { return 'No logs to ship.' }
  logs.forEach(log => logger.log(log.severity, 'LogseneJS', log))
  await clearLogBuffer()
  return 'Logs shipped successfully!'
}

exports.handler = async (event) => {
  try {
    const { logs } = parseRecords(event)
    await shipLogs(logs)
  } catch (err) {
    logger.log('error', 'Shipper executed with error!', err)
    await clearLogBuffer()
    return err
    // TODO: handle err by pushing to SNS, and consume by another Lambda to retry with DLQ
  }
  return 'log shipper done'
}
