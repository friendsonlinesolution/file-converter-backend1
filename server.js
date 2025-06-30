const express = require('express');
const multer = require('multer');
const { PDFDocument } = require('pdf-lib');
const { Document, Packer, Paragraph } = require('docx');
const mammoth = require('mammoth');
const { fromBuffer } = require('pdf2pic');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const upload = multer({ dest: 'uploads/' });

app.use(express.static('public'));

app.post('/api/convert', upload.single('file'), async (req, res) => {
  const { file, body: { conversionType } } = req;
  if (!file) return res.status(400).send('No file uploaded');

  try {
    let outputBuffer;
    let outputMime;

    switch (conversionType) {
      case 'word-to-pdf':
        const docxBuffer = await mammoth.convertToHtml({ path: file.path });
        const pdfDoc = await PDFDocument.create();
        const page = pdfDoc.addPage();
        const { width, height } = page.getSize();
        page.drawText(docxBuffer.value, { x: 50, y: height - 50 });
        outputBuffer = await pdfDoc.save();
        outputMime = 'application/pdf';
        break;

      case 'pdf-to-word':
        const pdfText = await mammoth.convertToHtml({ path: file.path });
        const doc = new Document({
          sections: [{ children: [new Paragraph(pdfText.value)] }],
        });
        outputBuffer = await Packer.toBuffer(doc);
        outputMime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        break;

      case 'jpeg-to-pdf':
        const imageBuffer = await fs.readFile(file.path);
        const pdf = await PDFDocument.create();
        const pageImage = pdf.addPage();
        const jpgImage = await pdf.embedJpg(imageBuffer);
        const { width, height } = pageImage.getSize();
        pageImage.drawImage(jpgImage, { x: 0, y: 0, width, height });
        outputBuffer = await pdf.save();
        outputMime = 'application/pdf';
        break;

      case 'pdf-to-jpeg':
        const output = fromBuffer(await fs.readFile(file.path), {
          format: 'jpeg',
          width: 1024,
          height: 1024,
        });
        outputBuffer = await output.bulk(-1);
        outputMime = 'image/jpeg';
        break;

      default:
        return res.status(400).send('Invalid conversion type');
    }

    res.set('Content-Type', outputMime);
    res.send(outputBuffer);
  } catch (error) {
    console.error(error);
    res.status(500).send('Conversion error');
  } finally {
    await fs.unlink(file.path);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));