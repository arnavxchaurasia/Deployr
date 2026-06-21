let ioInstance = null;

module.exports = {
  init: (io) => {
    ioInstance = io;
  },
  getIO: () => {
    if (!ioInstance) {
      throw new Error("Socket.io is not initialized!");
    }
    return ioInstance;
  }
};
