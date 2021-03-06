// Documentation for this game, also for helptext generator
const documentation = {
  name: 'minesweeper',
  description: 'Play and generate minesweeper games',
  author: 'cake',
  configFormat: {
    authorized: [ // list of authorized users
      'username',
    ],
  },
  commands: [{
    name: '!ms:start',
    description: 'Start a game of minesweeper',
    example: '!ms:start width:30 height:16 mines:130',
    args: [
      {name: 'size:#', description: 'sets width and height of game (default: 10)', required: false},
      {name: 'width:#', description: 'sets width of game (default: 10)', required: false},
      {name: 'height:#', description: 'sets height of game (default: 10)', required: false},
      {name: 'mines:#', description: 'sets height of game (default: 15% of size)', required: false},
    ]
  }, {
    name: '!ms:mine',
    description: 'Mine a tile in tile below the player in an active game',
    example: '!ms:mine',
    args: [],
  }, {
    name: '!ms:stats',
    description: 'Get stats for the game below the player',
    example: '!ms:stats',
    args: [],
  }, {
    name: '!ms:clearall',
    description: 'Clear all bricks and reset game data (config authorized only)',
    example: '!ms:clearall',
    args: [],
  }, {
    name: '!ms:trust',
    description: 'Toggle trust of user to play on your active games',
    example: '!ms:trust Zeblote',
    args: [
      {name: 'username', description: 'Username of target player', required: true},
    ],
  }]
};

const brs = require('brs-js');
const fs = require('fs');
const { sanitize } = require('../../util.js');

const { ParseTool, WriteTool, moveBricks, studs } = require('../cakeutils/util.tool.js');
const PlayerPosProvider = require('../cakeutils/util.playerPos.js');
const CooldownProvider = require('../cakeutils/util.cooldown.js');

// determine which tileset to use
const MINESIZE = 8; // 4 is also an option for uglier and smaller grid
const MINESAVE = __dirname + '/tileset.brs';

const defaultTileset = new ParseTool(brs.read(fs.readFileSync(MINESAVE)));

// queries for tileset
const TILESET_QUERIES = {
  tile: ({asset: 'PB_DefaultBrick', size: [MINESIZE*5, MINESIZE*5, 2], material: 'BMC_Metallic', color: 1}),
  mine: ({asset: 'PB_DefaultBrick', size: [MINESIZE*5, MINESIZE*5, 2], material: 'BMC_Metallic', color: 2}),
  x: ({asset: 'PB_DefaultBrick', size: [MINESIZE*5, MINESIZE*5, 2], material: 'BMC_Metallic', color: 3}),
  smile: ({asset: 'PB_DefaultBrick', size: [MINESIZE*5, MINESIZE*5, 2], material: 'BMC_Glow', color: 1}),
  frown: ({asset: 'PB_DefaultBrick', size: [MINESIZE*5, MINESIZE*5, 2], material: 'BMC_Glow', color: 2}),
  sunglasses: ({asset: 'PB_DefaultBrick', size: [MINESIZE*5, MINESIZE*5, 2], material: 'BMC_Glow', color: 3}),
  0: ({asset: 'PB_DefaultBrick', size: [MINESIZE*5, MINESIZE*5, 2], material: 'BMC_Glow', color: 0}),
  1: ({asset: 'PB_DefaultBrick', size: [MINESIZE*5, MINESIZE*5, 2], material: 'BMC_Hologram', color: 0}),
  2: ({asset: 'PB_DefaultBrick', size: [MINESIZE*5, MINESIZE*5, 2], material: 'BMC_Hologram', color: 1}),
  3: ({asset: 'PB_DefaultBrick', size: [MINESIZE*5, MINESIZE*5, 2], material: 'BMC_Hologram', color: 2}),
  4: ({asset: 'PB_DefaultBrick', size: [MINESIZE*5, MINESIZE*5, 2], material: 'BMC_Hologram', color: 3}),
  5: ({asset: 'PB_DefaultBrick', size: [MINESIZE*5, MINESIZE*5, 2], material: 'BMC_Hologram', color: 4}),
  6: ({asset: 'PB_DefaultBrick', size: [MINESIZE*5, MINESIZE*5, 2], material: 'BMC_Hologram', color: 5}),
  7: ({asset: 'PB_DefaultBrick', size: [MINESIZE*5, MINESIZE*5, 2], material: 'BMC_Hologram', color: 6}),
  8: ({asset: 'PB_DefaultBrick', size: [MINESIZE*5, MINESIZE*5, 2], material: 'BMC_Hologram', color: 7}),
};

// parse tiles helper func
const parseTiles = tool => Object.fromEntries(Object.entries(TILESET_QUERIES).map(([i, q]) => {
  const plate = tool.query(q)[0];
  if (!plate)
    return [i, null];
  return [i, moveBricks(tool.aboveBrick(plate), plate.position.map(v => -v))];
}))

