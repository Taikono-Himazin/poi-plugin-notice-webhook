module.exports = {
  makeRedirectUri: jest.fn(() => 'poi-notice://auth'),
  AuthRequest: jest.fn().mockImplementation(() => ({
    codeVerifier: 'test-verifier',
    promptAsync: jest.fn(),
  })),
  exchangeCodeAsync: jest.fn(),
  refreshAsync: jest.fn(),
  ResponseType: { Code: 'code' },
};
