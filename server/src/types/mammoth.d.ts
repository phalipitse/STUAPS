// mammoth ships no TypeScript types of its own — minimal ambient declaration
// covering just the API surface this app actually uses.
declare module "mammoth" {
  export interface ExtractRawTextResult {
    value: string;
    messages: unknown[];
  }
  export function extractRawText(input: { buffer: Buffer }): Promise<ExtractRawTextResult>;
}
