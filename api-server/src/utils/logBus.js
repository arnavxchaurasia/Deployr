'use strict';

const { EventEmitter } = require('events');

// In-process pub/sub so the SSE log-stream endpoint can receive lines as the
// Kafka consumer processes them, without polling the database.
const bus = new EventEmitter();
bus.setMaxListeners(0);

function publishLog(deploymentId, entry) {
  bus.emit(deploymentId, { type: 'log', ...entry });
}

function publishStatus(deploymentId, status) {
  bus.emit(deploymentId, { type: 'status', status });
}

function subscribe(deploymentId, handler) {
  bus.on(deploymentId, handler);
  return () => bus.off(deploymentId, handler);
}

module.exports = { publishLog, publishStatus, subscribe };
