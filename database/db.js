import mongoose from "mongoose";

export const connectDB = async () => {
  try {
  await  mongoose.connect(process.env.MONGO_URI, {
    dbName: "gymsHood",
    //❌ Current (Deprecated) Version
    // useNewUrlParser: true,
    // useUnifiedTopology: true
})
    console.log('MongoDB Connected with ReplicaSet support');
  } catch (err) {
    console.error('Connection error:', err);
    process.exit(1);
  }
};

