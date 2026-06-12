import winston from 'winston';
import 'winston-daily-rotate-file';

const { combine, timestamp, printf, json } = winston.format;

// Format that simulates sending an alert when level is 'error'
const alertFormat = winston.format((info) => {
  if (info.level === 'error') {
    // In a real production environment, this is where you'd trigger Sentry, PagerDuty, or a Slack Webhook.
    console.error('\n[ALERT TRIGGERED] A critical error or security event was logged! Dispatching alert...\n');
  }
  return info;
});

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: combine(
    alertFormat(),
    timestamp({
      format: 'YYYY-MM-DD HH:mm:ss',
    }),
    json() // JSON format for easy ingestion by Datadog, Splunk, ElasticSearch, etc.
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.DailyRotateFile({
      filename: 'logs/application-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '14d',
    }),
    new winston.transports.DailyRotateFile({
      level: 'error',
      filename: 'logs/error-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '30d',
    })
  ],
});

export default logger;
