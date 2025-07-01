const express = require('express');
   const multer = require('multer');
   const cors = require('cors');
   const { PDFDocument } = require('pdf-lib');
   const { Document, Packer, Paragraph } = require('docx');
   const mammoth = require('mammoth');
   const fs = require('fs').promises;
   const path = require('path');

   const app = express();
   const upload = multer({ dest: 'uploads/', limits: { fileSize: 5 * 1024 * 1024 } }); // 5MB limit

   app.use(cors({
     origin: ['https://lifetechgyan.com', 'http://lifetechgyan.com'],
     methods: ['GET', 'POST'],
     allowedHeaders: ['Content-Type']
   }));

   app.use(express.static('public'));

   app.post('/api/convert', upload.single('file'), async (req, res) => {
     const { file, body: { conversionType } } = req;
     if (!file) return res.status(400).send('No file uploaded');
     console.log(`Received file: ${file.originalname}, Conversion type: ${conversionType}`);

     // Validate file extension
     const validExtensions = {
       'word-to-pdf': ['.doc', '.docx'],
       'pdf-to-word': ['.pdf'],
       'jpeg-to-pdf': ['.jpg', '.jpeg'],
       'pdf-to-jpeg': ['.pdf']
     };
     const ext = path.extname(file.originalname).toLowerCase();
     if (!validExtensions[conversionType]?.includes(ext)) {
       console.log(`Invalid file extension: ${ext} for ${conversionType}`);
       return res.status(400).send(`Invalid file format. Please upload a ${validExtensions[conversionType].join(' or ')} file.`);
     }

     try {
       let outputBuffer;
       let outputMime;
       let outputFilename;

       switch (conversionType) {
         case 'word-to-pdf':
           console.log('Starting Word to PDF conversion');
           const docxBuffer = await mammoth.convertToHtml({ path: file.path });
           const pdfDoc = await PDFDocument.create();
           const page = pdfDoc.addPage();
           const { width, height } = page.getSize();
           const font = await pdfDoc.embedFont('Helvetica');
           page.setFont(font);
           page.drawText(docxBuffer.value.replace(/<[^>]+>/g, ''), { x: 50, y: height - 50, size: 12 });
           outputBuffer = await pdfDoc.save();
           outputMime = 'application/pdf';
           outputFilename = file.originalname.replace(/\.[^/.]+$/, '.pdf');
           break;

         case 'pdf-to-word':
           console.log('Starting PDF to Word conversion');
           const pdfText = await mammoth.convertToHtml({ path: file.path });
           const doc = new Document({
             sections: [{ children: [new Paragraph(pdfText.value.replace(/<[^>]+>/g, ''))] }],
           });
           outputBuffer = await Packer.toBuffer(doc);
           outputMime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
           outputFilename = file.originalname.replace(/\.[^/.]+$/, '.docx');
           break;

         case 'jpeg-to-pdf':
           console.log('Starting JPEG to PDF conversion');
           const imageBuffer = await fs.readFile(file.path);
           const pdf = await PDFDocument.create();
           const pageImage = pdf.addPage();
           const jpgImage = await pdf.embedJpg(imageBuffer);
           const { width: imgWidth, height: imgHeight } = pageImage.getSize();
           pageImage.drawImage(jpgImage, { x: 0, y: 0, width: imgWidth, height: imgHeight });
           outputBuffer = await pdf.save();
           outputMime = 'application/pdf';
           outputFilename = file.originalname.replace(/\.[^/.]+$/, '.pdf');
           break;

         case 'pdf-to-jpeg':
           console.log('PDF to JPEG conversion disabled due to missing dependencies');
           return res.status(400).send('PDF to JPEG conversion is currently disabled');
           break;

         default:
           console.log('Invalid conversion type');
           return res.status(400).send('Invalid conversion type');
       }

       res.set('Content-Type', outputMime);
       res.set('Content-Disposition', `attachment; filename="${outputFilename}"`);
       res.send(outputBuffer);
     } catch (error) {
       console.error(`Conversion failed: ${error.message}`);
       console.error(error.stack);
       res.status(500).send(`Conversion error: ${error.message}`);
     } finally {
       try {
         await fs.unlink(file.path);
         console.log('Temporary file deleted');
       } catch (deleteError) {
         console.error(`Failed to delete temporary file: ${deleteError.message}`);
       }
     }
   });

   const PORT = process.env.PORT || 3000;
   app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
