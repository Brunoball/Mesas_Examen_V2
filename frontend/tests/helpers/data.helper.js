const { unique } = require('./env.helper');

function testEmail(label = 'MAIL') {
  return `${unique(label).toLowerCase()}@example.com`;
}

module.exports = { unique, testEmail };