// generate a save from a list of tiles ({tile: 'tile name', pos: [x, y, z]})
const getTileSaveProvider = parser => {
  // parse the tileset
  const tiles = parseTiles(parser);

  // return a function to generate saves from the tiles
  return (grid=[], author=null) => {
    const tool = new WriteTool(parser.save).empty();

    // add an author if provided
    if (author)
      tool.authors = [author];

    // add all the tiles to the save
    for (const {tile, pos: [x, y, z], owned} of grid) {
      const bricks = moveBricks(tiles[tile], studs(x * MINESIZE, y * MINESIZE, z));

      if (owned)
        bricks.forEach(b => b.owner_index = 2);

      tool.addBrick(...bricks);
    }
    return tool.write();
  };
}

const getTileSave = getTileSaveProvider(defaultTileset);

// populate a minesweeper board with mines, provide some helper funcs
const genMinesweeperBoard = (width, height, mines, banned=[]) => {
  // build the board widthxheight
  const board = Array.from({length: width})
    .map(() => Array.from({length: height}).fill(0));

  // rand helper fn
  const rand = n => Math.floor(Math.random() * n);

  // out of bounds
  const oob = (x, y) => (x === 0 && y === 0 || x === 0 && y === height-1 || x === width-1 && y === 0 || x === width-1 && y === height-1);

  // place a mine on the board
  const placeMine = () => {
    let x, y;
    do {
      x = rand(width);
      y = rand(height);
    } while(board[x][y] === 1 || oob(x, y) || banned.some(b => b[0] === x && b[1] === y));
    board[x][y] = 1;
  };

  // place mines on the board
  for(let i = 0; i < mines; i++)
    placeMine();

  // determine if a coordinate is a mine
  board.isMine = (x, y) => x >= 0 && x < width && y >= 0 && y < height && board[x][y] === 1;

  // count mines around a cell
  board.count = (x, y) => [[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]]
    .map(n => [x+n[0], y+n[1]])
    .filter(([nx, ny]) => nx >= 0 && nx < width && ny >= 0 && ny < height && board[nx][ny] === 1)
    .length;

  return board;
}

