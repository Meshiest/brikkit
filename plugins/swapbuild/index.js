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
global.swapNetwork = global.swapNetwork || [];

const emit = msg => global.swapNetwork.forEach(b => b.say(msg));

const SWAP_LEN = 60;

global.swapTimeouts = global.swapTimeouts || [];
function clearTimeouts() {
  global.swapTimeouts.forEach(t => clearTimeout(t));
  global.swapTimeouts = [];
}

function swap() {
  // save on all servers
  emit('"Saving all servers..."');
  global.swapNetwork.forEach((b, i) => {
    b.say('"Saving..."')
    // delete old save
    if (b.savePath('swap'))
      fs.unlinkSync(b.savePath('swap'));
    b.saveBricks('swap');
    b.say('"Saved..."');
  });

  const getSaves = () => global.swapNetwork.map(b => [b, b.savePath('swap')]);

  let times = 0;
  // load saves
  function load() {
    clearTimeouts();

    // check if every server has their saves
    let saves = getSaves();
    if (saves.some(s => !s[1]) && times < 10) {
      global.swapTimeouts.push(setTimeout(load, 500));
      times ++;
      return;
    }

    emit('"All servers saved. Loading new saves!');
    global.swapNetwork.forEach((b, i) => {
      // copy file from the next server to this one
      let source = global.swapNetwork[(i + 1) % global.swapNetwork.length].savePath('swap');
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

    global.swapTimeouts.push(setTimeout(() => emit('"Swap in <color=\\"ffff00\\"><b>5 seconds</></>"'), (SWAP_LEN - 5) * 1000));
    global.swapTimeouts.push(setTimeout(() => emit('"Swap in <color=\\"ffff00\\"><b>10 seconds</></>"'), (SWAP_LEN - 10) * 1000));
    global.swapTimeouts.push(setTimeout(() => emit('"Swap in <color=\\"ffff00\\"><b>30 seconds</></>"'), (SWAP_LEN - 30) * 1000));
    global.swapTimeouts.push(setTimeout(swap, SWAP_LEN * 1000));
  }

  load();
}

console.log('starting timeout', global.swapNetwork.length);
clearTimeouts();
global.swapTimeouts.push(setTimeout(() => emit('"Swap in <color=\\"ffff00\\"><b>5 seconds</></>"'), (SWAP_LEN - 5) * 1000));
global.swapTimeouts.push(setTimeout(() => emit('"Swap in <color=\\"ffff00\\"><b>10 seconds</></>"'), (SWAP_LEN - 10) * 1000));
global.swapTimeouts.push(setTimeout(() => emit('"Swap in <color=\\"ffff00\\"><b>30 seconds</></>"'), (SWAP_LEN - 30) * 1000));
global.swapTimeouts.push(setTimeout(swap, SWAP_LEN * 1000));

module.exports = brikkit => {
  // prevent this brikkit from being re-added into swap networking
  if (brikkit._save_swap_init)
    return {
      documentation,
      cleanup() {
        clearTimeouts();
      }
    };

  const id = ((brikkit.server.config || {}).swapbuild || {}).id;
  brikkit._save_swap_init = true;
  global.swapNetwork.push(brikkit);

  return {
    documentation,
    cleanup() {
      clearTimeouts();
    }
  };
};