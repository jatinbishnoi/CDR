// models/userModel.js
import mongoose from "mongoose";

// Schema
const userSchema = new mongoose.Schema({
  userName: {
    type: String,
    required: [true, "User Name is required"],
  },
  email: {
    type: String,
    required: [true, "Email is required"],
    unique: true,
  },
  password: {
    type: String,
    required: [true, "Password is required"],
  },
  userType: {
    type: String,
    enum: ["admin", "data-entry", "viewer"],
    default: "viewer",
    required: [true, "User type is required"],
  },
}, { timestamps: true });

// ✅ Export default
const userModel = mongoose.model("User", userSchema);
export default userModel;
