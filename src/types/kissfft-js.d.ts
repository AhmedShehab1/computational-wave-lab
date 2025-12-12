declare module 'kissfft-js' {
  export class FFT {
    constructor(size: number)
    forward(input: Float32Array): Float32Array
    dispose(): void
  }
}
