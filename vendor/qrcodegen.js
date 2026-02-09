/*
 * Lightweight placeholder QR generator.
 * Replace with a full QR engine for production use.
 */
(() => {
  class QrCode {
    static Ecc = { L: "L" };

    static encodeText(text) {
      return new QrCode(text);
    }

    constructor(text) {
      this.text = text;
      this.size = 29;
    }

    getSize() {
      return this.size;
    }

    getModule(x, y) {
      const hash = this.text.length % 7;
      return (x + y + hash) % 3 === 0;
    }
  }

  window.qrcodegen = { QrCode };
})();
