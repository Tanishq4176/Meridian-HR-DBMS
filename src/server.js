require('dotenv').config();
const app = require('./app');
const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, () => {
  console.log(`Meridian HR is running at http://localhost:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});
