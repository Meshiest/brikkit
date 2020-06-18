const { sanitize } = require('../../util.js');

module.exports = brikkit => {
  const broadcast = msg => global.Brikkit.forEach(b => b !== brikkit && b.say(msg));

  const id = ((brikkit.server.config || {}).syncchat || {}).id || 'net';

  const deregister = [
    brikkit.on('join', evt => {
      const user = evt.getPlayer().getUsername();

      broadcast(`"[<color=\\"c4d7f5\\">${id}</>] <color=\\"8c98ff\\"><b>${sanitize(user)}</> joined the network.</>"`);
    }),

    brikkit.on('chat', evt => {
      const user = evt.getSender().getUsername();
      const msg = evt.getContent();
      broadcast(`"[<color=\\"c4d7f5\\">${id}</>] <color=\\"f7f6cb\\"><b>${sanitize(user)}</></>: ${sanitize(msg)}"`);
    }),
  ];

  return {
    cleanup() {
      deregister.forEach(d => d());
    },
  };
};