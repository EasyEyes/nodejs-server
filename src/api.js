const express = require("express");
const serverless = require("serverless-http");
const cors = require('cors');

// Create an instance of the Express app
const app = express();
app.use(cors());

// Create a router to handle routes
const router = express.Router();

// Define a route that responds with a JSON object when a GET request is made to the root path
router.get("/", (req, res) => {
  res.json({
    hello: "hi!"
  });
});

let EasyeyesMessage = '';
let matlabMessage = '';
let fileName = '';

router.post("/easyeyes", (req, res) => {
  const receivedString = req.body;
  // Handle the received string from EasyEyes, e.g. pass it to MATLAB
  EasyeyesMessage = receivedString;
  res.json({message: "EasyEyes: " + EasyeyesMessage});
});

router.get("/easyeyes", (req, res) => {
  res.json({message: "" + EasyeyesMessage });
});

router.post("/filename", (req, res) => {
  const receivedString = req.body;
  fileName = receivedString;
  res.json({message: "Sent filename: " + fileName});
});

router.get("/filename", (req, res) => {
  res.json({fileName: "" + fileName });
});

router.post("/matlab", (req, res) => {
  const receivedString = req.body;
  // Handle the received string from MATLAB
  matlabMessage = receivedString;
  res.json({ message: "MATLAB: " + matlabMessage});
});

router.get("/matlab", (req, res) => {
  res.json({message: "" + matlabMessage});
});

// Use the router to handle requests to the `/.netlify/functions/api` path
app.use(`/.netlify/functions/api`, router);

// Export the app and the serverless function
module.exports = app;
module.exports.handler = serverless(app);