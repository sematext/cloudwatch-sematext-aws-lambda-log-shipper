const Zlib = require('zlib')
const Logsene = require('logsene-js')
const logger = new Logsene(process.env.LOGSENE_TOKEN)
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
const coldStartPatterns = [
  'Init Duration:'
]
const regexError = new RegExp(errorPatterns.join('|'), 'gi')
const regexConfigurationError = new RegExp(configurationErrorPatterns.join('|'), 'gi')
const regexTimeoutError = new RegExp(timeoutErrorPatterns.join('|'), 'gi')

const lambdaVersion = (logStream) => {
  const start = logStream.indexOf('[')
  const end = logStream.indexOf(']')
  return logStream.substring(start + 1, end)
}

const lambdaName = (logGroup) => {
  return logGroup.split('/').reverse()[0]
}

/**
 * Create payload for Logsene API
 */
const parseLog = (functionName, functionVersion, message, awsRegion) => {
  if (
    message.startsWith('START RequestId') ||
    message.startsWith('END RequestId')
  ) {
    return
  }

  const log = {
    message: message,
    function: functionName,
    version: functionVersion,
    region: awsRegion,
    type: 'cloudwatch'
  }

  if (message.startsWith('REPORT RequestId')) {
    log.severity = 'info'
    if (message.match(coldStartPatterns)) {
      log.severity = 'info'
      log.info = {
        type: 'cold-start'
      }
    }
  } else {
    log.severity = 'debug'
    if (message.match(regexError)) {
      log.severity = 'error'
      log.error = {
        type: 'runtime'
      }
    } else if (message.match(regexConfigurationError)) {
      log.severity = 'error'
      log.error = {
        type: 'configuration'
      }
    } else if (message.match(regexTimeoutError)) {
      log.severity = 'error'
      log.error = {
        type: 'timeout'
      }
    }
  }

  return log
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
