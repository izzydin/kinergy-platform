declare module 'unpdf' {
  export interface ExtractTextResult {
    totalPages: number;
    text: string | string[];
  }

  export interface ExtractTextOptions {
    mergePages?: boolean;
  }

  export function extractText(
    data: Uint8Array | ArrayBuffer | Buffer,
    options?: ExtractTextOptions,
  ): Promise<ExtractTextResult>;

  export function getDocumentProxy(data: Uint8Array | ArrayBuffer | Buffer): Promise<unknown>;

  export function getMeta(data: Uint8Array | ArrayBuffer | Buffer): Promise<unknown>;
}
