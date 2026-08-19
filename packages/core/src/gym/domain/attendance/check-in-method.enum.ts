/**
 * Enumeration of physical/operational ingress mechanisms for gym check-ins.
 */
export enum CheckInMethod {
  /**
   * Scanned barcode from physical membership card or printed pass.
   */
  BARCODE = 'BARCODE',

  /**
   * Proximity RFID card or wristband scanned at turnstile.
   */
  RFID = 'RFID',

  /**
   * Dynamic QR code scanned from the Kinergy mobile app.
   */
  QR_CODE = 'QR_CODE',

  /**
   * Manual admission recorded by front-desk staff at the reception workstation.
   */
  MANUAL_RECEPTION = 'MANUAL_RECEPTION',

  /**
   * Biometric fingerprint or facial recognition terminal.
   */
  BIOMETRIC = 'BIOMETRIC',
}
