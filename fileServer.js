import express from 'express';
import cors from 'cors';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.FILE_SERVER_PORT || 5000;

app.use(cors());


// Allowed MIME types
const allowedMimeTypes = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'video/mp4',
  'video/quicktime', // .mov
  'video/x-msvideo', // .avi
  'application/pdf'
];

// Configure storage for uploaded files
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}${path.extname(file.originalname).toLowerCase()}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf', 'text/plain'];
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'), false);
    }
  }
});

// Serve files from /uploads safely
// Middleware to serve static files
app.use('/files', express.static(path.join(__dirname, 'uploads'), {
  dotfiles: 'deny',
  index: false,
  setHeaders: (res, path) => {
    // res.set('Content-Security-Policy', "default-src 'none';");
    res.set('Access-Control-Allow-Origin', '*');
  }
}));

// app.use('/files', express.static(path.join(__dirname, 'uploads')));

// Upload endpoint
app.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const fileUrl = `${req.protocol}://${req.get('host')}/files/${req.file.filename}`;

  res.status(201).json({
    success: true,
    message: 'File uploaded successfully',
    filename: req.file.filename,
    originalname: req.file.originalname,
    size: req.file.size,
    mimetype: req.file.mimetype,
    url: fileUrl
  });
});

// List uploaded files
app.get('/files', (req, res) => {
  const uploadDir = path.join(__dirname, 'uploads');
  const prefix = req.query.prefix || '';
  const mediaType = req.query.mediaType;

  fs.readdir(uploadDir, (err, files) => {
    if (err) {
      return res.status(500).json({ error: 'Unable to scan files' });
    }

    const matchedFiles = files.filter(file => file.startsWith(prefix));

    const fileList = matchedFiles.map(file => {
      const ext = path.extname(file).toLowerCase();
      const isVideo = ['.mp4', '.mov', '.avi'].includes(ext);
      const isImage = ['.jpg', '.jpeg', '.png', '.webp'].includes(ext);

      if (mediaType === 'video' && !isVideo) return null;
      if (mediaType === 'image' && !isImage) return null;

      return {
        filename: file,
        url: `${req.protocol}://${req.get('host')}/files/${file}`
      };
    }).filter(Boolean);

    res.json({
      success: true,
      count: fileList.length,
      files: fileList
    });
  });
});


app.delete('/files', (req, res) => {
  const name = req.query.name;
  const type = req.query.type;
  if (!name || !type) {
    return res.status(400).json({ error: 'Missing "name" or "type" query parameters' });
  }
  const safeExt = ['.jpg', '.jpeg', '.png', '.webp', '.mp4', '.mov', '.avi', '.pdf'];
  const ext = type.startsWith('.') ? type.toLowerCase() : '.' + type.toLowerCase();
  if (!safeExt.includes(ext)) {
    return res.status(400).json({ error: 'Invalid file type extension' });
  }
  const safeFilename = path.basename(name) + ext;
  const filePath = path.join(__dirname, 'uploads', safeFilename);
  // Prevent path traversal
  if (!filePath.startsWith(path.join(__dirname, 'uploads'))) {
    return res.status(403).json({ error: 'Access denied' });
  }
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }
  fs.unlink(filePath, (err) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to delete file' });
    }
    res.json({
      success: true,
      message: 'File deleted successfully',
      filename: safeFilename
    });
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({
      error: 'File upload error',
      message: err.message
    });
  } else if (err) {
    return res.status(500).json({
      error: 'Server error',
      message: err.message
    });
  }
  next();
});

// Start server
app.listen(PORT, () => {
  console.log(`File server running on port ${PORT}`);
  console.log(`Upload directory: ${path.join(__dirname, 'uploads')}`);
});