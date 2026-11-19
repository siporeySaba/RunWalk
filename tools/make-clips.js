// יוצר את הקלטות הקול: node tools/make-clips.js [avri|hila] [--force]
// דורש: npm i msedge-tts  ו-ffmpeg בנתיב (לקיצוץ שקט בהתחלה ובסוף)
const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');
const { execFileSync } = require('child_process');
const fs = require('fs'), path = require('path');
const { CLIPS } = require('../clips.js');

const VOICES = { avri: 'he-IL-AvriNeural', hila: 'he-IL-HilaNeural' };
const which = process.argv[2] ? [process.argv[2]] : Object.keys(VOICES);
const force = process.argv.includes('--force');
const tmp = path.join(require('os').tmpdir(), 'rw-clip.mp3');

async function synth(tts, text) {
  const { audioStream } = await tts.toStream(text);
  const chunks = [];
  await new Promise((res, rej) => { audioStream.on('data', c => chunks.push(c)); audioStream.on('end', res); audioStream.on('error', rej); });
  return Buffer.concat(chunks);
}

(async () => {
  for (const v of which) {
    const dir = path.join(__dirname, '..', 'clips', v);
    fs.mkdirSync(dir, { recursive: true });
    let tts = new MsEdgeTTS();
    await tts.setMetadata(VOICES[v], OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
    let n = 0;
    for (const [key, text] of Object.entries(CLIPS)) {
      const out = path.join(dir, key + '.mp3');
      if (!force && fs.existsSync(out)) continue;
      let buf;
      for (let tryNo = 0; ; tryNo++) {
        try { buf = await synth(tts, text); if (buf.length > 1000) break; } catch (e) { if (tryNo > 3) throw e; }
        tts.close(); tts = new MsEdgeTTS();
        await tts.setMetadata(VOICES[v], OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
      }
      fs.writeFileSync(tmp, buf);
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', tmp, '-af',
        'silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse,loudnorm=I=-14:TP=-1',
        '-ar', '24000', '-ac', '1', '-b:a', '40k', out]);
      n++;
    }
    tts.close();
    console.log(v, 'new clips:', n, 'total:', fs.readdirSync(dir).length);
  }
})().catch(e => { console.error(e); process.exit(1); });
