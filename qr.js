(function () {
  function QR8bitByte(data) {
    this.mode = QRMode.MODE_8BIT_BYTE;
    this.data = data;
  }

  QR8bitByte.prototype = {
    getLength: function () {
      return this.data.length;
    },
    write: function (buffer) {
      for (var i = 0; i < this.data.length; i += 1) {
        buffer.put(this.data.charCodeAt(i), 8);
      }
    },
  };

  var QRMode = {
    MODE_8BIT_BYTE: 1,
  };

  function QRBitBuffer() {
    this.buffer = [];
    this.length = 0;
  }

  QRBitBuffer.prototype = {
    get: function (index) {
      var bufIndex = Math.floor(index / 8);
      return ((this.buffer[bufIndex] >>> (7 - (index % 8))) & 1) == 1;
    },
    put: function (num, length) {
      for (var i = 0; i < length; i += 1) {
        this.putBit(((num >>> (length - i - 1)) & 1) == 1);
      }
    },
    putBit: function (bit) {
      var bufIndex = Math.floor(this.length / 8);
      if (this.buffer.length <= bufIndex) {
        this.buffer.push(0);
      }
      if (bit) {
        this.buffer[bufIndex] |= 0x80 >>> (this.length % 8);
      }
      this.length += 1;
    },
  };

  function QRCodeModel(typeNumber, errorCorrectionLevel) {
    this.typeNumber = typeNumber;
    this.errorCorrectionLevel = errorCorrectionLevel;
    this.modules = null;
    this.moduleCount = 0;
    this.dataCache = null;
    this.dataList = [];
  }

  QRCodeModel.prototype = {
    addData: function (data) {
      var newData = new QR8bitByte(data);
      this.dataList.push(newData);
      this.dataCache = null;
    },
    isDark: function (row, col) {
      if (this.modules[row][col] != null) {
        return this.modules[row][col];
      }
      return false;
    },
    getModuleCount: function () {
      return this.moduleCount;
    },
    make: function () {
      if (this.typeNumber < 1) {
        this.typeNumber = 1;
      }
      this.makeImpl();
    },
    makeImpl: function () {
      this.moduleCount = this.typeNumber * 4 + 17;
      this.modules = new Array(this.moduleCount);
      for (var row = 0; row < this.moduleCount; row += 1) {
        this.modules[row] = new Array(this.moduleCount);
        for (var col = 0; col < this.moduleCount; col += 1) {
          this.modules[row][col] = null;
        }
      }
      this.setupPositionProbePattern(0, 0);
      this.setupPositionProbePattern(this.moduleCount - 7, 0);
      this.setupPositionProbePattern(0, this.moduleCount - 7);
      this.setupTimingPattern();
      this.setupTypeInfo(this.errorCorrectionLevel, 0);
      if (this.dataCache == null) {
        this.dataCache = QRCodeModel.createData(
          this.typeNumber,
          this.errorCorrectionLevel,
          this.dataList,
        );
      }
      this.mapData(this.dataCache, 0);
    },
    setupPositionProbePattern: function (row, col) {
      for (var r = -1; r <= 7; r += 1) {
        if (row + r <= -1 || this.moduleCount <= row + r) continue;
        for (var c = -1; c <= 7; c += 1) {
          if (col + c <= -1 || this.moduleCount <= col + c) continue;
          if (
            (0 <= r && r <= 6 && (c == 0 || c == 6)) ||
            (0 <= c && c <= 6 && (r == 0 || r == 6)) ||
            (2 <= r && r <= 4 && 2 <= c && c <= 4)
          ) {
            this.modules[row + r][col + c] = true;
          } else {
            this.modules[row + r][col + c] = false;
          }
        }
      }
    },
    setupTimingPattern: function () {
      for (var i = 8; i < this.moduleCount - 8; i += 1) {
        if (this.modules[i][6] == null) {
          this.modules[i][6] = i % 2 == 0;
        }
        if (this.modules[6][i] == null) {
          this.modules[6][i] = i % 2 == 0;
        }
      }
    },
    setupTypeInfo: function (errorCorrectionLevel, maskPattern) {
      var data = (errorCorrectionLevel << 3) | maskPattern;
      var bits = QRUtil.getBCHTypeInfo(data);
      for (var i = 0; i < 15; i += 1) {
        var mod = ((bits >> i) & 1) == 1;
        if (i < 6) {
          this.modules[i][8] = mod;
        } else if (i < 8) {
          this.modules[i + 1][8] = mod;
        } else {
          this.modules[this.moduleCount - 15 + i][8] = mod;
        }
        if (i < 8) {
          this.modules[8][this.moduleCount - i - 1] = mod;
        } else if (i < 9) {
          this.modules[8][15 - i - 1 + 1] = mod;
        } else {
          this.modules[8][15 - i - 1] = mod;
        }
      }
      this.modules[this.moduleCount - 8][8] = true;
    },
    mapData: function (data, maskPattern) {
      var inc = -1;
      var row = this.moduleCount - 1;
      var bitIndex = 7;
      var byteIndex = 0;
      for (var col = this.moduleCount - 1; col > 0; col -= 2) {
        if (col == 6) col -= 1;
        while (true) {
          for (var c = 0; c < 2; c += 1) {
            if (this.modules[row][col - c] == null) {
              var dark = false;
              if (byteIndex < data.length) {
                dark = ((data[byteIndex] >>> bitIndex) & 1) == 1;
              }
              var mask = QRUtil.getMask(maskPattern, row, col - c);
              if (mask) {
                dark = !dark;
              }
              this.modules[row][col - c] = dark;
              bitIndex -= 1;
              if (bitIndex == -1) {
                byteIndex += 1;
                bitIndex = 7;
              }
            }
          }
          row += inc;
          if (row < 0 || this.moduleCount <= row) {
            row -= inc;
            inc = -inc;
            break;
          }
        }
      }
    },
  };

  QRCodeModel.createData = function (typeNumber, errorCorrectionLevel, dataList) {
    var buffer = new QRBitBuffer();
    for (var i = 0; i < dataList.length; i += 1) {
      var data = dataList[i];
      buffer.put(data.mode, 4);
      buffer.put(data.getLength(), 8);
      data.write(buffer);
    }
    while (buffer.length % 8 != 0) {
      buffer.putBit(false);
    }
    var totalDataCount = QRUtil.getDataCapacity(typeNumber, errorCorrectionLevel);
    if (buffer.length / 8 > totalDataCount) {
      throw new Error("code length overflow");
    }
    while (buffer.length / 8 < totalDataCount) {
      buffer.put(0xec, 8);
      if (buffer.length / 8 >= totalDataCount) break;
      buffer.put(0x11, 8);
    }
    return buffer.buffer;
  };

  var QRUtil = {
    getBCHTypeInfo: function (data) {
      var d = data << 10;
      while (QRUtil.getBCHDigit(d) - QRUtil.getBCHDigit(0x537) >= 0) {
        d ^= 0x537 << (QRUtil.getBCHDigit(d) - QRUtil.getBCHDigit(0x537));
      }
      return ((data << 10) | d) ^ 0x5412;
    },
    getBCHDigit: function (data) {
      var digit = 0;
      while (data != 0) {
        digit += 1;
        data >>>= 1;
      }
      return digit;
    },
    getMask: function (maskPattern, i, j) {
      switch (maskPattern) {
        case 0:
          return (i + j) % 2 == 0;
        default:
          return false;
      }
    },
    getDataCapacity: function () {
      return 2953;
    },
  };

  window.qrcode = function (typeNumber, errorCorrectionLevel) {
    return new QRCodeModel(typeNumber, errorCorrectionLevel == "L" ? 1 : 1);
  };
})();
