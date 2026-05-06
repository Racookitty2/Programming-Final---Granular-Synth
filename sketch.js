var mode = 0;
let channels = [];
let grainWindow;
let prevMode
let params = [
  { key: "volume", label: "Volume", min: 0, max: 1, start: 0.7, step: 0.01 },
  { key: "pitch", label: "Pitch", min: 0.25, max: 2.5, start: 1.0, step: 0.01 },
  { key: "position", label: "Grain Position", min: 0, max: 1, start: 0.2, step: 0.001 },
  { key: "size", label: "Grain Size", min: 0.08, max: 1.0, start: 0.2, step: 0.005 },
  { key: "overlap", label: "Grain Overlap", min: 0, max: 0.9, start: 0.4, step: 0.01 },
  { key: "reverb", label: "Reverb", min: 0, max: 1, start: 0.2, step: 0.01 }
];


function setup() {
  createCanvas(windowWidth, windowHeight);
  splash = new Splash();
  //createCanvas(900, 500);
  grainWindow = makeHannWindow(512);
  textFont("Times New Roman");

  
}

function draw() {
  if (mouseIsPressed == true && splash.update() == true) {
    mode = 1;
  }
  
  if (mode == 1) {
    
    if (mode != prevMode){
      
      makeChannel(0, 20, 20);
    makeChannel(1, 460, 20);

      
    }
    
    prevMode = mode; 
    splash.hide();
    
    background(245);

  // Update modulation, audio, and scheduling
  for (let i = 0; i < channels.length; i++) {
    updateModulation(channels[i]);
    updateValues(channels[i]);
    scheduleGrains(channels[i]);
  }

  // Draw simple waveform displays
  drawVisualizer(channels[0], 20, 310, 400, 160);
  drawVisualizer(channels[1], 460, 310, 400, 160);
    
  }
}

function makeChannel(index, x, y) {
  let ch = {};

  ch.index = index;
  ch.name = "Channel " + (index + 1);

  ch.sound = null;
  ch.buffer = null;
  ch.peaks = [];
  ch.fileName = "No file loaded";

  ch.playing = false;
  ch.nextGrainTime = 0;

  ch.controls = {};

  // AUDIO NODES
  ch.audioReady = false;
  ch.input = null;
  ch.dry = null;
  ch.wet = null;
  ch.convolver = null;
  ch.output = null;

  // PANEL
  ch.panel = createDiv();
  ch.panel.position(x, y);
  ch.panel.style("width", "400px");
  ch.panel.style("padding", "10px");
  ch.panel.style("border", "1px solid #bbb");
  ch.panel.style("background", "#ffffff");

  let title = createDiv(ch.name);
  title.parent(ch.panel);
  title.style("font-weight", "bold");
  title.style("font-size", "18px");
  title.style("margin-bottom", "8px");

  let topRow = createDiv();
  topRow.parent(ch.panel);
  topRow.style("margin-bottom", "8px");

  ch.fileInput = createFileInput(function(file) {
    loadAudioFile(ch, file);
  });
  ch.fileInput.parent(topRow);

  ch.playButton = createButton("Play / Pause");
  ch.playButton.parent(topRow);
  ch.playButton.style("margin-left", "8px");
  ch.playButton.mousePressed(function() {
    togglePlay(ch);
  });

  ch.status = createDiv("No file loaded");
  ch.status.parent(ch.panel);
  ch.status.style("font-size", "12px");
  ch.status.style("margin-bottom", "8px");

  // SLIDERS + MOD TOGGLES
  for (let p of params) {
    let row = createDiv();
    row.parent(ch.panel);
    row.style("margin-bottom", "5px");

    let label = createSpan(p.label + " ");
    label.parent(row);
    label.style("display", "inline-block");
    label.style("width", "100px");

    let slider = createSlider(p.min, p.max, p.start, p.step);
    slider.parent(row);
    slider.style("width", "180px");

    let modButton = createButton("Mod");
    modButton.parent(row);
    modButton.style("margin-left", "6px");

    let valueText = createSpan(" " + formatValue(p.key, p.start));
    valueText.parent(row);
    valueText.style("margin-left", "8px");

    ch.controls[p.key] = {
      slider: slider,
      modButton: modButton,
      valueText: valueText,
      modOn: false,
      phase: random(TWO_PI)
    };

    modButton.mousePressed(function() {
      ch.controls[p.key].modOn = !ch.controls[p.key].modOn;
      if (ch.controls[p.key].modOn) {
        modButton.html("Mod ON");
      } else {
        modButton.html("Mod");
      }
    }
    );
  }

  // MODULATION SPEED
  let speedRow = createDiv();
  speedRow.parent(ch.panel);
  speedRow.style("margin-top", "10px");

  let speedLabel = createSpan("Mod Speed ");
  speedLabel.parent(speedRow);
  speedLabel.style("display", "inline-block");
  speedLabel.style("width", "100px");

  ch.modSpeed = createSlider(0, 1, 0.25, 0.001);
  ch.modSpeed.parent(speedRow);
  ch.modSpeed.style("width", "180px");

  ch.modSpeedText = createSpan(" 0.50");
  ch.modSpeedText.parent(speedRow);
  ch.modSpeedText.style("margin-left", "8px");

  channels.push(ch);
}

