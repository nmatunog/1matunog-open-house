declare module 'qrcode' {
  const QRCode: {
    toDataURL(
      text: string,
      opts?: {
        margin?: number;
        width?: number;
        errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
        color?: { dark?: string; light?: string };
      },
    ): Promise<string>;
  };
  export default QRCode;
}
