const app = require("./src/api");

const port = Number.parseInt(process.env.PORT || "3000", 10);

app.listen(port, () => {
  console.log(`Bridge service is listening on port ${port}`);
});
