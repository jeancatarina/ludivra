function hashDomain(domain) {
    let value = 2166136261;
    for (let index = 0; index < domain.length; index += 1) {
        value ^= domain.charCodeAt(index);
        value = Math.imul(value, 16777619);
    }
    return value >>> 0;
}
export function createVisualStream(seed, domain) {
    let state = (seed ^ hashDomain(domain)) >>> 0;
    if (state === 0)
        state = 0x6d2b79f5;
    return {
        unit() {
            state ^= state << 13;
            state ^= state >>> 17;
            state ^= state << 5;
            return (state >>> 0) / 0x1_0000_0000;
        },
        signed() {
            return this.unit() * 2 - 1;
        }
    };
}
