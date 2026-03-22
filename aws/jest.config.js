module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.js'],
  resetMocks: true,
  coverageReporters: ['text', 'json-summary', 'lcov'],
}
