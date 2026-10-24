module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/test/**/*.test.js'],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/index.js'
  ]
};