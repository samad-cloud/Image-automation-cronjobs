import OpenAI from 'openai'
import { createCanvas } from 'canvas'

export class ImageEditService {
  private client: OpenAI

  constructor() {
    if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not set')
    this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  }

  async buildMaskFromConfig(
    width: number,
    height: number,
    config?: { polygon?: Array<{ x: number; y: number }>; bbox?: { x: number; y: number; width: number; height: number } }
  ): Promise<Buffer> {
    const w = Math.max(1, width)
    const h = Math.max(1, height)
    const canvas = createCanvas(w, h)
    const ctx = canvas.getContext('2d')

    // Opaque outside; transparent where we allow replacement
    ctx.fillStyle = 'rgba(0,0,0,1)'
    ctx.fillRect(0, 0, w, h)

    ctx.globalCompositeOperation = 'destination-out'
    ctx.fillStyle = 'rgba(0,0,0,1)'

    if (config?.polygon && config.polygon.length >= 3) {
      ctx.beginPath()
      ctx.moveTo(config.polygon[0].x * w, config.polygon[0].y * h)
      for (let i = 1; i < config.polygon.length; i++) {
        const p = config.polygon[i]
        ctx.lineTo(p.x * w, p.y * h)
      }
      ctx.closePath()
      ctx.fill()
    } else if (config?.bbox) {
      const { x, y, width: bw, height: bh } = config.bbox
      ctx.fillRect(x * w, y * h, bw * w, bh * h)
    } else {
      // Default center box (safe fallback)
      const bw = Math.floor(w * 0.6)
      const bh = Math.floor(h * 0.6)
      const x = Math.floor((w - bw) / 2)
      const y = Math.floor((h - bh) / 2)
      ctx.fillRect(x, y, bw, bh)
    }

    return canvas.toBuffer('image/png')
  }

  /**
   * Prompt-only replacement using Responses API + image_generation tool.
   * Sends the lifestyle (base) and white-background (donor) images as inputs
   * and asks the model to ensure the printed photo on the base matches donor.
   */
  async replaceWithPromptOnly(params: {
    baseImageUrl: string
    donorImageUrl: string
    generationId: string
    size?: '1024x1024' | '1536x1024' | '1024x1536'
  }): Promise<Buffer> {
    const { baseImageUrl, donorImageUrl, generationId, size = '1024x1024' } = params

    const [baseB64, donorB64] = await Promise.all([
      this.fetchUrlToBase64(baseImageUrl),
      this.fetchUrlToBase64(donorImageUrl)
    ])

    const prompt = `You are editing the BASE product image to guarantee that the printed placeholder photo on the product matches the DONOR product image exactly.
Rules:
- Keep the product geometry, texture, material finish, and background of the BASE image unchanged.
- Copy the donor's printed photo content onto the print area of the product in the BASE image so they visually match for ad and website parity.
- Do not stylize or change the donor photo; preserve its content. Only adjust perspective as needed so it aligns naturally on the BASE product.
Return a single photorealistic result.`

    const response: any = await this.client.responses.create({
      model: 'gpt-4.1',
      input: [
        {
          role: 'user',
          content: [
            { type: 'input_text', text: prompt },
            { type: 'input_image', image_url: `data:image/png;base64,${baseB64}` },
            { type: 'input_image', image_url: `data:image/png;base64,${donorB64}` }
          ]
        }
      ],
      tools: [{ type: 'image_generation' }],
      metadata: { seed: this.hashToSeed(generationId).toString(), size }
    })

    const imageCalls = (response.output || []).filter((o: any) => o.type === 'image_generation_call')
    const imageData = imageCalls.map((o: any) => o.result)
    const b64 = imageData?.[0]
    if (!b64) throw new Error('No image data returned from prompt-only edit')
    return Buffer.from(b64, 'base64')
  }

  private async fetchUrlToBase64(url: string): Promise<string> {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Failed to fetch image: ${url}`)
    const arr = await res.arrayBuffer()
    return Buffer.from(arr).toString('base64')
  }

  async replacePlaceholderWithDonor(params: {
    baseImageUrl: string
    donorImageUrl: string
    maskPng: Buffer
    generationId: string
  }): Promise<Buffer> {
    const { baseImageUrl, donorImageUrl, maskPng, generationId } = params

    const form = new FormData()
    form.append('model', 'gpt-image-1')
    form.append('image[]', baseImageUrl)
    form.append('image[]', donorImageUrl)
    form.append('mask', new Blob([maskPng], { type: 'image/png' }), 'mask.png')
    form.append('prompt', `Replace ONLY the transparent print area with the photo printed on the donor product image. Copy the donor photo exactly. Do not change any pixels outside the masked region. Keep product edges, finish, reflections, and geometry unchanged.`)
    form.append('size', '1024x1024')
    form.append('seed', this.hashToSeed(generationId).toString())

    const resp = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.client.apiKey}` },
      body: form as any
    })

    if (!resp.ok) {
      const text = await resp.text()
      throw new Error(`Edit failed: ${resp.status} ${text}`)
    }
    const json = await resp.json() as any
    const b64 = json?.data?.[0]?.b64_json
    if (!b64) throw new Error('No image in edit response')
    return Buffer.from(b64, 'base64')
  }

  private hashToSeed(s: string): number {
    let h = 2166136261
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i)
      h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24)
    }
    return Math.abs(h >>> 0)
  }
}


