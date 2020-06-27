/*
  cake's font-from-save parsing util
*/
const { moveBricks, ParseTool, WriteTool } = require('./util.tool.js');

const brs = require('brs-js');
const fs = require('fs');

// take a file and return a generator fn
module.exports = file => {
  const parser = new ParseTool(brs.read(fs.readFileSync(file)));
  // find the markers
  const startMarker = parser.query({asset: 'PB_DefaultBrick', size: [5, 5, 2], material: 'BMC_Glow', color: 0})[0];
  const endMarker = parser.query({asset: 'PB_DefaultBrick', size: [5, 5, 2], material: 'BMC_Glow', color: 7})[0];

  // determine which axis the characters are on
  const axis = startMarker.position.findIndex((x, i) => x !==  endMarker.position[i]);

  const delta = endMarker.position[axis] - startMarker.position[axis];

  // get the character plates
  const characters = parser.query({asset: 'PB_DefaultBrick', material: 'BMC_Plastic', color: 0})
    // sort them based on distance from start marker
    .sort((a, b) =>
      (a.position[axis] - b.position[axis])*delta
    )
    // get the bricks above the plate
    .map(c => {
      const size = c.rotation === 1 || c.rotation == 3 ? [c.size[1], c.size[0], c.size[2]] : c.size;
      return {
        bricks: moveBricks(parser.aboveBrick(c), c.position.map(v => -v)),
        width: size[axis] * 2,
      };
    });

  return {
    // generate brick text from string
    text: (str='', {shift=[0, 0, 0], color=[0, 0, 0], author}) => {
      // break into characters, convert to ascii
      const chars = str.split('').map(c => c.charCodeAt(0)).filter(c => c >= 32 && c <= 127);
      let length = 0;
      const tool = new WriteTool(parser.save).empty();

      // iterate through characters, adding kerning based on encoded character width
      for (const c of chars) {
        const { bricks, width } = characters[c - 32];
        // determine global offset
        let shifted = [...shift];
        // add the kerning and existing length
        shifted[axis] += (length + width/2) * Math.sign(delta);
        // center this character
        length += width + 10;
        // add it to the save
        tool.addBrick(...moveBricks(bricks, shifted));
      }
      // set the color
      tool.bricks.forEach(b => b.color = [...color, 255]);
      // set the author
      if (author) tool.setAuthor(author);
      // save
      return tool.write();
    },

    grid: (arr, {shift=[0, 0, 0], author, bricks=[]}) => {
      const tool = new WriteTool(parser.save).empty();
      for (const {char, color, pos: [x, y, z]} of arr) {
        const c = char.charCodeAt(0);
        if (c < 32 || c > 127) continue;
        const { bricks } = characters[c - 32];
        const shifted = [shift[0] + x, shift[1] + y, shift[2] + z];
        const newBricks = moveBricks(bricks, shifted);
        newBricks.forEach(b => b.color = [...color, 255]);
        tool.addBrick(...newBricks);
      }
      tool.add(...moveBricks(bricks, shift));
      // set the author
      if (author) tool.setAuthor(author);
      // save
      return tool.write();
    },
  };
}
