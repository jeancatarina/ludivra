export interface RandomStream {
    unit(): number;
    signed(): number;
}
export declare function createVisualStream(seed: number, domain: string): RandomStream;