module.exports = brikkit => {
  const deregister = [];
  // list of authorized users from config
  const authorized = ((brikkit.server.config || {}).minesweeper || {}).authorized || [];

  // minesweeper state that persists across saves
  global.minesweepers = global.minesweepers || [];
  global.minesweeperTrust = global.minesweeperTrust || {};

  const getPlayerPos = PlayerPosProvider(brikkit, deregister);
  const cooldown = CooldownProvider(1000);
  const startCooldown = CooldownProvider(5000);

  // helper for finding the game a player is over
  const findGame = (x, y, ignore) => global.minesweepers.find(game =>
    x >= game.left && y >= game.top && y < game.bottom && x < game.right && (ignore || game.inProgress));

  // determine if a user trusts another player
  const hasTrust = (owner, user) =>
    owner === user || global.minesweeperTrust[owner] && global.minesweeperTrust[owner].includes(user);


  deregister.push(brikkit.on('chat', evt => {
    const name = evt.getSender().getUsername();
    const [command, ...args] = evt.getContent().split(' ');
    const now = Date.now();

    if (command === '!ms:start' && startCooldown(name)) {
      if (global.minesweepers.find(m => m.name === name && m.inProgress)) {
        brikkit.say(`"<b>${sanitize(name)}</> already has a game in progress"`)
        return;
      }

      // default game setup
      let width = 10;
      let height = 10;
      let mines = 0;

      // parse key:val from args
      for (const arg of args) {
        if (arg.split(':').length !== 2) continue;
        let [key, val] = arg.split(':');

        val = parseInt(val);
        if (val != Math.floor(val))
          continue;

        switch(key) {
        case 'width':
          width = Math.max(Math.min(50, val), 5);
          break;
        case 'height':
          height = Math.max(Math.min(50, val), 5);
          break;
        case 'size':
          width = Math.max(Math.min(50, val), 5);
          height = Math.max(Math.min(50, val), 5);
          break;
        case 'mines':
          mines = Math.max(val, 1);
          break;
        }
      }

      if (mines === 0)
        mines = Math.round(width * height * 0.15); // default game is 15% mines, yields ~ 50% win ratio

      if(mines > width * height - 5) {
        brikkit.say(`"<b>${sanitize(name)}</>'s game would have too many mines"`);
        return;
      }

      // create a new game
      const startGame = (x, y) => {
        const left = x;
        const top = y;
        const bottom = (y + height);
        const right = (x + width);
        brikkit.say(`"<b>${sanitize(name)}</> starting at (${left},${top}) (${width}x${height} ${mines} mines = ${Math.round(mines/(width*height)*100)}%)"`)

        if (global.minesweepers.find(m =>
          !(left > m.right ||
           right < m.left ||
           top > m.bottom ||
           bottom < m.top)
        )) {
          brikkit.say(`"<b>${sanitize(name)}</> can't start a game here (overlap)"`)
          return;
        }

        const game = {
          width,
          height,
          mines,
          name,
          inProgress: true,
          x, y,
          left, top, bottom, right,
          stats: {},
        };

        game.progress = () => {
          // count revealed cells
          let revealed = 0;
          for (let i = 0; i < game.width; i++)
            for (let j = 0; j < game.height; j++)
              if (game.generated[i][j])
                revealed ++;

          // compare to total number of possible cells
          return Math.min(revealed / (game.width * game.height - game.mines), 1);
        };

        game.generated = Array.from({length: width})
          .map(() => Array.from({length: height}).fill(0));
        let grid = [];
        grid.push({tile: 'smile', pos: [-1 + left, -1 + top, -1]});
        for (let i = 0; i < game.width; i++)
          for (let j = 0; j < game.height; j++)
            grid.push({tile: 'tile', pos: [i + left, j + top, -1]});
        brikkit.writeSaveData('mine_' + name, getTileSave(grid));
        brikkit.loadBricks('mine_' + name);
        global.minesweepers.push(game);
      };

      // get player position and start game at that spot
      getPlayerPos(name)
        .catch(() => brikkit.say(`"Could not find ${sanitize(name)}"`))
        .then(({x, y, z}) =>  {
          x = Math.round(x/MINESIZE/10);
          y = Math.round(y/MINESIZE/10);

          startGame(x, y);
        });
    }

    // mine the current location
    if (command === '!ms:mine' && cooldown(name)) {
      // mine at a position
      const mine = (x, y) => {
        const game = findGame(x, y);

        if (!game) {
          brikkit.say(`"<b>${sanitize(name)}</> not over an active game"`)
          return;
        }

        if (!hasTrust(game.name, name)) {
          brikkit.say(`"<b>${sanitize(game.name)}</> does not trust you to do that, <b>${sanitize(name)}</>"`)
          return;
        }

        const cx = x - game.x;
        const cy = y - game.y;

        let grid = [];

        if (!game.board)
          game.board = genMinesweeperBoard(game.width, game.height, game.mines, [[cx, cy]]);

        // end game if there's a mine
        if(game.board.isMine(cx, cy)) {
          // render an X at this mine
          grid.push({tile: 'x', pos: [cx, cy, 1]});

          // render the game mines
          for(let i = 0; i < game.width; i++)
            for(let j = 0; j < game.width; j++)
              if (game.board.isMine(i, j))
                grid.push({tile: 'mine', pos: [i, j, 0]});

          // end the game, add a frown
          game.inProgress = false;
          grid.push({tile: 'frown', pos: [-1, -1, 0]});
          game.lastMove = name;
          brikkit.say(`"<color=\\"ff9999\\"><b>${sanitize(name)}</> lost a game at <b>${Math.round(game.progress()*100)}% complete</>${
            name !== game.name ? ` on <b>${sanitize(game.name)}</>'s behalf` : ' '
          }...</> (${game.width}x${game.height} ${game.mines} mines = ${Math.round(game.mines/(game.width*game.height)*100)}%)"`);
        } else {
          const count = game.board.count(cx, cy);
          game.stats[name] = (game.stats[name] || 0) + 1;
          // render the count if there's more than 0
          if (count > 0) {
            grid.push({tile: 0, pos: [cx, cy, 0]});
            grid.push({tile: count, pos: [cx, cy, 1]});
          } else {
            // otherwise recursively reveal the cells that are adjacent to connecting 0's
            let revealed = {};

            // check if a cell has been or will be revealed
            const hidden = (x, y) => !revealed[x + '_' + y] && !game.generated[x][y];

            function reveal(x, y) {
              // reveal this cell
              revealed[x + '_' + y] = true;

              // render the count
              const count = game.board.count(x, y);
              grid.push({tile: 0, pos: [x, y, 0]});

              // don't recurse if this is nonzero
              if (count !== 0) {
                grid.push({tile: count, pos: [x, y, 1]});
                return;
              }

              // reveal in all 8 directions if not already revealed
              if (y > 0 && hidden(x, y - 1)) reveal(x, y - 1);
              if (y < (game.height - 1) && hidden(x, y + 1)) reveal(x, +y + 1);
              if (x < (game.width - 1) && hidden(x + 1, y)) reveal(+x + 1, y);
              if (x > 0 && hidden(x - 1, y)) reveal(x - 1, y);
              if (y > 0 && x > 0 && hidden(x - 1, y - 1)) reveal(x - 1, y - 1);
              if (y > 0 && x < (game.width - 1) && hidden(x + 1, y - 1)) reveal(x + 1, y - 1);
              if (y < (game.height - 1) && x < (game.width - 1) && hidden(x + 1, y + 1)) reveal(x + 1, y + 1);
              if (y < (game.height - 1) && x > 0 && hidden(x - 1, y + 1)) reveal(x - 1, +y + 1);
            }
            reveal(cx, cy);
          }
        }

        // remove ones that were already generated
        grid = grid.filter(({pos: [x, y, z]}) => x < 0 || y < 0 || !game.generated[x][y])
        if (game.inProgress)
          grid.forEach(({pos: [x, y, z]}) => {
            if(x >= 0 && y >= 0) game.generated[x][y] = 1
          });

        // only win if the game is in progress and all the non-bomb cells have been reveal
        let win = false;
        if (game.inProgress && game.progress() === 1) {
          game.inProgress = false;
          win = true;
          // render sunglasses
          grid.push({tile: 'sunglasses', pos: [-1, -1, 0]});
        }

        // write to save and load bricks
        brikkit.writeSaveData('mine_' + name, getTileSave(grid
          .map(({tile, pos: [x, y, z]}) => ({tile, pos: [x + game.left, y + game.top, z]}))
        ));
        brikkit.loadBricks('mine_' + name);

        // announce win
        if (win) {
          game.lastMove = name;
          brikkit.say(`"<color=\\"99ff99\\"><b>${sanitize(name)}</> finished a game${
            name !== game.name ? ` on <b>${sanitize(game.name)}</>'s behalf` : ''
          }!</> (${game.width}x${game.height} ${game.mines} mines = ${Math.round(game.mines/(game.width*game.height)*100)}%)"`)
        }
      }

      getPlayerPos(name)
        .catch(() => brikkit.say(`"Could not find ${sanitize(name)}"`))
        .then(({x, y, z}) => mine(Math.round(x/MINESIZE/10), Math.round(y/MINESIZE/10)));
    }

    // get board stats for current location
    if (command === '!ms:stats' && cooldown(name)) {
      const stats = (x, y) => {
        const game = findGame(x, y, true);

        if (!game) {
          brikkit.say(`"<b>${sanitize(name)}</> not over a game"`)
          return;
        }

        brikkit.say(`"[${
          game.inProgress
            ? `<color=\\"cccccc\\">${Math.round(game.progress()*100)}%</>`
            : game.progress() !== 1 ? `<color=\\"ff9999\\">lost @ ${Math.round(game.progress()*100)}%</>` : '<color=\\"99ff99\\">won</>'
        }] <b>${sanitize(game.name)}</> (${game.width}x${game.height} ${game.mines} mines = ${Math.round(game.mines/(game.width*game.height)*100)}%)"`);
        if (game.stats && Object.keys(game.stats).length) {
          for (const key in game.stats) {
            brikkit.say(`" -- <b>${sanitize(key)}</>: ${game.stats[key]} moves ${game.lastMove && game.lastMove === key ? '(final move)' : ''}"`);
          }
          if (game.lastMove && !game.stats[game.lastMove])
            brikkit.say(`"<b>${sanitize(game.lastMove)}</>'s only move was losing the game"`);
        }
      };

      getPlayerPos(name)
        .catch(() => brikkit.say(`"Could not find ${sanitize(name)}"`))
        .then(({x, y, z}) => stats(Math.round(x/MINESIZE/10), Math.round(y/MINESIZE/10)));
    }

    // trust a player
    if (command === '!ms:trust' && cooldown(name) && args.length > 0) {
      const target = args.join(' ');
      if (target === name)
        return;

      if (!brikkit.getPlayerFromUsername(args.join(' '))) {
        brikkit.say(`"Could not find <b>${sanitize(target)}</>"`)
        return;
      }

      if (!global.minesweeperTrust[name])
        global.minesweeperTrust[name] = [];

      if (global.minesweeperTrust[name].includes(target)) {
        global.minesweeperTrust[name].splice(global.minesweeperTrust[name].indexOf(target), 1);
        brikkit.say(`"<b>${sanitize(name)}</> no longer trusts <b>${sanitize(target)}</> for minesweeper"`)
      }
      else {
        global.minesweeperTrust[name].push(target);
        brikkit.say(`"<b>${sanitize(name)}</> now trusts <b>${sanitize(target)}</> for minesweeper"`)
      }
    }

    if (command === '!ms:clearall' && authorized.includes(name)) {
      global.minesweepers = [];
      brikkit.clearAllBricks();
      return;
    }
  }));

  return {
    cleanup() {
      deregister.forEach(d => d());
    },
    documentation,
  };
};
