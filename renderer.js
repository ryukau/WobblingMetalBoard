importScripts(
  "lib/mersenne-twister.js",
)

const TWO_PI = 2 * Math.PI

function normalize(sound) {
  var max = 0.0
  for (var t = 0; t < sound.length; ++t) {
    var value = Math.abs(sound[t])
    if (max < value) {
      max = value
    }
  }

  if (max === 0.0) {
    return sound
  }

  var amp = 1.0 / max
  for (var t = 0; t < sound.length; ++t) {
    sound[t] *= amp
  }

  return sound
}

class PolyExpEnvelope {
  // env(t) := t^a * exp(-b * t)
  constructor(sampleRate, attack, curve) {
    var a = attack * curve
    var b = curve

    this.a = a
    this.peak = (a / b) ** a * Math.exp(-a)
    this.gamma = Math.exp(-b / sampleRate)
    this.tick = 1 / sampleRate

    this.reset()
  }

  reset() {
    this.t = 0
    this.value = 1
  }

  process() {
    var output = this.t ** this.a * this.value / this.peak
    this.t += this.tick
    this.value *= this.gamma
    return output
  }
}

onmessage = (event) => {
  var params = event.data
  var sampleRate = params.sampleRate
  var rnd = new MersenneTwister(params.seed + params.channel)

  var sound = new Array(Math.floor(sampleRate * params.length)).fill(0)

  var ampEnv = []
  var pitchEnv = []

  for (var n = 0; n < params.nBounce; ++n) {
    ampEnv.push(
      new PolyExpEnvelope(
        sampleRate,
        params.bendAttack,
        params.bendCurve / params.ampAttack
      )
    )
    pitchEnv.push(
      new PolyExpEnvelope(
        sampleRate,
        params.bendAttack,
        params.bendCurve
      )
    )
  }

  var harmoAmp = new Array(params.nHarmonics)
  var bend = new Array(params.nHarmonics)
  var f0 = new Array(params.nHarmonics)
  for (var n = 0; n < params.nHarmonics; ++n) {
    harmoAmp[n] = params.harmonicsAmp ** n
    bend[n] = params.bendAmount * params.harmonicsBend ** n
    f0[n] = params.baseFrequency * (n + 1)
  }

  var bounceAmp = new Array(params.nBounce)
  var bounceBend = new Array(params.nBounce)
  for (var n = 0; n < params.nBounce; ++n) {
    bounceAmp[n] = params.bounceAmpInit * params.bounceAmp ** n
    bounceBend[n] = params.bounceBendInit * params.bounceBend ** n
  }

  var bounce = 1
  var interval = Math.floor(params.interval * sampleRate)
  var nextBounce = interval

  var phase = new Array(params.nHarmonics).fill(0)
  var omega_per_freq = TWO_PI / sampleRate

  for (var i = 0; i < sound.length; ++i) {
    if (bounce < params.nBounce && i >= nextBounce) {
      bounce += 1
      nextBounce += interval * (1 + params.wander * (rnd.random() - 1))
    }

    var aEnv = ampEnv[0].process()
    var pEnv = pitchEnv[0].process()
    for (var n = 1; n < bounce; ++n) {
      aEnv += bounceAmp[n] * ampEnv[n].process()
      pEnv += bounceBend[n] * pitchEnv[n].process()
    }

    for (var n = 0; n < params.nHarmonics; ++n) {
      phase[n] += omega_per_freq * (f0[n] + bend[n] * pEnv)
      sound[i] += harmoAmp[n] * Math.sin(phase[n])
    }
    sound[i] *= aEnv
  }

  postMessage(sound)
}

// TODO: UI を項目ごとに分ける。