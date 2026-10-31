/**
 * The clap: a short burst of noise with a low knock under it, made on the spot
 * so there is no file to load and nothing to wait for. It has a sharp start on
 * purpose — the sound recordist lines up on that transient.
 */

let ctx: AudioContext | null = null;

/** Schedules the clap `delay` seconds from now. Must be called inside the tap, so the browser lets it play. */
export function playClap(delay: number): boolean {
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return false;
    ctx ??= new Ctor();
    if (ctx.state === 'suspended') void ctx.resume();
    const at = ctx.currentTime + delay;

    const length = Math.floor(ctx.sampleRate * 0.08);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 4);
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 2400;
    band.Q.value = 0.7;
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 1.4;
    noise.connect(band).connect(noiseGain).connect(ctx.destination);
    noise.start(at);

    const knock = ctx.createOscillator();
    knock.type = 'triangle';
    knock.frequency.setValueAtTime(180, at);
    knock.frequency.exponentialRampToValueAtTime(60, at + 0.06);
    const knockGain = ctx.createGain();
    knockGain.gain.setValueAtTime(0.0001, at);
    knockGain.gain.exponentialRampToValueAtTime(0.9, at + 0.002);
    knockGain.gain.exponentialRampToValueAtTime(0.0001, at + 0.07);
    knock.connect(knockGain).connect(ctx.destination);
    knock.start(at);
    knock.stop(at + 0.08);
    return true;
  } catch {
    return false;
  }
}
