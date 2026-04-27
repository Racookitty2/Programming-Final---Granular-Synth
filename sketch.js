

let channels = [];
let grainWindow;

let sliderSettings = [
  [0, 1, 0.6, 0.01],       // volume
  [0.25, 2.5, 1, 0.01],    // pitch
  [0, 1, 0.25, 0.001],     // grain position
  [0.08, 1.2, 0.25, 0.005],// grain size
  [0, 0.9, 0.6, 0.01],     // grain overlap
  [0, 1, 0.15, 0.01]       // reverb
];

function setup() {
  createCanvas(900, 520);

  grainWindow = makeHannWindow(512);

  channels[0] = makeChannel(40, 30);
  channels[1] = makeChannel(500, 30);
}

function draw() {
  background(245);

  for (let ch of channels) {
    updateAudio(ch);
    scheduleGrains(ch);
  }

  drawWaveform(channels[0], 40, 300, 360, 180);
  drawWaveform(channels[1], 500, 300, 360, 180);
}

function makeChannel(x, y) {
  let ch = {};

  ch.sound = null;
  ch.buffer = null;
  ch.peaks = [];

  ch.playing = false;
  ch.nextGrainTime = 0;

  ch.sliders = [];

  ch.audioReady = false;
  ch.input = null;
  ch.dry = null;
  ch.wet = null;
  ch.convolver = null;
  ch.output = null;

  ch.fileInput = createFileInput(function(file) {
    loadAudio(ch, file);
  });
  ch.fileInput.position(x, y);

  ch.playButton = createButton(">");
  ch.playButton.position(x + 260, y);
  ch.playButton.mousePressed(function() {
    togglePlay(ch);
  });

  for (let i = 0; i < sliderSettings.length; i++) {
    let s = sliderSettings[i];

    let slider = createSlider(s[0], s[1], s[2], s[3]);
    slider.position(x, y + 40 + i * 32);
    slider.size(320);

    ch.sliders.push(slider);
  }

  return ch;
}

function loadAudio(ch, file) {
  if (!file || file.type !== "audio") return;

  loadSound(file.data, function(sf) {
    ch.sound = sf;
    ch.buffer = getAudioBuffer(sf);
    ch.peaks = sf.getPeaks(300);
  });
}

function togglePlay(ch) {
  userStartAudio();

  if (!ch.buffer) return;

  if (!ch.audioReady) {
    setupAudio(ch);
  }

  ch.playing = !ch.playing;

  if (ch.playing) {
    ch.playButton.html("||");
    ch.nextGrainTime = getAudioContext().currentTime + 0.08;
  } else {
    ch.playButton.html(">");
  }
}

function setupAudio(ch) {
  let ctx = getAudioContext();

  ch.input = ctx.createGain();
  ch.dry = ctx.createGain();
  ch.wet = ctx.createGain();
  ch.convolver = ctx.createConvolver();
  ch.output = ctx.createGain();

  ch.convolver.buffer = makeImpulseResponse(ctx, 2, 2);

  ch.input.connect(ch.dry);
  ch.input.connect(ch.wet);

  ch.dry.connect(ch.output);
  ch.wet.connect(ch.convolver);
  ch.convolver.connect(ch.output);

  ch.output.connect(ctx.destination);

  ch.audioReady = true;
}

function updateAudio(ch) {
  if (!ch.audioReady) return;

  let reverb = ch.sliders[5].value();

  ch.dry.gain.setTargetAtTime(1 - reverb, getAudioContext().currentTime, 0.03);
  ch.wet.gain.setTargetAtTime(reverb, getAudioContext().currentTime, 0.03);
}

function scheduleGrains(ch) {
  if (!ch.playing || !ch.buffer || !ch.audioReady) return;

  let ctx = getAudioContext();
  let now = ctx.currentTime;

  let scheduleAhead = 0.06;
  let lookAhead = 0.18;

  if (ch.nextGrainTime < now + scheduleAhead) {
    ch.nextGrainTime = now + scheduleAhead;
  }

  while (ch.nextGrainTime < now + lookAhead) {
    playGrain(ch, ch.nextGrainTime);
    ch.nextGrainTime += getGrainInterval(ch);
  }
}

function getGrainInterval(ch) {
  let grainSize = ch.sliders[3].value();
  let overlap = ch.sliders[4].value();

  let interval = grainSize * (1 - overlap);

  return max(0.035, interval);
}

function playGrain(ch, when) {
  let ctx = getAudioContext();

  let source = ctx.createBufferSource();
  let ampGain = ctx.createGain();
  let envGain = ctx.createGain();

  let volume = ch.sliders[0].value();
  let pitch = ch.sliders[1].value();
  let position = ch.sliders[2].value();
  let grainSize = ch.sliders[3].value();
  let overlap = ch.sliders[4].value();

  source.buffer = ch.buffer;
  source.playbackRate.setValueAtTime(pitch, when);

  let stopExtra = 0.04;
  let readTime = (grainSize + stopExtra) * pitch;

  let maxOffset = max(0, ch.buffer.duration - readTime - 0.001);
  let offset = position * maxOffset;

  let safeVolume = volume * 0.35 * (1 - overlap * 0.35);

  ampGain.gain.setValueAtTime(safeVolume, when);

  envGain.gain.setValueAtTime(0, when);
  envGain.gain.setValueCurveAtTime(grainWindow, when, grainSize);
  envGain.gain.setValueAtTime(0, when + grainSize + 0.001);

  source.connect(ampGain);
  ampGain.connect(envGain);
  envGain.connect(ch.input);

  source.start(when, offset);
  source.stop(when + grainSize + stopExtra);

  source.onended = function() {
    source.disconnect();
    ampGain.disconnect();
    envGain.disconnect();
  };
}

function drawWaveform(ch, x, y, w, h) {
  noFill();
  stroke(0);
  rect(x, y, w, h);

  if (!ch.peaks || ch.peaks.length === 0) return;

  let centerX = x + w / 2;

  stroke(0);

  for (let i = 0; i < ch.peaks.length; i++) {
    let amp = abs(ch.peaks[i]);
    let yy = map(i, 0, ch.peaks.length - 1, y + 10, y + h - 10);
    let lineLength = amp * w * 0.45;

    line(centerX - lineLength, yy, centerX + lineLength, yy);
  }

  let pos = ch.sliders[2].value();
  let posY = map(pos, 0, 1, y + 10, y + h - 10);

  stroke(0);
  line(x, posY, x + w, posY);
}

function getAudioBuffer(sf) {
  if (sf.buffer) return sf.buffer;
  if (sf._buffer) return sf._buffer;
  return null;
}

function makeHannWindow(size) {
  let curve = new Float32Array(size);

  for (let i = 0; i < size; i++) {
    let phase = i / (size - 1);
    curve[i] = 0.5 * (1 - cos(TWO_PI * phase));
  }

  return curve;
}

function makeImpulseResponse(ctx, seconds, decay) {
  let rate = ctx.sampleRate;
  let length = floor(rate * seconds);
  let impulse = ctx.createBuffer(2, length, rate);

  for (let c = 0; c < 2; c++) {
    let data = impulse.getChannelData(c);

    for (let i = 0; i < length; i++) {
      let t = i / length;
      data[i] = random(-1, 1) * pow(1 - t, decay);
    }
  }

  return impulse;
}