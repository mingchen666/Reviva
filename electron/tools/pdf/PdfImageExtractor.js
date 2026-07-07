export class PdfImageExtractor {
  async listEmbeddedImages(cache, doc) {
    const index = await cache.readEmbeddedImagesIndex(doc)
    return {
      success: true,
      images: index.images || [],
      note: 'PDF 原始内嵌图片抽取将在后续 provider 可用时执行；当前返回已缓存图片索引。',
    }
  }
}
