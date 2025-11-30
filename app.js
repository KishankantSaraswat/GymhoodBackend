import express from "express"; 
import {config} from "dotenv"; config({path:"./config/config.env"});
import cookieParser from "cookie-parser";
import cors from "cors";
import {connectDB} from "./database/db.js"; 
import { errorMiddleware } from "./middlewares/errorMiddlewares.js";
import authRouter from "./routes/authRouter.js"
import gymShoodRouter from "./routes/1_gymShoodDbRoute.js"
import adminRouter from "./routes/adminRoutes.js"
import paymentRouter from "./routes/payment.routes.js"
import healthChgymsHoodeckRouter from "./routes/healthCheck.js"
// import { gymDailyEarning } from "./services/cronJobs.js";
import userDataRouter from "./routes/userDataRoutes.js";


export const app=express(); 

import dotenv from 'dotenv';
dotenv.config({ path: './config/config.env' });
import { OAuth2Client } from 'google-auth-library';
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

app.use(cors({
    origin: ['http://147.93.30.41:5001','http://127.0.0.1:5500', 'http://localhost:5500', 'https://gyms-hood.vercel.app', 'http://localhost:3000', 'http://localhost:3000/googleAuth',],
        method:["GET","POST","PUT","DELETE"],
    credentials: true
}));


app.use(cookieParser());
app.use(express.json()); 
app.use(express.urlencoded({extended:true})); //data conversion (backend(json) && frontend)


// In your backend (app.js)
app.use(express.json()); // for parsing application/json
app.use(express.urlencoded({ extended: true })); // for parsing form data

// app.use("")
app.use("/auth",authRouter); //staticUri
app.use("/gymdb",gymShoodRouter);
app.use("/admin",adminRouter);
app.use("/payment",paymentRouter); 
app.use("/user-data", userDataRouter);
// app.use("/api",healthCheckRouter);

app.get("/ping", (req, res) => {
  console.log("Ping hit!");
  const user = req.query.name || "Guest";
  res.json({ message: `Pong, ${user}` });
});


// gymDailyEarning();

connectDB();

app.use(errorMiddleware); 
