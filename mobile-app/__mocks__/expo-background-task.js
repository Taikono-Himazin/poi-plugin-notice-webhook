module.exports = {
  registerTaskAsync: jest.fn(() => Promise.resolve()),
  unregisterTaskAsync: jest.fn(() => Promise.resolve()),
  BackgroundTaskResult: {
    Success: 1,
    Failed: 2,
    NoData: 3,
  },
};
