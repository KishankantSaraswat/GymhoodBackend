import express from "express";
import dotenv from "dotenv";
dotenv.config({ path: "./config/config.env" });
const startupKey = (process.env.JWT_SECRET_KEY || "").trim().replace(/^["']|["']$/g, '');
console.log(`🚀 Server starting. JWT Key Fingerprint: ${startupKey.substring(0, 2)}...${startupKey.substring(startupKey.length - 2)} (Length: ${startupKey.length})`);
import cookieParser from "cookie-parser";
import cors from "cors";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { connectDB } from "./database/db.js";
import { errorMiddleware } from "./middlewares/errorMiddlewares.js";
import authRouter from "./routes/authRouter.js"
import gymShoodRouter from "./routes/1_gymShoodDbRoute.js"
import adminRouter from "./routes/adminRoutes.js"
import paymentRouter from "./routes/payment.routes.js"
import healthChgymsHoodeckRouter from "./routes/healthCheck.js"
// import { gymDailyEarning } from "./services/cronJobs.js";
import userDataRouter from "./routes/userDataRoutes.js";
import { upload } from "./middlewares/multer.js";


export const app = express();

// Removed redundant dotenv config
import { OAuth2Client } from 'google-auth-library';
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

app.use(cors({
  origin: [
    'http://147.93.30.41:5001',
    'http://127.0.0.1:5500',
    'http://localhost:5500',
    'https://gyms-hood.vercel.app',
    'http://localhost:3000',
    'http://localhost:3000/googleAuth',
    'http://localhost:5173',
    'http://192.168.1.137:8000',
    'http://192.168.1.137:6000',
    'http://192.168.1.137:5000',
    'http://192.168.1.137:4000',
    'http://192.168.1.137:8081', // Native Expo dev port
    'https://gymhoodbackend.onrender.com'
  ],
  method: ["GET", "POST", "PUT", "DELETE"],
  credentials: true
}));

app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request Logger for debugging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Serve uploads directly from the main backend
app.use("/files", (req, res, next) => {
  // Normalize URLs: Remove any trailing underscores or malformed extensions like .jp._
  if (req.url.includes(".jp._")) {
    req.url = req.url.replace(".jp._", ".jpg");
  } else if (req.url.endsWith("_")) {
    req.url = req.url.slice(0, -1);
  }
  next();
});

const uploadsPath = path.join(process.cwd(), "uploads");
app.use("/files", express.static(uploadsPath, {
  setHeaders: (res) => {
    res.set('Access-Control-Allow-Origin', '*');
  }
}));

// Debug route to verify file system access
app.get("/debug-files", (req, res) => {
  try {
    const files = fs.readdirSync(uploadsPath);
    res.json({
      cwd: process.cwd(),
      uploadsPath,
      exists: fs.existsSync(uploadsPath),
      count: files.length,
      sample: files.slice(0, 5)
    });
  } catch (err) {
    res.status(500).json({ error: err.message, path: uploadsPath });
  }
});

// app.use("")
app.use("/auth", authRouter); //staticUri
app.use("/gymdb", gymShoodRouter);
app.use("/admin", adminRouter);
app.use("/payment", paymentRouter);
app.use("/user-data", userDataRouter);
// app.use("/api",healthCheckRouter);

app.get("/ping", (req, res) => {
  console.log("Ping hit!");
  const user = req.query.name || "Guest";
  res.json({ message: `Pong, ${user}` });
});

// Real-time File Upload Route (integrated from fileServer)
app.post("/upload", upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: 'No file uploaded' });
  }

  const fileUrl = `${req.protocol}://${req.get('host')}/files/${req.file.filename}`;

  res.status(201).json({
    success: true,
    message: 'File uploaded successfully',
    filename: req.file.filename,
    url: fileUrl
  });
});


// gymDailyEarning();

connectDB();


app.use(errorMiddleware);

// Start server if this file is run directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const PORT = process.env.PORT || 4000;
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server is running on port ${PORT}`);
  });
}
