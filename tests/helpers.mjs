import PDFDocument from 'pdfkit';
export async function pdfBuffer(text) {
  const doc=new PDFDocument({size:'A4'});
  const chunks=[];
  const result=new Promise((resolve,reject)=>{doc.on('data',c=>chunks.push(c));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject);});
  if(text) doc.fontSize(13).text(text,60,60,{width:470});
  else doc.addPage();
  doc.end();return result;
}
