import { PDFParse } from 'pdf-parse';
import { AppError } from './errors.mjs';
export const MAX_TEXT = 100000;
export function normalizeText(text) {
  return text.replace(/\u0000/g, '').replace(/\r\n?/g, '\n').replace(/[ \t]+/g,' ').trim();
}
export function checkText(raw) {
  const text = normalizeText(raw);
  if (text.length < 30) throw new AppError('EMPTY_MATERIAL','可读文本不足 30 字。扫描版 PDF 请先进行 OCR，或上传更完整的文本资料。');
  if (text.length > MAX_TEXT) throw new AppError('TEXT_TOO_LONG','资料超过 10 万字符，请按章节拆分上传。');
  return text;
}
export async function parseFile(file) {
  const ext = file.originalname.split('.').pop().toLowerCase();
  if (!['pdf','txt','md','markdown'].includes(ext)) throw new AppError('FILE_TYPE','仅支持 PDF、TXT 和 Markdown 文件。');
  let text;
  if (ext === 'pdf') {
    if (!file.buffer.subarray(0,5).equals(Buffer.from('%PDF-'))) throw new AppError('INVALID_PDF','PDF 文件损坏或格式不正确，请重新导出后上传。');
    const parser = new PDFParse({ data: file.buffer, verbosity: 0 });
    try { text = (await parser.getText()).text; }
    catch { throw new AppError('INVALID_PDF','无法读取 PDF。请确认文件未损坏、未加密；扫描件需先进行 OCR。'); }
    finally { await parser.destroy().catch(() => {}); }
  } else {
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(file.buffer); }
    catch { throw new AppError('TEXT_ENCODING','文本不是 UTF-8 编码，请使用编辑器另存为 UTF-8 后上传。'); }
  }
  return { text: checkText(text), type: ext === 'markdown' ? 'md' : ext };
}