function loadAudioFile(ch, file) {
  if (!file || file.type !== "audio") {
    ch.status.html("Please choose an audio file.");
    return;
  }


  loadSound(
    file.data,
    function(sf) {
      ch.sound = sf;
      ch.buffer = getAudioBuffer(sf);
      ch.peaks = sf.getPeaks(300);
      ch.fileName = file.name;
      ch.status.html(file.name + " loaded");
    }
  );
}

function togglePlay(ch) {
  userStartAudio();

  

  if (!ch.audioReady) {
    setupAudio(ch);
  }

  ch.playing = !ch.playing;

  if (ch.playing) {
    ch.nextGrainTime = getAudioContext().currentTime + 0.05;
  }
}

function setupAudio(ch) {
  let ctx = getAudioContext();

  ch.input = ctx.createGain();
  ch.dry = ctx.createGain();
  ch.wet = ctx.createGain();
  ch.convolver = ctx.createConvolver();
  ch.output = ctx.createGain();

  ch.convolver.buffer = makeImpulseResponse(ctx, 2.0, 2.0);

  ch.input.connect(ch.dry);
  ch.input.connect(ch.wet);

  ch.dry.connect(ch.output);
  ch.wet.connect(ch.convolver);
  ch.convolver.connect(ch.output);

  ch.output.connect(ctx.destination);

  ch.audioReady = true;
}

function updateModulation(ch) {
  let sliderValue = Number(ch.modSpeed.value());

  // Nonlinear speed curve
  let speed = 0.03 + pow(sliderValue, 4) * 3.0;

  ch.modSpeedText.html(" " + speed.toFixed(2));

  let t = millis() / 1000;

  for (let p of params) {
    let control = ch.controls[p.key];

    if (control.modOn) {
      let wave = 0.5 + 0.5 * sin(TWO_PI * speed * t + control.phase);
      let val = p.min + wave * (p.max - p.min);
      control.slider.value(val);
    }
  }
}

function updateValues(ch) {
  for (let p of params) {
    let val = Number(ch.controls[p.key].slider.value());
    ch.controls[p.key].valueText.html(" " + formatValue(p.key, val));
  }

  if (ch.audioReady) {
    let reverbAmount = Number(ch.controls.reverb.slider.value());
    ch.dry.gain.setTargetAtTime(1 - reverbAmount * 0.7, getAudioContext().currentTime, 0.02);
    ch.wet.gain.setTargetAtTime(reverbAmount, getAudioContext().currentTime, 0.02);
  }
}

function scheduleGrains(ch) {
  if (!ch.playing || !ch.audioReady || !ch.buffer) return;

  let ctx = getAudioContext();
  let now = ctx.currentTime;

  // Always schedule slightly in the future.
  // This prevents grains from starting late and skipping the fade-in.
  let scheduleAhead = 0.06;
  let lookAhead = 0.16;

  if (ch.nextGrainTime < now + scheduleAhead) {
    ch.nextGrainTime = now + scheduleAhead;
  }

  while (ch.nextGrainTime < now + lookAhead) {
    playGrain(ch, ch.nextGrainTime);
    ch.nextGrainTime += getGrainInterval(ch);
  }
}

