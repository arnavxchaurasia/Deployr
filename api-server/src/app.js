const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");

const authRoutes = require("./routes/authRoutes");
const projectRoutes = require("./routes/projectRoutes");
const deploymentRoutes = require("./routes/deploymentRoutes");
const analyticsRoutes = require("./routes/analyticsRoutes");
const githubRoutes = require("./routes/githubRoutes");

const aiRoutes = require("./routes/aiRoutes");
const paymentRoutes = require("./routes/paymentRoutes");

const app = express();

app.use(express.json());
app.use(cors({
  origin: "http://localhost:3000",
  credentials: true,
}));
app.use(cookieParser());

app.use("/", authRoutes);
app.use("/", projectRoutes);
app.use("/", deploymentRoutes);
app.use("/", analyticsRoutes);
app.use("/", aiRoutes);
app.use("/", paymentRoutes);
app.use("/github", githubRoutes);

module.exports = app;
