// save and parse a file
module.exports = brikkit => file => {
  brikkit.saveBricks(file);
  return new Promise((resolve, reject) => {
    let tries = 0;
    const getSaveData = () => {
      const data = brikkit.readSaveData(file);
      if (data) {
        resolve(data);
      } else {
        if (tries++ > 200)
          return reject();
        setTimeout(getSaveData, 10);
      }
    };
    getSaveData();
  });
};