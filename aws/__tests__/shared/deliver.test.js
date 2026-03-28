'use strict';

jest.mock('https');
jest.mock('http');

const https = require('https');
const http = require('http');
const { deliverNotification } = require('../../src/shared/deliver');

function mockRequest(lib) {
  const req = { on: jest.fn(), write: jest.fn(), end: jest.fn() };
  lib.request.mockImplementation((_opts, cb) => {
    const res = {
      statusCode: 200,
      on: jest.fn((event, handler) => {
        if (event === 'data') handler('');
        if (event === 'end') handler();
      }),
    };
    process.nextTick(() => cb(res));
    return req;
  });
  return req;
}

beforeEach(() => {
  https.request = jest.fn();
  http.request = jest.fn();
});

describe('deliverNotification', () => {
  test('type が none なら何も送信しない', async () => {
    await deliverNotification({ type: 'none' }, { message: 'test' });
    expect(https.request).not.toHaveBeenCalled();
  });

  test('user が null なら何も送信しない', async () => {
    await deliverNotification(null, { message: 'test' });
    expect(https.request).not.toHaveBeenCalled();
  });

  test('discord タイプは Discord Embed 形式で送信する', async () => {
    const req = mockRequest(https);
    await deliverNotification(
      { type: 'discord', url: 'https://discord.com/api/webhooks/123/abc' },
      { message: 'テスト通知', type: 'expedition', title: '遠征完了' },
    );
    expect(https.request).toHaveBeenCalled();
    const body = JSON.parse(req.write.mock.calls[0][0]);
    expect(body.username).toBe('poi 通知');
    expect(body.embeds[0].description).toBe('テスト通知');
    expect(body.embeds[0].title).toBe('遠征完了');
    expect(body.embeds[0].color).toBe(0x5865f2); // expedition color
  });

  test('slack タイプは Slack Attachment 形式で送信する', async () => {
    const req = mockRequest(https);
    await deliverNotification(
      { type: 'slack', url: 'https://hooks.slack.com/services/T/B/X' },
      { message: '入渠完了', type: 'repair' },
    );
    const body = JSON.parse(req.write.mock.calls[0][0]);
    expect(body.attachments[0].text).toBe('入渠完了');
    expect(body.attachments[0].color).toBe('#57f287'); // repair color
  });

  test('line タイプは LINE Notify API にフォーム形式で送信する', async () => {
    const req = mockRequest(https);
    await deliverNotification({ type: 'line', lineToken: 'test-line-token' }, { message: '建造完了' });
    expect(https.request).toHaveBeenCalled();
    const opts = https.request.mock.calls[0][0];
    expect(opts.hostname).toBe('notify-api.line.me');
    const body = req.write.mock.calls[0][0];
    expect(body).toContain('message=%E5%BB%BA%E9%80%A0%E5%AE%8C%E4%BA%86');
  });

  test('generic タイプはペイロードをそのまま POST する', async () => {
    const req = mockRequest(https);
    const payload = { message: 'test', type: 'expedition', title: 'Title' };
    await deliverNotification({ type: 'generic', url: 'https://example.com/hook' }, payload);
    const body = JSON.parse(req.write.mock.calls[0][0]);
    expect(body.message).toBe('test');
    expect(body.type).toBe('expedition');
  });

  test('HTTP エラー時に例外を投げる', async () => {
    const req = { on: jest.fn(), write: jest.fn(), end: jest.fn() };
    https.request.mockImplementation((_opts, cb) => {
      const res = {
        statusCode: 429,
        on: jest.fn((event, handler) => {
          if (event === 'data') handler('Rate limited');
          if (event === 'end') handler();
        }),
      };
      process.nextTick(() => cb(res));
      return req;
    });

    await expect(
      deliverNotification({ type: 'discord', url: 'https://discord.com/api/webhooks/123/abc' }, { message: 'test' }),
    ).rejects.toThrow('HTTP 429');
  });
});