function getGrainInterval(ch) {
  let size = Number(ch.controls.size.slider.value());
  let overlap = Number(ch.controls.overlap.slider.value());

  let interval = size * (1 - overlap);

  if (interval < 0.02) interval = 0.02;
  return interval;
}

function playGrain(ch, when) {
  let ctx = getAudioContext();

  let source = ctx.createBufferSource();
  let ampGain = ctx.createGain();
  let envGain = ctx.createGain();

  let volume = Number(ch.controls.volume.slider.value());
  let pitch = Number(ch.controls.pitch.slider.value());
  let position = Number(ch.controls.position.slider.value());
  let grainSize = Number(ch.controls.size.slider.value());
  let overlap = Number(ch.controls.overlap.slider.value());

  // Very tiny grains will always be more click/prone and buzzy.
  grainSize = max(grainSize, 0.08);

  source.buffer = ch.buffer;
  source.playbackRate.setValueAtTime(pitch, when);

  // Leave a little extra time after the envelope finishes.
  // This prevents source.stop() from cutting off the envelope at the exact same instant.
  let stopExtra = 0.04;

  let readTime = (grainSize + stopExtra) * pitch;
  let maxOffset = max(0, ch.buffer.duration - readTime - 0.001);
  let offset = position * maxOffset;

  // Lower volume because overlapping grains stack up quickly.
  let safeVolume = volume * 0.45 * (1 - overlap * 0.35);

  ampGain.gain.setValueAtTime(safeVolume, when);

  // The envelope node starts silent.
  envGain.gain.setValueAtTime(0, when);

  // Smooth Hann window: 0 -> 1 -> 0 across the grain.
  // setValueCurveAtTime is made for this kind of shaped automation.
  envGain.gain.setValueCurveAtTime(grainWindow, when, grainSize);

  // Keep it at zero after the grain window is finished.
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

function makeHannWindow(size) {
  let curve = new Float32Array(size);

  for (let i = 0; i < size; i++) {
    let phase = i / (size - 1);
    curve[i] = 0.5 * (1 - cos(TWO_PI * phase));
  }

  return curve;
}

function drawVisualizer(ch, x, y, w, h) {
  // outer box
  stroke(0);
  noFill();
  rect(x, y, w, h);

  fill(0);
  noStroke();
  textSize(14);
  text(ch.name, x, y - 8);



  // simple skeletal waveform
  stroke(0);
  let centerX = x + w / 2;

  for (let i = 0; i < ch.peaks.length; i++) {
    let amp = ch.peaks[i];
    let yy = map(i, 0, ch.peaks.length - 1, y + 10, y + h - 10);
    let lineHalf = abs(amp) * (w * 0.4);
    line(centerX - lineHalf, yy, centerX + lineHalf, yy);
  }

  // show grain position as a simple line
  let pos = Number(ch.controls.position.slider.value());
  let posY = map(pos, 0, 1, y + 10, y + h - 10);

  stroke(255, 0, 0);
  line(x + 5, posY, x + w - 5, posY);
}

function formatValue(key, v) {
  if (key === "position") return (v * 100).toFixed(1) + "%";
  if (key === "size") return v.toFixed(3) + " s";
  if (key === "overlap") return (v * 100).toFixed(0) + "%";
  if (key === "reverb") return (v * 100).toFixed(0) + "%";
  if (key === "pitch") return v.toFixed(2);
  if (key === "volume") return v.toFixed(2);
  return v.toFixed(2);
}

function getAudioBuffer(sf) {
  if (sf.buffer) return sf.buffer;
  if (sf._buffer) return sf._buffer;
  return null;
}

function makeImpulseResponse(ctx, seconds, decay) {
  let sampleRate = ctx.sampleRate;
  let length = sampleRate * seconds;
  let impulse = ctx.createBuffer(2, length, sampleRate);

  for (let channel = 0; channel < 2; channel++) {
    let data = impulse.getChannelData(channel);
    for (let i = 0; i < length; i++) {
      let n = i / length;
      data[i] = random(-1, 1) * pow(1 - n, decay);
    }
  }

  return impulse;
}