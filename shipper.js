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
    msg: parts[2]
  }
}

/**
 * Create payload for Logsene API
 */
const parseLog = (functionName, functionVersion, message, awsRegion) => {
  if (
    message.startsWith('START RequestId') ||
    message.startsWith('END RequestId') ||
    message.startsWith('REPORT RequestId')
  ) {
    return
  }

  // if log is structured
  if (message.match(regexStructuredLog)) {
    const { timestamp, requestId, msg } = splitStructuredLog(message)
    return checkLogError({
      message: msg,
      function: functionName,
      version: functionVersion,
      region: awsRegion,
      type: 'lambda',
      severity: 'debug',
      timestamp: timestamp,
      requestId: requestId
    })
  } else { // when log is NOT structured
    return checkLogError({
      message: message,
      function: functionName,
      version: functionVersion,
      region: awsRegion,
      type: 'lambda',
      severity: 'debug'
    })
  }
}

const parseLogs = (event) => {
  const logs = []

  event.Records.forEach(record => {
    const payload = Buffer.from(record.kinesis.data, 'base64')
    const json = (Zlib.gunzipSync(payload)).toString('utf8')
    const data = JSON.parse(json)
    if (data.messageType === 'CONTROL_MESSAGE') { return }

    const functionName = lambdaName(data.logGroup)
    const functionVersion = lambdaVersion(data.logStream)
    const awsRegion = record.awsRegion

    data.logEvents.forEach(logEvent => {
      const log = parseLog(functionName, functionVersion, logEvent.message, awsRegion)
      if (!log) { return }
      logs.push(log)
    })
  })

  return logs
}

const shipLogs = async (logs) => {
  return new Promise((resolve, reject) => {
    if (!logs.length) {
      return reject(new Error('No logs to ship.'))
    }
    logs.forEach(log => {
      logger.log(log.severity, 'LogseneJS', log)
    })
    logger.send(() => resolve())
  })
}

exports.handler = async (event) => {
  try {
    await shipLogs(parseLogs(event))
  } catch (err) {
    console.log(err)
    return err
  }
  return 'shipper done'
}
