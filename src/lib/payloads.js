const NOTIFY_COLORS = {
  expedition: { hex: '#5865f2', int: 0x5865f2 },
  repair: { hex: '#57f287', int: 0x57f287 },
  construction: { hex: '#fee75c', int: 0xfee75c },
  default: { hex: '#aaaaaa', int: 0xaaaaaa },
};

const getColor = (type) => NOTIFY_COLORS[type] ?? NOTIFY_COLORS.default;

const buildGenericPayload = (msg, options) => ({
  message: msg,
  type: options.type || 'default',
  title: typeof options.title === 'string' ? options.title : '',
  timestamp: new Date().toISOString(),
});

const buildDiscordPayload = (msg, options) => ({
  username: 'poi 通知',
  embeds: [
    {
      title: typeof options.title === 'string' && options.title ? options.title : 'poi 通知',
      description: msg,
      color: getColor(options.type).int,
      timestamp: new Date().toISOString(),
      footer: { text: `poi · ${options.type || 'default'}` },
    },
  ],
});

const buildSlackPayload = (msg, options) => ({
  attachments: [
    {
      color: getColor(options.type).hex,
      title: typeof options.title === 'string' && options.title ? options.title : 'poi 通知',
      text: msg,
      footer: `poi · ${options.type || 'default'}`,
      ts: Math.floor(Date.now() / 1000),
    },
  ],
});

module.exports = { NOTIFY_COLORS, getColor, buildGenericPayload, buildDiscordPayload, buildSlackPayload };
