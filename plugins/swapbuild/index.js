// documentation for this plugin
const documentation = {
  name: 'swapbuild',
  description: 'Rotates builds between parallel hosted brikkit servers',
  author: 'cake',
  commands: [],
};

const fs = require('fs');
const path = require('path');

// servers in the network
const network = [];

const emit = msg => network.forEach(b => b.say(msg));
let swapTimeout, loadTimeout;

const SWAP_LEN = 60;

let timeouts = [];
function clearTimeouts() {
  timeouts.forEach(t => clearTimeout(t));
  timeouts = [];
}

function swap() {
  // save on all servers
  emit('"Saving all servers..."');
  network.forEach((b, i) => {
    b.say('"Saving..."')
    // delete old save
    if (b.savePath('swap'))
      fs.unlinkSync(b.savePath('swap'));
    b.saveBricks('swap');
    b.say('"Saved..."');
  });

  const getSaves = () => network.map(b => [b, b.savePath('swap')]);

  let times = 0;
  // load saves
  function load() {
    clearTimeouts();

    // check if every server has their saves
    let saves = getSaves();
    if (saves.some(s => !s[1]) && times < 10) {
      timeouts.push(setTimeout(load, 500));
      times ++;
      return;
    }

    emit('"All servers saved. Loading new saves!');
    network.forEach((b, i) => {
      // copy file from the next server to this one
      let source = network[(i + 1) % network.length].savePath('swap');
      if (source) {
        fs.copyFileSync(source, path.join(b._brickadia.SAVES_PATH, 'swapped.brs'));


        b.say('"Clearing and Loading..."');
        b.clearAllBricks();
        b.loadBricks('swapped');
      } else {
        b.clearAllBricks();
        b.say('"No bricks to swap"');
      }
    });

    timeouts.push(setTimeout(() => emit("Swap in 5 seconds"), (SWAP_LEN - 5) * 1000));
    timeouts.push(setTimeout(() => emit("Swap in 10 seconds"), (SWAP_LEN - 10) * 1000));
    timeouts.push(setTimeout(() => emit("Swap in 30 seconds"), (SWAP_LEN - 30) * 1000));
    timeouts.push(setTimeout(swap, SWAP_LEN * 1000));
  }

  load();
}

timeouts.push(setTimeout(() => emit("Swap in 5 seconds"), (SWAP_LEN - 5) * 1000));
timeouts.push(setTimeout(() => emit("Swap in 10 seconds"), (SWAP_LEN - 10) * 1000));
timeouts.push(setTimeout(() => emit("Swap in 30 seconds"), (SWAP_LEN - 30) * 1000));
timeouts.push(setTimeout(swap, SWAP_LEN * 1000));

module.exports = brikkit => {
  // prevent this brikkit from being re-added into swap networking
  if (brikkit._in_swap_network)
    return {
      documentation,
      cleanup() {
        clearTimeouts();
      }
    };

  const id = ((brikkit.server.config || {}).swapbuild || {}).id;
  brikkit._in_swap_network = true;
  network.push(brikkit);
  if (b.savePath('swap'))
    b.loadBricks('swap');

  return {
    documentation,
    cleanup() {
      clearTimeouts();
    }
  };
};