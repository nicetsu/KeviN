/**
 * แปลงเสียงจากไมค์เป็น PCM16 แล้วส่งออกทีละก้อน
 *
 * Live API รับ **raw PCM 16-bit · 16 kHz · little-endian · โมโน** เท่านั้น
 * AudioContext ถูกสร้างด้วย sampleRate 16000 อยู่แล้ว เบราว์เซอร์จึงรีแซมเปิลให้
 * ที่นี่เหลือแค่แปลง Float32 (-1..1) เป็น Int16
 *
 * ใช้ AudioWorklet ไม่ใช่ ScriptProcessorNode เพราะตัวหลังเลิกใช้แล้วและทำงาน
 * บนเธรดหลัก ซึ่งบนมือถือทำให้เสียงสะดุดเวลาหน้าจอกำลังวาดอย่างอื่น
 *
 * ⚠️ ไฟล์นี้ถูกโหลดเป็น worklet ตรง ๆ จาก /pcm-recorder.js — **ไม่ผ่าน bundler**
 *    จึงต้องเป็น JS ล้วนที่เบราว์เซอร์รันได้เลย ห้ามใช้ import จากที่อื่น
 */
class PcmRecorder extends AudioWorkletProcessor {
  constructor() {
    super()
    // ส่งเป็นก้อนราว 100 ms (1600 ตัวอย่างที่ 16 kHz) — ถี่กว่านี้เปลือง postMessage
    // ห่างกว่านี้ทำให้การตรวจว่าพูดจบช้าลงจนบทสนทนาสะดุด
    this.target = 1600
    this.buffer = new Int16Array(this.target)
    this.filled = 0
  }

  process(inputs) {
    const channel = inputs[0] && inputs[0][0]
    if (!channel) return true

    for (let i = 0; i < channel.length; i++) {
      // หนีบก่อนคูณ ไม่งั้นค่าที่เกิน 1 จะวนกลับเป็นเสียงแตก
      const s = Math.max(-1, Math.min(1, channel[i]))
      this.buffer[this.filled++] = s < 0 ? s * 0x8000 : s * 0x7fff

      if (this.filled === this.target) {
        // ส่งสำเนาออกไป แล้วโอนกรรมสิทธิ์ buffer เพื่อไม่ต้องคัดลอกซ้ำ
        const chunk = this.buffer.slice()
        this.port.postMessage(chunk.buffer, [chunk.buffer])
        this.filled = 0
      }
    }
    return true
  }
}

registerProcessor('pcm-recorder', PcmRecorder)
